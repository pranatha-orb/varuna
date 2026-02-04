import { Keypair } from '@solana/web3.js';
import { PositionMonitor } from '../services/monitor';
import {
  VarunaConfig,
  VarunaEvents,
  Protocol,
  Autonomy,
  CheckEvent,
  ProtectionEvent,
  ErrorEvent,
} from './types';
import {
  RiskAssessment,
  WalletRiskAssessment,
  ProtectionOption,
  ProtectionResult,
  LendingPosition,
  CollateralAnalysis,
} from '../types';

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
const ALL_PROTOCOLS: Protocol[] = ['kamino', 'marginfi', 'solend'];

export class VarunaGuardian {
  private monitor: PositionMonitor;
  private walletAddress: string;
  private keypair: Keypair | null;
  private protocols: Protocol[];
  private autonomy: Autonomy;
  private monitorInterval: number;
  private running = false;
  private intervalHandle: NodeJS.Timeout | null = null;

  // Event listeners
  private listeners: Partial<{ [K in keyof VarunaEvents]: VarunaEvents[K][] }> = {};

  constructor(config: VarunaConfig) {
    // Parse wallet
    if (typeof config.wallet === 'string') {
      this.walletAddress = config.wallet;
      this.keypair = null;
    } else {
      this.keypair = config.wallet;
      this.walletAddress = config.wallet.publicKey.toBase58();
    }

    this.protocols = config.protocols || ALL_PROTOCOLS;
    this.autonomy = config.strategy?.autonomy || 'monitor-only';
    this.monitorInterval = config.monitorInterval || 30000;

    // Initialize monitor
    const rpcUrl = config.rpcUrl || DEFAULT_RPC;
    this.monitor = new PositionMonitor(rpcUrl);

    // Configure protection engine
    const strategy = config.strategy;
    if (strategy) {
      this.monitor.protectionEngine.updateConfig({
        targetHealthFactor: strategy.targetHealthFactor || 1.5,
        maxProtectionUsd: strategy.maxProtectionUsd || 10000,
        dryRun: this.autonomy === 'monitor-only' || !this.keypair,
        preferredStrategy: strategy.yieldAwareProtection === false
          ? 'speed-optimized'
          : (strategy.preferredStrategy || 'yield-optimized'),
      });
    }

    // Add wallet to watchlist
    this.monitor.addWallet({
      wallet: this.walletAddress,
      protocols: this.protocols,
      healthThreshold: 1.2,
      autoProtect: false, // We handle auto-protect in our own loop
      protectionStrategy: 'both',
      maxProtectionAmount: strategy?.maxProtectionUsd || 10000,
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`[Varuna SDK] Guardian started for ${this.walletAddress}`);
    console.log(`[Varuna SDK] Mode: ${this.autonomy} | Protocols: ${this.protocols.join(', ')} | Interval: ${this.monitorInterval}ms`);

    // Run first check immediately
    await this.runCheck();

    // Start interval
    this.intervalHandle = setInterval(() => this.runCheck(), this.monitorInterval);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    console.log('[Varuna SDK] Guardian stopped');
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ─── Event System ────────────────────────────────────────────────

  on<K extends keyof VarunaEvents>(event: K, listener: VarunaEvents[K]): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    (this.listeners[event] as VarunaEvents[K][]).push(listener);
    return this;
  }

  off<K extends keyof VarunaEvents>(event: K, listener: VarunaEvents[K]): this {
    const arr = this.listeners[event] as VarunaEvents[K][] | undefined;
    if (arr) {
      const idx = arr.indexOf(listener);
      if (idx >= 0) arr.splice(idx, 1);
    }
    return this;
  }

  private emit<K extends keyof VarunaEvents>(event: K, data: Parameters<VarunaEvents[K]>[0]): void {
    const arr = this.listeners[event] as VarunaEvents[K][] | undefined;
    if (arr) {
      for (const fn of arr) {
        try {
          (fn as (data: Parameters<VarunaEvents[K]>[0]) => void)(data);
        } catch (e) {
          console.error(`[Varuna SDK] Error in ${event} listener:`, e);
        }
      }
    }
  }

  // ─── Core Loop ───────────────────────────────────────────────────

  private async runCheck(): Promise<void> {
    try {
      // 1. Fetch positions and assess risk
      const { positions, alerts, riskAssessments } = await this.monitor.checkHealth(this.walletAddress);
      const walletRisk = this.monitor.riskEngine.assessWallet(positions);

      // 2. Emit check event
      this.emit('check', {
        wallet: this.walletAddress,
        positions,
        risk: walletRisk,
        timestamp: new Date(),
      });

      // 3. Emit alerts
      for (const alert of alerts) {
        this.emit('alert', alert);
      }

      // 4. Handle protection for at-risk positions
      for (let i = 0; i < positions.length; i++) {
        const assessment = riskAssessments[i];
        if (!assessment) continue;

        if (assessment.riskLevel === 'critical' || assessment.riskLevel === 'high') {
          await this.handleProtection(positions[i], assessment);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', { wallet: this.walletAddress, error: err, context: 'check' });
    }
  }

  private async handleProtection(position: LendingPosition, assessment: RiskAssessment): Promise<void> {
    const options = this.monitor.protectionEngine.evaluateOptions(position, assessment);
    const selected = options.length > 0 ? options[0] : null;

    if (this.autonomy === 'monitor-only') {
      // Just emit — no execution
      this.emit('protection', {
        wallet: this.walletAddress,
        protocol: position.protocol,
        riskLevel: assessment.riskLevel,
        options,
        selectedOption: selected,
        result: null,
      });
      return;
    }

    if (this.autonomy === 'approve') {
      // Emit with approve callback — agent decides
      const approveCallback = async (): Promise<ProtectionResult> => {
        return this.monitor.protectionEngine.protect(position, assessment, this.keypair || undefined);
      };

      this.emit('protection', {
        wallet: this.walletAddress,
        protocol: position.protocol,
        riskLevel: assessment.riskLevel,
        options,
        selectedOption: selected,
        result: null,
        approve: approveCallback,
      });
      return;
    }

    // full-auto: execute immediately
    const result = await this.monitor.protectionEngine.protect(position, assessment, this.keypair || undefined);
    this.emit('protection', {
      wallet: this.walletAddress,
      protocol: position.protocol,
      riskLevel: assessment.riskLevel,
      options,
      selectedOption: selected,
      result,
    });
  }

  // ─── Query API (instance methods) ────────────────────────────────

  async getPositions(): Promise<LendingPosition[]> {
    return this.monitor.getAllPositions(this.walletAddress);
  }

  async assessRisk(): Promise<WalletRiskAssessment> {
    return this.monitor.assessRisk(this.walletAddress);
  }

  async assessProtocol(protocol: Protocol): Promise<RiskAssessment | null> {
    const position = await this.monitor.getPosition(this.walletAddress, protocol);
    if (!position) return null;
    return this.monitor.riskEngine.assessPosition(position);
  }

  async evaluateProtection(protocol: Protocol): Promise<{ options: ProtectionOption[]; assessment: RiskAssessment } | null> {
    return this.monitor.evaluateProtection(this.walletAddress, protocol);
  }

  async protect(protocol: Protocol): Promise<ProtectionResult | null> {
    return this.monitor.executeProtection(this.walletAddress, protocol);
  }

  getProtectionLog(): ProtectionResult[] {
    return this.monitor.getProtectionLog();
  }

  async analyzeCollateral(protocol?: Protocol): Promise<CollateralAnalysis[]> {
    return this.monitor.analyzeCollateral(this.walletAddress, protocol);
  }

  getStatus() {
    return {
      running: this.running,
      wallet: this.walletAddress,
      autonomy: this.autonomy,
      protocols: this.protocols,
      ...this.monitor.getStatus(),
    };
  }
}
