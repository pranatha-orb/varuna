export interface LendingPosition {
  protocol: 'kamino' | 'marginfi' | 'solend';
  wallet: string;
  collateral: CollateralAsset[];
  debt: DebtAsset[];
  healthFactor: number;
  liquidationThreshold: number;
  lastUpdated: Date;
}

export interface CollateralAsset {
  mint: string;
  symbol: string;
  amount: number;
  valueUsd: number;
}

export interface DebtAsset {
  mint: string;
  symbol: string;
  amount: number;
  valueUsd: number;
  interestRate: number;
}

export interface ProtectionConfig {
  wallet: string;
  protocols: ('kamino' | 'marginfi' | 'solend')[];
  healthThreshold: number; // Alert when health drops below this
  autoProtect: boolean;
  protectionStrategy: 'repay' | 'add-collateral' | 'both';
  maxProtectionAmount: number; // Max USD to use for protection
}

export interface AlertEvent {
  type: 'warning' | 'critical' | 'liquidated';
  wallet: string;
  protocol: string;
  healthFactor: number;
  message: string;
  timestamp: Date;
}

export interface ProtectionAction {
  type: 'repay' | 'add-collateral';
  wallet: string;
  protocol: string;
  asset: string;
  amount: number;
  txSignature?: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: Date;
}

export interface MonitorStatus {
  isRunning: boolean;
  watchedWallets: number;
  lastCheck: Date;
  alertsTriggered: number;
  protectionActionsExecuted: number;
}

// ─── Risk Engine Types ──────────────────────────────────────────────

export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface RiskFactor {
  name: string;
  score: number;      // 0-100, higher = riskier
  weight: number;     // 0-1, contribution to total
  detail: string;
}

export interface ProtectionRecommendation {
  action: 'repay' | 'add-collateral' | 'unwind' | 'none';
  urgency: 'immediate' | 'soon' | 'monitor';
  asset?: string;
  amount?: number;
  reason: string;
}

export interface RiskAssessment {
  wallet: string;
  protocol: 'kamino' | 'marginfi' | 'solend';
  riskLevel: RiskLevel;
  riskScore: number;           // 0-100, composite score
  healthFactor: number;
  factors: RiskFactor[];
  recommendations: ProtectionRecommendation[];
  timestamp: Date;
}

export interface WalletRiskAssessment {
  wallet: string;
  overallRiskLevel: RiskLevel;
  overallRiskScore: number;
  positions: RiskAssessment[];
  crossProtocolRisk: RiskFactor | null;
  recommendations: ProtectionRecommendation[];
  timestamp: Date;
}

export interface HealthSnapshot {
  healthFactor: number;
  timestamp: number;
}

// ─── Protection Engine Types ────────────────────────────────────────

export interface YieldImpact {
  currentAPY: number;           // Current effective yield %
  projectedAPY: number;         // Yield after protection action
  yieldDeltaPercent: number;    // Relative change: (projected-current)/current * 100
  annualizedCostUsd: number;    // USD lost per year from yield reduction
}

export interface ProtectionOption {
  id: string;
  action: 'repay' | 'add-collateral' | 'unwind';
  protocol: 'kamino' | 'marginfi' | 'solend';
  // What the action does
  asset: string;
  amount: number;             // Amount of asset involved
  amountUsd: number;          // USD value
  // Resulting position state
  resultingHF: number;
  resultingDebtUsd: number;
  resultingCollateralUsd: number;
  // Yield analysis
  yieldImpact: YieldImpact;
  // Total cost (capital deployed + yield loss annualized)
  capitalCostUsd: number;       // Immediate capital needed
  yieldCostAnnualUsd: number;   // Annual yield lost
  totalScoreUsd: number;        // Composite cost score for ranking
  // Viability
  viable: boolean;
  reason: string;
}

export interface ProtectionResult {
  success: boolean;
  option: ProtectionOption;
  txSignature?: string;
  executionTimeMs: number;
  previousHF: number;
  newHF?: number;
  error?: string;
  dryRun: boolean;
  timestamp: Date;
}

