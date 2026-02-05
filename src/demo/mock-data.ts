/**
 * Mock data for Varuna demo
 * Use this when you don't have a real wallet with lending positions
 */

import { LendingPosition, LiquidationEvent } from '../types';

// Demo wallet address
export const DEMO_WALLET = '7xKpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd';

// Scenario: User has SOL collateral, borrowed USDC, health dropping
export function createMockPosition(
  healthFactor: number = 1.18,
  protocol: 'kamino' | 'marginfi' | 'solend' = 'kamino'
): LendingPosition {
  const solPrice = 138; // $138 per SOL
  const solAmount = 100;
  const collateralUsd = solAmount * solPrice;
  const debtUsd = 10000;

  return {
    wallet: DEMO_WALLET,
    protocol,
    healthFactor,
    liquidationThreshold: 0.85,
    collateral: [
      {
        symbol: 'SOL',
        mint: 'So11111111111111111111111111111111111111112',
        amount: solAmount,
        valueUsd: collateralUsd,
      },
    ],
    debt: [
      {
        symbol: 'USDC',
        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        amount: debtUsd,
        valueUsd: debtUsd,
        interestRate: 0.085, // 8.5% borrow rate
      },
    ],
    lastUpdated: new Date(),
  };
}

// Create positions across multiple protocols
export function createMockPositions(): LendingPosition[] {
  return [
    createMockPosition(1.18, 'kamino'),
    createMockPosition(1.85, 'marginfi'),
    createMockPosition(2.1, 'solend'),
  ];
}

// Helper to calculate derived properties from a position
export function getPositionMetrics(position: LendingPosition) {
  const totalCollateralUsd = position.collateral.reduce((s, c) => s + c.valueUsd, 0);
  const totalDebtUsd = position.debt.reduce((s, d) => s + d.valueUsd, 0);
  const ltv = totalCollateralUsd > 0 ? totalDebtUsd / totalCollateralUsd : 0;

  return {
    totalCollateralUsd,
    totalDebtUsd,
    ltv,
    netApy: 0.105, // Mock leveraged yield
  };
}

// Scenario progression: health factor dropping over time
export function createHealthDropScenario(): { timestamp: number; healthFactor: number }[] {
  const now = Date.now();
  return [
    { timestamp: now - 300000, healthFactor: 1.50 }, // 5 min ago
    { timestamp: now - 240000, healthFactor: 1.45 },
    { timestamp: now - 180000, healthFactor: 1.38 },
    { timestamp: now - 120000, healthFactor: 1.28 },
    { timestamp: now - 60000,  healthFactor: 1.22 },
    { timestamp: now,          healthFactor: 1.18 }, // Now - critical
  ];
}

// Mock liquidation events for the feed
export function createMockLiquidations(): LiquidationEvent[] {
  const now = Date.now();
  return [
    {
      id: 'liq-001',
      protocol: 'kamino',
      wallet: '3xYz9aB7cD2eF1gH4iJ5kL6mN7oP8qR9sT0u',
      liquidator: 'MEVBot7xAb3Cd4Ef5Gh6Ij7Kl8Mn9Op0Qr',
      collateralAsset: 'SOL',
      debtAsset: 'USDC',
      collateralSeized: 6238,
      debtRepaid: 5200,
      penalty: 312,
      txSignature: '5xYpQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd7kLm',
      slot: 245678901,
      timestamp: new Date(now - 120000),
    },
    {
      id: 'liq-002',
      protocol: 'marginfi',
      wallet: '9aKl2mN3oP4qR5sT6uV7wX8yZ9aB0cD1eF',
      liquidator: 'JitoBundleXyZ123AbC456DeF789GhI',
      collateralAsset: 'USDC',
      debtAsset: 'SOL',
      collateralSeized: 12500,
      debtRepaid: 10005,
      penalty: 625,
      txSignature: '7nKdQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd9pLn',
      slot: 245678956,
      timestamp: new Date(now - 60000),
    },
    {
      id: 'liq-003',
      protocol: 'solend',
      wallet: '1bCd2eF3gH4iJ5kL6mN7oP8qR9sT0uV1wX',
      liquidator: 'MEVBot7xAb3Cd4Ef5Gh6Ij7Kl8Mn9Op0Qr',
      collateralAsset: 'mSOL',
      debtAsset: 'USDC',
      collateralSeized: 4100,
      debtRepaid: 3400,
      penalty: 205,
      txSignature: '3pMnQvRn8kLmNpTsWzJ4fYbGhU2cXdE9aM3nYd5rKp',
      slot: 245679012,
      timestamp: new Date(now - 30000),
    },
  ];
}

