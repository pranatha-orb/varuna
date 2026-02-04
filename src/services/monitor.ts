import { Connection, PublicKey } from '@solana/web3.js';
import { LendingPosition, ProtectionConfig, AlertEvent, MonitorStatus, RiskAssessment, WalletRiskAssessment, ProtectionResult, ProtectionOption, CollateralAnalysis } from '../types';
import { KaminoAdapter } from './adapters/kamino';
import { MarginFiAdapter } from './adapters/marginfi';
import { SolendAdapter } from './adapters/solend';
import { RiskEngine } from './risk-engine';
import { ProtectionEngine } from './protection-engine';
import { CollateralAnalyzer } from './collateral-analyzer';
import { WsAlertServer } from './ws-alerts';
import { LiquidationFeed } from './liquidation-feed';

export class PositionMonitor {
  private connection: Connection;
  private watchlist: Map<string, ProtectionConfig> = new Map();
  private alerts: AlertEvent[] = [];
  private protectionResults: ProtectionResult[] = [];
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;
  readonly riskEngine: RiskEngine;
  readonly protectionEngine: ProtectionEngine;
  readonly collateralAnalyzer: CollateralAnalyzer;
  readonly wsAlerts: WsAlertServer;
  readonly liquidationFeed: LiquidationFeed;

  private adapters: {
    kamino: KaminoAdapter;
    marginfi: MarginFiAdapter;
    solend: SolendAdapter;
  };

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.adapters = {
      kamino: new KaminoAdapter(this.connection),
      marginfi: new MarginFiAdapter(this.connection),
      solend: new SolendAdapter(this.connection),
    };
    this.riskEngine = new RiskEngine();
    this.protectionEngine = new ProtectionEngine(this.connection);
    this.collateralAnalyzer = new CollateralAnalyzer();
    this.wsAlerts = new WsAlertServer();
    this.liquidationFeed = new LiquidationFeed(this.connection);

