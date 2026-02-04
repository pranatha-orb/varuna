import {
  LendingPosition,
  CollateralAsset,
  AssetYieldProfile,
  CollateralRecommendation,
  CollateralAnalysis,
} from '../types';

// ─── Solana Asset Registry ─────────────────────────────────────────
// Real mint addresses + approximate yield data for Solana DeFi assets.
// In production these would be fetched from on-chain / APIs.

const ASSET_REGISTRY: Record<string, Omit<AssetYieldProfile, 'accepted' | 'liquidationThreshold'>> = {
  // Native
  SOL: {
    mint: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    supplyAPY: 0.035,
    stakingAPY: 0,
    effectiveAPY: 0.035,
    isLST: false,
  },
  // Liquid Staking Tokens (LSTs)
  mSOL: {
    mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    symbol: 'mSOL',
    supplyAPY: 0.028,
    stakingAPY: 0.072,
    effectiveAPY: 0.100,
    isLST: true,
  },
  JitoSOL: {
    mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    symbol: 'JitoSOL',
    supplyAPY: 0.030,
    stakingAPY: 0.078,
    effectiveAPY: 0.108,
    isLST: true,
  },
  bSOL: {
    mint: 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1',
    symbol: 'bSOL',
    supplyAPY: 0.025,
    stakingAPY: 0.068,
    effectiveAPY: 0.093,
    isLST: true,
  },
  INF: {
    mint: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm',
    symbol: 'INF',
    supplyAPY: 0.032,
    stakingAPY: 0.082,
    effectiveAPY: 0.114,
    isLST: true,
  },
  // Stablecoins
  USDC: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    symbol: 'USDC',
    supplyAPY: 0.055,
    stakingAPY: 0,
    effectiveAPY: 0.055,
    isLST: false,
  },
  USDT: {
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    symbol: 'USDT',
    supplyAPY: 0.048,
    stakingAPY: 0,
    effectiveAPY: 0.048,
    isLST: false,
  },
  // Other
  BONK: {
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    supplyAPY: 0.015,
    stakingAPY: 0,
    effectiveAPY: 0.015,
    isLST: false,
  },
  ETH: {
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    symbol: 'ETH',
    supplyAPY: 0.020,
    stakingAPY: 0,
    effectiveAPY: 0.020,
    isLST: false,
  },
};

// Protocol-specific acceptance & liquidation thresholds
const PROTOCOL_COLLATERAL: Record<string, Record<string, { accepted: boolean; liqThreshold: number }>> = {
  kamino: {
    SOL:     { accepted: true,  liqThreshold: 0.85 },
    mSOL:    { accepted: true,  liqThreshold: 0.80 },
    JitoSOL: { accepted: true,  liqThreshold: 0.80 },
    bSOL:    { accepted: true,  liqThreshold: 0.78 },
    INF:     { accepted: true,  liqThreshold: 0.75 },
    USDC:    { accepted: true,  liqThreshold: 0.90 },
    USDT:    { accepted: true,  liqThreshold: 0.88 },
    BONK:    { accepted: true,  liqThreshold: 0.50 },
    ETH:     { accepted: true,  liqThreshold: 0.82 },
  },
  marginfi: {
    SOL:     { accepted: true,  liqThreshold: 0.90 },
    mSOL:    { accepted: true,  liqThreshold: 0.85 },
    JitoSOL: { accepted: true,  liqThreshold: 0.85 },
    bSOL:    { accepted: true,  liqThreshold: 0.82 },
    INF:     { accepted: false, liqThreshold: 0 },
    USDC:    { accepted: true,  liqThreshold: 0.95 },
    USDT:    { accepted: true,  liqThreshold: 0.92 },
    BONK:    { accepted: true,  liqThreshold: 0.40 },
    ETH:     { accepted: true,  liqThreshold: 0.85 },
  },
  solend: {
    SOL:     { accepted: true,  liqThreshold: 0.85 },
    mSOL:    { accepted: true,  liqThreshold: 0.80 },
    JitoSOL: { accepted: true,  liqThreshold: 0.80 },
    bSOL:    { accepted: true,  liqThreshold: 0.78 },
    INF:     { accepted: false, liqThreshold: 0 },
    USDC:    { accepted: true,  liqThreshold: 0.90 },
    USDT:    { accepted: true,  liqThreshold: 0.88 },
    BONK:    { accepted: false, liqThreshold: 0 },
    ETH:     { accepted: true,  liqThreshold: 0.82 },
  },
};