export interface ProtectionEngineConfig {
  targetHealthFactor: number;       // HF to restore to (default 1.5)
  maxProtectionUsd: number;         // Max USD to spend per protection event
  dryRun: boolean;                  // Simulate only, don't send tx
  preferredStrategy: 'balanced' | 'yield-optimized' | 'cost-optimized' | 'speed-optimized';
  // Yield assumptions for protocols (APY for supply/borrow)
  yieldRates: Record<string, { supplyAPY: number; borrowAPY: number }>;
}

// ─── Liquidation Feed Types ─────────────────────────────────────────

export interface LiquidationEvent {
  id: string;
  protocol: 'kamino' | 'marginfi' | 'solend';
  wallet: string;
  liquidator: string;
  collateralAsset: string;
  debtAsset: string;
  collateralSeized: number;       // USD
  debtRepaid: number;             // USD
  penalty: number;                // USD (liquidator bonus)
  txSignature: string;
  slot: number;
  timestamp: Date;
}

export interface LiquidationStats {
  totalEvents: number;
  totalVolumeUsd: number;
  totalPenaltiesUsd: number;
  byProtocol: Record<string, { events: number; volumeUsd: number }>;
  recentHourEvents: number;
  recentHourVolumeUsd: number;
  largestLiquidation: LiquidationEvent | null;
}

export interface LiquidationFeedConfig {
  /** How often to poll for new liquidations (ms, default 60000) */
  pollIntervalMs: number;
  /** Max events to keep in memory (default 500) */
  maxEvents: number;
  /** Protocols to scan */
  protocols: ('kamino' | 'marginfi' | 'solend')[];
}

// ─── Collateral Analyzer Types ──────────────────────────────────────

export interface AssetYieldProfile {
  mint: string;
  symbol: string;
  /** Base supply APY on the protocol */
  supplyAPY: number;
  /** Extra staking/LST yield (e.g. mSOL staking rewards) */
  stakingAPY: number;
  /** Effective total yield = supplyAPY + stakingAPY */
  effectiveAPY: number;
  /** Liquidation threshold on the protocol (0-1) */
  liquidationThreshold: number;
  /** Whether this asset is accepted as collateral */
  accepted: boolean;
  /** Is this a Liquid Staking Token? */
  isLST: boolean;
}

export interface CollateralRecommendation {
  /** Current collateral asset */
  fromAsset: string;
  fromAPY: number;
  /** Recommended replacement */
  toAsset: string;
  toAPY: number;
  /** Yield improvement */
  yieldBoostPercent: number;      // Relative: (new-old)/old * 100
  yieldBoostAbsolutePercent: number; // Absolute: new - old
  annualGainUsd: number;           // Annual USD gain from the swap
  /** Health factor impact */
  healthImpact: {
    currentHF: number;
    projectedHF: number;
    safe: boolean;                 // projectedHF >= minSafeHF
  };
  /** Risk note (e.g. lower liq threshold) */
  riskNote: string | null;
}

export interface CollateralAnalysis {
  wallet: string;
  protocol: 'kamino' | 'marginfi' | 'solend';
  /** Current state */
  currentYield: {
    totalCollateralUsd: number;
    weightedAPY: number;
    annualYieldUsd: number;
  };
  /** What could be achieved */
  optimizedYield: {
    weightedAPY: number;
    annualYieldUsd: number;
  };
  /** Per-asset recommendations */
  recommendations: CollateralRecommendation[];
  /** Summary */
  totalBoostPercent: number;       // Relative yield improvement
  totalBoostUsd: number;           // Annual USD gain
  timestamp: Date;
}

export interface RiskEngineConfig {
  // Health factor thresholds per risk level
  thresholds: {
    safe: number;       // HF above this = safe (default 2.0)
    low: number;        // HF above this = low risk (default 1.5)
    medium: number;     // HF above this = medium risk (default 1.25)
    high: number;       // HF above this = high risk (default 1.1)
    // Below high = critical
  };
  // Position size scaling: larger positions get tighter thresholds
  positionSizeScaling: boolean;
  // How many health snapshots to keep for trend detection
  trendWindowSize: number;
  // Trend detection: minimum samples before calculating velocity
  trendMinSamples: number;
}