    // Wire liquidation events to WebSocket broadcast
    this.liquidationFeed.onLiquidation((event) => {
      this.wsAlerts.broadcastLiquidation(event);
    });
  }

  addWallet(config: ProtectionConfig): void {
    this.watchlist.set(config.wallet, config);
    console.log(`[Varuna] Added wallet ${config.wallet} to watchlist`);
  }

  removeWallet(wallet: string): void {
    this.watchlist.delete(wallet);
    console.log(`[Varuna] Removed wallet ${wallet} from watchlist`);
  }

  async getPosition(wallet: string, protocol: 'kamino' | 'marginfi' | 'solend'): Promise<LendingPosition | null> {
    const adapter = this.adapters[protocol];
    return adapter.getPosition(wallet);
  }

  async getAllPositions(wallet: string): Promise<LendingPosition[]> {
    const positions: LendingPosition[] = [];

    for (const [protocol, adapter] of Object.entries(this.adapters)) {
      try {
        const position = await adapter.getPosition(wallet);
        if (position && position.debt.length > 0) {
          positions.push(position);
        }
      } catch (error) {
        console.error(`[Varuna] Error fetching ${protocol} position for ${wallet}:`, error);
      }
    }

    return positions;
  }

  async checkHealth(wallet: string): Promise<{ positions: LendingPosition[]; alerts: AlertEvent[]; riskAssessments: RiskAssessment[] }> {
    const positions = await this.getAllPositions(wallet);
    const newAlerts: AlertEvent[] = [];
    const riskAssessments: RiskAssessment[] = [];

    for (const position of positions) {
      // Run through risk engine for smart assessment
      const assessment = this.riskEngine.assessPosition(position);
      riskAssessments.push(assessment);

      // Generate alerts based on risk level (replaces hardcoded thresholds)
      if (assessment.riskLevel === 'critical') {
        newAlerts.push({
          type: position.healthFactor <= 1.0 ? 'liquidated' : 'critical',
          wallet,
          protocol: position.protocol,
          healthFactor: position.healthFactor,
          message: position.healthFactor <= 1.0
            ? `Position liquidated on ${position.protocol}`
            : `CRITICAL [score:${assessment.riskScore}]: HF ${position.healthFactor.toFixed(3)} on ${position.protocol} — ${assessment.recommendations[0]?.reason || 'immediate action needed'}`,
          timestamp: new Date(),
        });
      } else if (assessment.riskLevel === 'high') {
        newAlerts.push({
          type: 'critical',
          wallet,
          protocol: position.protocol,
          healthFactor: position.healthFactor,
          message: `HIGH RISK [score:${assessment.riskScore}]: HF ${position.healthFactor.toFixed(3)} on ${position.protocol} — ${assessment.recommendations[0]?.reason || 'action recommended'}`,
          timestamp: new Date(),
        });
      } else if (assessment.riskLevel === 'medium') {
        newAlerts.push({
          type: 'warning',
          wallet,
          protocol: position.protocol,
          healthFactor: position.healthFactor,
          message: `WARNING [score:${assessment.riskScore}]: HF ${position.healthFactor.toFixed(3)} on ${position.protocol} — monitoring`,
          timestamp: new Date(),
        });
      }
    }

    this.alerts.push(...newAlerts);
    return { positions, alerts: newAlerts, riskAssessments };
  }

  async assessRisk(wallet: string): Promise<WalletRiskAssessment> {
    const positions = await this.getAllPositions(wallet);
    return this.riskEngine.assessWallet(positions);
  }

  start(intervalMs = 30000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[Varuna] Starting monitor with ${intervalMs}ms interval`);

    this.checkInterval = setInterval(async () => {
      for (const [wallet, config] of this.watchlist) {
        try {
          const { alerts, riskAssessments, positions } = await this.checkHealth(wallet);

          // Broadcast health check to WS subscribers
          this.wsAlerts.broadcastHealthCheck(wallet, {
            positions: riskAssessments.map(a => ({
              protocol: a.protocol,
              healthFactor: a.healthFactor,
              riskLevel: a.riskLevel,
            })),
          });

          // Broadcast risk updates
          for (const assessment of riskAssessments) {
            if (assessment.riskLevel !== 'safe') {
              this.wsAlerts.broadcastRiskUpdate(wallet, assessment);
            }
          }

          if (alerts.length > 0) {
            console.log(`[Varuna] Alerts for ${wallet}:`, alerts.map(a => a.message));

            // Broadcast alerts to WS subscribers
            for (const alert of alerts) {
              this.wsAlerts.broadcastAlert(alert);
            }

            // Auto-protect if enabled
            if (config.autoProtect) {
              for (let i = 0; i < positions.length; i++) {
                const assessment = riskAssessments[i];
                if (assessment && (assessment.riskLevel === 'critical' || assessment.riskLevel === 'high')) {
                  console.log(`[Varuna] Auto-protecting ${wallet} on ${positions[i].protocol}...`);
                  const result = await this.protectionEngine.protect(positions[i], assessment);
                  this.protectionResults.push(result);

                  // Broadcast protection execution
                  this.wsAlerts.broadcastProtection(wallet, result);
                }
              }
            }
          }
        } catch (error) {
          console.error(`[Varuna] Error checking ${wallet}:`, error);
        }
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[Varuna] Monitor stopped');
  }

  getStatus(): MonitorStatus {
    return {
      isRunning: this.isRunning,
      watchedWallets: this.watchlist.size,
      lastCheck: new Date(),
      alertsTriggered: this.alerts.length,
      protectionActionsExecuted: this.protectionResults.filter(r => r.success).length,
    };
  }

  getAlerts(wallet?: string): AlertEvent[] {
    if (wallet) {
      return this.alerts.filter(a => a.wallet === wallet);
    }
    return this.alerts;
  }

  /**
   * Evaluate protection options for a specific position (no execution).
   */
  async evaluateProtection(wallet: string, protocol: 'kamino' | 'marginfi' | 'solend'): Promise<{ options: ProtectionOption[]; assessment: RiskAssessment } | null> {
    const position = await this.getPosition(wallet, protocol);
    if (!position) return null;

    const assessment = this.riskEngine.assessPosition(position);
    const options = this.protectionEngine.evaluateOptions(position, assessment);
    return { options, assessment };
  }

  /**
   * Execute protection for a specific position (dry run by default).
   */
  async executeProtection(wallet: string, protocol: 'kamino' | 'marginfi' | 'solend'): Promise<ProtectionResult | null> {
    const position = await this.getPosition(wallet, protocol);
    if (!position) return null;

    const assessment = this.riskEngine.assessPosition(position);
    const result = await this.protectionEngine.protect(position, assessment);
    this.protectionResults.push(result);
    return result;
  }

  getProtectionLog(): ProtectionResult[] {
    return [...this.protectionResults];
  }

  /**
   * Analyze collateral yield optimization opportunities.
   */
  async analyzeCollateral(wallet: string, protocol?: 'kamino' | 'marginfi' | 'solend'): Promise<CollateralAnalysis[]> {
    if (protocol) {
      const position = await this.getPosition(wallet, protocol);
      if (!position) return [];
      return [this.collateralAnalyzer.analyzePosition(position)];
    }

    const positions = await this.getAllPositions(wallet);
    return positions.map(p => this.collateralAnalyzer.analyzePosition(p));
  }
}
