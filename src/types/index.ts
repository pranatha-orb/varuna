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
