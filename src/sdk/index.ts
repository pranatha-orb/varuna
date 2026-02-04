import { VarunaGuardian } from './guardian';
import { VarunaConfig, Protocol } from './types';
import { PositionMonitor } from '../services/monitor';
import {
  WalletRiskAssessment,
  RiskAssessment,
  ProtectionOption,
  CollateralAnalysis,
} from '../types';

const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';

/**
 * Varuna — DeFi Risk Infrastructure for Solana Agents
 *
 * Usage (3 lines):
 * ```ts
 * const guardian = new Varuna({ wallet: agentWallet, strategy: { autonomy: 'full-auto' } });
 * await guardian.start(); // Done.
 * ```
 *
 * Or use static methods for one-off queries:
 * ```ts
 * const risk = await Varuna.assessRisk('WALLET_ADDRESS');
 * const options = await Varuna.evaluateProtection('WALLET_ADDRESS', 'kamino');
 * ```
 */
export class Varuna extends VarunaGuardian {
  constructor(config: VarunaConfig) {
    super(config);
  }

  // ─── Static Query API ────────────────────────────────────────────
  // For agents that just want to query risk data without running a guardian.

  private static _sharedMonitor: PositionMonitor | null = null;
  private static _rpcUrl: string = DEFAULT_RPC;

  /** Configure the RPC endpoint for static queries */
  static configure(options: { rpcUrl?: string }): void {
    if (options.rpcUrl) {
      Varuna._rpcUrl = options.rpcUrl;
      Varuna._sharedMonitor = null; // Reset to pick up new RPC
    }
  }

  private static getMonitor(): PositionMonitor {
    if (!Varuna._sharedMonitor) {
      Varuna._sharedMonitor = new PositionMonitor(Varuna._rpcUrl);
    }
    return Varuna._sharedMonitor;
  }

  /** Assess risk for all lending positions of a wallet */
  static async assessRisk(wallet: string): Promise<WalletRiskAssessment> {
    return Varuna.getMonitor().assessRisk(wallet);
  }

  /** Assess risk for a specific protocol position */
  static async assessProtocolRisk(wallet: string, protocol: Protocol): Promise<RiskAssessment | null> {
    const monitor = Varuna.getMonitor();
    const position = await monitor.getPosition(wallet, protocol);
    if (!position) return null;
    return monitor.riskEngine.assessPosition(position);
  }

  /** Evaluate protection options for a position (no execution) */
  static async evaluateProtection(wallet: string, protocol: Protocol): Promise<{
    options: ProtectionOption[];
    assessment: RiskAssessment;
  } | null> {
    return Varuna.getMonitor().evaluateProtection(wallet, protocol);
  }

  /** Analyze collateral yield optimization opportunities */
  static async analyzeCollateral(wallet: string, protocol?: Protocol): Promise<CollateralAnalysis[]> {
    return Varuna.getMonitor().analyzeCollateral(wallet, protocol);
  }

  /** Quick health check — returns risk level and score */
  static async quickCheck(wallet: string): Promise<{
    wallet: string;
    riskLevel: string;
    riskScore: number;
    healthFactors: { protocol: Protocol; hf: number }[];
    needsProtection: boolean;
  }> {
    const assessment = await Varuna.assessRisk(wallet);
    return {
      wallet,
      riskLevel: assessment.overallRiskLevel,
      riskScore: assessment.overallRiskScore,
      healthFactors: assessment.positions.map(p => ({
        protocol: p.protocol as Protocol,
        hf: p.healthFactor,
      })),
      needsProtection: assessment.overallRiskLevel === 'critical' || assessment.overallRiskLevel === 'high',
    };
  }
}

// Also export the Guardian class separately for consumers who prefer it
export { VarunaGuardian } from './guardian';

// Export all types
export type {
  VarunaConfig,
  VarunaEvents,
  Protocol,
  Autonomy,
  Strategy,
  CheckEvent,
  ProtectionEvent,
  ErrorEvent,
  RiskQuery,
  ProtectionQuery,
  RiskLevel,
  RiskAssessment,
  WalletRiskAssessment,
  ProtectionOption,
  ProtectionResult,
  LendingPosition,
  AlertEvent,
  CollateralAnalysis,
  CollateralRecommendation,
  LiquidationEvent,
  LiquidationStats,
} from './types';
