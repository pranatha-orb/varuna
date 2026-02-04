import { Keypair } from '@solana/web3.js';
import {
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
} from '../types';

// ─── SDK Configuration ─────────────────────────────────────────────

export type Protocol = 'kamino' | 'marginfi' | 'solend';
export type Autonomy = 'full-auto' | 'approve' | 'monitor-only';
export type Strategy = 'yield-optimized' | 'cost-optimized' | 'speed-optimized';

export interface VarunaConfig {
  /** Agent wallet (address string or Keypair for auto-execution) */
  wallet: string | Keypair;
  /** Protocols to monitor (default: all three) */
  protocols?: Protocol[];
  /** RPC endpoint (default: mainnet) */
  rpcUrl?: string;
  /** Protection strategy */
  strategy?: {
    /** Autonomy level:
     * - full-auto: evaluate + execute protection automatically
     * - approve: evaluate options, call onProtection callback before executing
     * - monitor-only: monitor + assess risk, no protection execution
     */
    autonomy?: Autonomy;
    /** Enable yield-aware option selection (default: true) */
    yieldAwareProtection?: boolean;
    /** Protection strategy preference */
    preferredStrategy?: Strategy;
    /** Target health factor to restore to (default: 1.5) */
    targetHealthFactor?: number;
    /** Max USD to spend per protection event (default: 10000) */
    maxProtectionUsd?: number;
  };
  /** Monitoring interval in ms (default: 30000) */
  monitorInterval?: number;
}

// ─── Event System ──────────────────────────────────────────────────

export interface VarunaEvents {
  /** Fired on every health check cycle */
  check: (data: CheckEvent) => void;
  /** Fired when risk level changes */
  alert: (data: AlertEvent) => void;
  /** Fired when protection is evaluated (approve mode) or executed (full-auto) */
  protection: (data: ProtectionEvent) => void;
  /** Fired on any error */
  error: (data: ErrorEvent) => void;
}

export interface CheckEvent {
  wallet: string;
  positions: LendingPosition[];
  risk: WalletRiskAssessment;
  timestamp: Date;
}

export interface ProtectionEvent {
  wallet: string;
  protocol: Protocol;
  riskLevel: RiskLevel;
  options: ProtectionOption[];
  selectedOption: ProtectionOption | null;
  result: ProtectionResult | null;
  /** In approve mode: call this to execute the selected option */
  approve?: () => Promise<ProtectionResult>;
}

export interface ErrorEvent {
  wallet: string;
  error: Error;
  context: string;
}

// ─── Static Query Types ────────────────────────────────────────────

export interface RiskQuery {
  wallet: string;
  protocol?: Protocol;
}

export interface ProtectionQuery {
  wallet: string;
  protocol: Protocol;
  strategy?: Strategy;
}

// Re-export types that SDK consumers need
export type {
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
};