// Mock liquidation stats
export function createMockLiquidationStats() {
  return {
    last24h: {
      count: 847,
      totalValueUsd: 2340000,
      byProtocol: {
        kamino: { count: 412, valueUsd: 1200000 },
        marginfi: { count: 298, valueUsd: 890000 },
        solend: { count: 137, valueUsd: 250000 },
      },
    },
    last7d: {
      count: 5234,
      totalValueUsd: 15600000,
      byProtocol: {
        kamino: { count: 2456, valueUsd: 7200000 },
        marginfi: { count: 1823, valueUsd: 5400000 },
        solend: { count: 955, valueUsd: 3000000 },
      },
    },
    topLiquidators: [
      { address: 'MEVBot7xAb3Cd4Ef5Gh6Ij7Kl8Mn9Op0Qr', count: 156, valueUsd: 450000 },
      { address: 'JitoBundleXyZ123AbC456DeF789GhI', count: 89, valueUsd: 320000 },
      { address: 'LiqBot3xYz9aB7cD2eF1gH4iJ5kL6mN7', count: 67, valueUsd: 180000 },
    ],
    averageLiquidationSize: 2762,
    largestLiquidation: {
      valueUsd: 125000,
      protocol: 'marginfi',
      timestamp: new Date(Date.now() - 3600000),
    },
  };
}

// Collateral yield recommendations
export function createMockYieldRecommendations() {
  return {
    currentCollateral: {
      asset: 'SOL',
      amount: 100,
      valueUsd: 13800,
      currentYield: 0.05,
    },
    recommendations: [
      {
        toAsset: 'mSOL',
        projectedYield: 0.085,
        yieldBoostPercent: 70,
        annualGainUsd: 483,
        reason: 'Marinade staked SOL - highest LST yield',
      },
      {
        toAsset: 'JitoSOL',
        projectedYield: 0.072,
        yieldBoostPercent: 44,
        annualGainUsd: 304,
        reason: 'Jito MEV rewards included',
      },
      {
        toAsset: 'bSOL',
        projectedYield: 0.068,
        yieldBoostPercent: 36,
        annualGainUsd: 248,
        reason: 'Blaze staked SOL',
      },
    ],
  };
}

// Demo mode configuration
export interface DemoConfig {
  enabled: boolean;
  initialHealthFactor: number;
  healthDropRate: number; // HF drop per second
  autoTriggerProtection: boolean;
  protectionDelay: number; // ms before "executing" protection
}

export const DEFAULT_DEMO_CONFIG: DemoConfig = {
  enabled: true,
  initialHealthFactor: 1.50,
  healthDropRate: 0.001, // Drop 0.001 per second = ~0.06 per minute
  autoTriggerProtection: true,
  protectionDelay: 2000,
};

/**
 * Demo state manager - simulates health factor dropping and protection
 */
export class DemoStateManager {
  private healthFactor: number;
  private config: DemoConfig;
  private startTime: number;
  private protected: boolean = false;

  constructor(config: Partial<DemoConfig> = {}) {
    this.config = { ...DEFAULT_DEMO_CONFIG, ...config };
    this.healthFactor = this.config.initialHealthFactor;
    this.startTime = Date.now();
  }

  getCurrentHealthFactor(): number {
    if (this.protected) {
      return 1.52; // Post-protection HF
    }

    const elapsed = (Date.now() - this.startTime) / 1000;
    const dropped = this.config.initialHealthFactor - (elapsed * this.config.healthDropRate);
    return Math.max(1.05, dropped); // Don't go below 1.05 (pre-liquidation)
  }

  getPosition(): LendingPosition {
    return createMockPosition(this.getCurrentHealthFactor(), 'kamino');
  }

  triggerProtection(): void {
    this.protected = true;
  }

  reset(): void {
    this.healthFactor = this.config.initialHealthFactor;
    this.startTime = Date.now();
    this.protected = false;
  }

  isProtected(): boolean {
    return this.protected;
  }
}