const MIN_SAFE_HF = 1.25; // Don't recommend swaps that drop HF below this

export class CollateralAnalyzer {

  // ─── Main API ────────────────────────────────────────────────────

  /**
   * Analyze a position's collateral and recommend higher-yield alternatives.
   */
  analyzePosition(position: LendingPosition): CollateralAnalysis {
    const totalDebt = position.debt.reduce((s, d) => s + d.valueUsd, 0);
    const totalCollateral = position.collateral.reduce((s, c) => s + c.valueUsd, 0);

    // 1. Calculate current yield
    const currentYield = this.calculateCurrentYield(position);

    // 2. Find recommendations per collateral asset
    const recommendations: CollateralRecommendation[] = [];

    for (const asset of position.collateral) {
      const recs = this.findBetterAlternatives(asset, position);
      recommendations.push(...recs);
    }

    // Sort: highest annual gain first
    recommendations.sort((a, b) => b.annualGainUsd - a.annualGainUsd);

    // 3. Calculate optimized yield (if ALL recommendations were applied)
    const optimizedYield = this.calculateOptimizedYield(position, recommendations);

    return {
      wallet: position.wallet,
      protocol: position.protocol,
      currentYield,
      optimizedYield,
      recommendations,
      totalBoostPercent: currentYield.weightedAPY > 0
        ? ((optimizedYield.weightedAPY - currentYield.weightedAPY) / currentYield.weightedAPY) * 100
        : 0,
      totalBoostUsd: optimizedYield.annualYieldUsd - currentYield.annualYieldUsd,
      timestamp: new Date(),
    };
  }

  /**
   * Get all available collateral assets with yield profiles for a protocol.
   */
  getAvailableCollateral(protocol: 'kamino' | 'marginfi' | 'solend'): AssetYieldProfile[] {
    const protocolAssets = PROTOCOL_COLLATERAL[protocol] || {};
    const profiles: AssetYieldProfile[] = [];

    for (const [symbol, base] of Object.entries(ASSET_REGISTRY)) {
      const pConfig = protocolAssets[symbol];
      if (!pConfig) continue;

      profiles.push({
        ...base,
        accepted: pConfig.accepted,
        liquidationThreshold: pConfig.liqThreshold,
      });
    }

    return profiles.sort((a, b) => b.effectiveAPY - a.effectiveAPY);
  }

  /**
   * Quick yield comparison: what's the best collateral for this protocol?
   */
  getYieldLeaderboard(protocol: 'kamino' | 'marginfi' | 'solend'): {
    asset: string;
    effectiveAPY: number;
    isLST: boolean;
    liquidationThreshold: number;
  }[] {
    return this.getAvailableCollateral(protocol)
      .filter(a => a.accepted)
      .map(a => ({
        asset: a.symbol,
        effectiveAPY: a.effectiveAPY,
        isLST: a.isLST,
        liquidationThreshold: a.liquidationThreshold,
      }));
  }

  // ─── Internal ────────────────────────────────────────────────────

  private calculateCurrentYield(position: LendingPosition): {
    totalCollateralUsd: number;
    weightedAPY: number;
    annualYieldUsd: number;
  } {
    const totalCollateral = position.collateral.reduce((s, c) => s + c.valueUsd, 0);
    if (totalCollateral === 0) {
      return { totalCollateralUsd: 0, weightedAPY: 0, annualYieldUsd: 0 };
    }

    let weightedSum = 0;
    for (const asset of position.collateral) {
      const profile = this.resolveAssetProfile(asset.symbol);
      const apy = profile ? profile.effectiveAPY : 0.02; // fallback 2%
      weightedSum += apy * asset.valueUsd;
    }

    const weightedAPY = weightedSum / totalCollateral;

    return {
      totalCollateralUsd: totalCollateral,
      weightedAPY,
      annualYieldUsd: weightedSum,
    };
  }

  private findBetterAlternatives(
    asset: CollateralAsset,
    position: LendingPosition,
  ): CollateralRecommendation[] {
    const currentProfile = this.resolveAssetProfile(asset.symbol);
    const currentAPY = currentProfile ? currentProfile.effectiveAPY : 0.02;
    const protocol = position.protocol;
    const protocolAssets = PROTOCOL_COLLATERAL[protocol] || {};
    const totalDebt = position.debt.reduce((s, d) => s + d.valueUsd, 0);
    const totalCollateral = position.collateral.reduce((s, c) => s + c.valueUsd, 0);

    const recommendations: CollateralRecommendation[] = [];

    for (const [symbol, base] of Object.entries(ASSET_REGISTRY)) {
      // Skip same asset
      if (symbol === asset.symbol) continue;

      const pConfig = protocolAssets[symbol];
      if (!pConfig || !pConfig.accepted) continue;

      // Only recommend if yield is better
      if (base.effectiveAPY <= currentAPY) continue;

      // Calculate health factor impact
      // Swapping collateral changes the liquidation threshold
      const currentLiqThreshold = position.liquidationThreshold;
      const newLiqThreshold = pConfig.liqThreshold;

      // Simplified: assume swapping this asset changes the weighted liq threshold
      const otherCollateralValue = totalCollateral - asset.valueUsd;
      const weightedNewThreshold = totalCollateral > 0
        ? (otherCollateralValue * currentLiqThreshold + asset.valueUsd * newLiqThreshold) / totalCollateral
        : newLiqThreshold;

      const projectedHF = totalDebt > 0
        ? (totalCollateral * weightedNewThreshold) / totalDebt
        : 999;

      const safe = projectedHF >= MIN_SAFE_HF;
      const yieldBoostAbsolute = base.effectiveAPY - currentAPY;
      const yieldBoostPercent = currentAPY > 0 ? (yieldBoostAbsolute / currentAPY) * 100 : 0;
      const annualGain = asset.valueUsd * yieldBoostAbsolute;

      let riskNote: string | null = null;
      if (newLiqThreshold < currentLiqThreshold) {
        const diff = ((currentLiqThreshold - newLiqThreshold) * 100).toFixed(0);
        riskNote = `${symbol} has ${diff}pp lower liquidation threshold (${(newLiqThreshold * 100).toFixed(0)}% vs ${(currentLiqThreshold * 100).toFixed(0)}%)`;
      }

      recommendations.push({
        fromAsset: asset.symbol,
        fromAPY: currentAPY,
        toAsset: symbol,
        toAPY: base.effectiveAPY,
        yieldBoostPercent,
        yieldBoostAbsolutePercent: yieldBoostAbsolute * 100,
        annualGainUsd: annualGain,
        healthImpact: {
          currentHF: position.healthFactor,
          projectedHF,
          safe,
        },
        riskNote,
      });
    }

    // Sort by annual gain, filter only safe
    return recommendations
      .filter(r => r.healthImpact.safe)
      .sort((a, b) => b.annualGainUsd - a.annualGainUsd);
  }

  private calculateOptimizedYield(
    position: LendingPosition,
    recommendations: CollateralRecommendation[],
  ): { weightedAPY: number; annualYieldUsd: number } {
    // Build an optimized map: for each collateral asset, use the best recommendation
    const bestSwap = new Map<string, CollateralRecommendation>();
    for (const rec of recommendations) {
      const existing = bestSwap.get(rec.fromAsset);
      if (!existing || rec.annualGainUsd > existing.annualGainUsd) {
        bestSwap.set(rec.fromAsset, rec);
      }
    }

    const totalCollateral = position.collateral.reduce((s, c) => s + c.valueUsd, 0);
    if (totalCollateral === 0) return { weightedAPY: 0, annualYieldUsd: 0 };

    let optimizedYieldSum = 0;
    for (const asset of position.collateral) {
      const swap = bestSwap.get(asset.symbol);
      const apy = swap ? swap.toAPY : (this.resolveAssetProfile(asset.symbol)?.effectiveAPY || 0.02);
      optimizedYieldSum += apy * asset.valueUsd;
    }

    return {
      weightedAPY: optimizedYieldSum / totalCollateral,
      annualYieldUsd: optimizedYieldSum,
    };
  }

  private resolveAssetProfile(symbol: string): typeof ASSET_REGISTRY[string] | null {
    // Direct match
    if (ASSET_REGISTRY[symbol]) return ASSET_REGISTRY[symbol];

    // Fuzzy match (e.g. "COLLATERAL" → SOL as fallback)
    const upper = symbol.toUpperCase();
    for (const [key, profile] of Object.entries(ASSET_REGISTRY)) {
      if (key.toUpperCase() === upper) return profile;
    }

    return null;
  }
}
