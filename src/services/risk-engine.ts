import {
  LendingPosition,
  RiskLevel,
  RiskFactor,
  RiskAssessment,
  WalletRiskAssessment,
  ProtectionRecommendation,
  HealthSnapshot,
  RiskEngineConfig,
} from '../types';

const DEFAULT_CONFIG: RiskEngineConfig = {
  thresholds: {
    safe: 2.0,
    low: 1.5,
    medium: 1.25,
    high: 1.1,
  },
  positionSizeScaling: true,
  trendWindowSize: 20,
  trendMinSamples: 3,
};

// Protocol-specific liquidation parameters
const PROTOCOL_PARAMS: Record<string, { closeFactor: number; liquidationPenalty: number; minHfBuffer: number }> = {
  kamino:   { closeFactor: 0.5,  liquidationPenalty: 0.05, minHfBuffer: 0.05 },
  marginfi: { closeFactor: 1.0,  liquidationPenalty: 0.05, minHfBuffer: 0.08 },
  solend:   { closeFactor: 0.5,  liquidationPenalty: 0.05, minHfBuffer: 0.05 },
};

export class RiskEngine {
  private config: RiskEngineConfig;
  // wallet:protocol → health factor history
  private healthHistory: Map<string, HealthSnapshot[]> = new Map();

  constructor(config?: Partial<RiskEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Main API ────────────────────────────────────────────────────

  assessPosition(position: LendingPosition): RiskAssessment {
    const key = `${position.wallet}:${position.protocol}`;

    // Record snapshot for trend detection
    this.recordSnapshot(key, position.healthFactor);

    // Calculate individual risk factors
    const factors: RiskFactor[] = [];

    factors.push(this.assessHealthFactor(position));
    factors.push(this.assessUtilization(position));
    factors.push(this.assessConcentration(position));
    factors.push(this.assessTrend(key, position));

    const protocolFactor = this.assessProtocolRisk(position);
    if (protocolFactor) factors.push(protocolFactor);

    // Composite score: weighted average
    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    let riskScore = Math.min(100, Math.round(
      factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight
    ));

    // Floor override: extreme health factors can't be diluted by other factors
    if (position.healthFactor <= 1.0) {
      riskScore = Math.max(riskScore, 100);
    } else if (position.healthFactor < 1.05) {
      riskScore = Math.max(riskScore, 85);
    } else if (position.healthFactor < 1.1) {
      riskScore = Math.max(riskScore, 70);
    }

    const riskLevel = this.scoreToLevel(riskScore);
    const recommendations = this.generateRecommendations(position, riskLevel, factors);

    return {
      wallet: position.wallet,
      protocol: position.protocol,
      riskLevel,
      riskScore,
      healthFactor: position.healthFactor,
      factors,
      recommendations,
      timestamp: new Date(),
    };
  }

  assessWallet(positions: LendingPosition[]): WalletRiskAssessment {
    if (positions.length === 0) {
      return {
        wallet: '',
        overallRiskLevel: 'safe',
        overallRiskScore: 0,
        positions: [],
        crossProtocolRisk: null,
        recommendations: [],
        timestamp: new Date(),
      };
    }

    const wallet = positions[0].wallet;
    const assessments = positions.map(p => this.assessPosition(p));

    // Overall score = worst position weighted heavily
    const sortedByRisk = [...assessments].sort((a, b) => b.riskScore - a.riskScore);
    const worstScore = sortedByRisk[0].riskScore;
    const avgScore = assessments.reduce((s, a) => s + a.riskScore, 0) / assessments.length;
    // Weighted: 70% worst, 30% average — a single bad position dominates
    const overallRiskScore = Math.round(worstScore * 0.7 + avgScore * 0.3);

    // Cross-protocol risk: borrowing across multiple protocols = higher risk
    const crossProtocolRisk = this.assessCrossProtocolRisk(positions);

    const overallRiskLevel = this.scoreToLevel(
      crossProtocolRisk
        ? Math.min(100, overallRiskScore + crossProtocolRisk.score * crossProtocolRisk.weight * 10)
        : overallRiskScore
    );

    // Merge and deduplicate recommendations, keep highest urgency
    const allRecs = assessments.flatMap(a => a.recommendations);
    const recommendations = this.deduplicateRecommendations(allRecs);

    return {
      wallet,
      overallRiskLevel,
      overallRiskScore,
      positions: assessments,
      crossProtocolRisk,
      recommendations,
      timestamp: new Date(),
    };
  }

  // ─── Risk Factors ────────────────────────────────────────────────

  private assessHealthFactor(position: LendingPosition): RiskFactor {
    const hf = position.healthFactor;
    const thresholds = this.getEffectiveThresholds(position);
    let score: number;

    if (hf <= 1.0) {
      score = 100; // liquidated or at liquidation
    } else if (hf < thresholds.high) {
      // 1.0 → thresholds.high maps to 90-100
      score = 90 + (1 - (hf - 1.0) / (thresholds.high - 1.0)) * 10;
    } else if (hf < thresholds.medium) {
      // thresholds.high → thresholds.medium maps to 60-90
      score = 60 + (1 - (hf - thresholds.high) / (thresholds.medium - thresholds.high)) * 30;
    } else if (hf < thresholds.low) {
      // thresholds.medium → thresholds.low maps to 30-60
      score = 30 + (1 - (hf - thresholds.medium) / (thresholds.low - thresholds.medium)) * 30;
    } else if (hf < thresholds.safe) {
      // thresholds.low → thresholds.safe maps to 10-30
      score = 10 + (1 - (hf - thresholds.low) / (thresholds.safe - thresholds.low)) * 20;
    } else {
      score = Math.max(0, 10 - (hf - thresholds.safe) * 5);
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      name: 'health_factor',
      score,
      weight: 0.45, // Heaviest factor
      detail: `Health factor ${hf.toFixed(3)} (thresholds: safe>${thresholds.safe}, critical<${thresholds.high})`,
    };
  }

  private assessUtilization(position: LendingPosition): RiskFactor {
    const totalCollateral = position.collateral.reduce((s, c) => s + c.valueUsd, 0);
    const totalDebt = position.debt.reduce((s, d) => s + d.valueUsd, 0);

    if (totalCollateral === 0) {
      return { name: 'utilization', score: 0, weight: 0.15, detail: 'No collateral — no position' };
    }

    const utilization = totalDebt / totalCollateral;
    // 0% util = 0 risk, 80%+ util = very high risk
    let score: number;
    if (utilization < 0.3) {
      score = utilization / 0.3 * 15;
    } else if (utilization < 0.5) {
      score = 15 + (utilization - 0.3) / 0.2 * 20;
    } else if (utilization < 0.7) {
      score = 35 + (utilization - 0.5) / 0.2 * 30;
    } else if (utilization < 0.85) {
      score = 65 + (utilization - 0.7) / 0.15 * 25;
    } else {
      score = 90 + Math.min(10, (utilization - 0.85) / 0.15 * 10);
    }

    return {
      name: 'utilization',
      score: Math.round(Math.min(100, score)),
      weight: 0.15,
      detail: `Utilization ${(utilization * 100).toFixed(1)}% ($${totalDebt.toFixed(0)} / $${totalCollateral.toFixed(0)})`,
    };
  }

  private assessConcentration(position: LendingPosition): RiskFactor {
    const collateralCount = position.collateral.length;
    const totalValue = position.collateral.reduce((s, c) => s + c.valueUsd, 0);

    if (collateralCount <= 1 || totalValue === 0) {
      // Single collateral asset = concentration risk
      const score = totalValue > 0 ? 40 : 0;
      return {
        name: 'concentration',
        score,
        weight: 0.10,
        detail: collateralCount === 0
          ? 'No collateral'
          : `Single collateral asset (${position.collateral[0]?.symbol || 'unknown'})`,
      };
    }

    // Herfindahl-Hirschman Index for concentration
    const shares = position.collateral.map(c => c.valueUsd / totalValue);
    const hhi = shares.reduce((sum, s) => sum + s * s, 0);
    // HHI ranges from 1/n (perfectly distributed) to 1.0 (single asset)
    // Map to 0-60 risk score
    const score = Math.round(hhi * 60);

    return {
      name: 'concentration',
      score,
      weight: 0.10,
      detail: `${collateralCount} collateral assets, HHI=${hhi.toFixed(2)}`,
    };
  }

  private assessTrend(key: string, position: LendingPosition): RiskFactor {
    const history = this.healthHistory.get(key) || [];

    if (history.length < this.config.trendMinSamples) {
      return {
        name: 'trend',
        score: 25, // Unknown trend = slight risk
        weight: 0.20,
        detail: `Insufficient data (${history.length}/${this.config.trendMinSamples} samples)`,
      };
    }

    // Calculate velocity: change in HF per minute
    const recent = history.slice(-this.config.trendWindowSize);
    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    const timeDeltaMin = (newest.timestamp - oldest.timestamp) / 60000;

    if (timeDeltaMin < 0.1) {
      return {
        name: 'trend',
        score: 25,
        weight: 0.20,
        detail: 'Samples too close in time',
      };
    }

    const hfDelta = newest.healthFactor - oldest.healthFactor;
    const velocity = hfDelta / timeDeltaMin; // HF change per minute

    let score: number;
    let detail: string;

    if (velocity > 0.01) {
      // Health improving
      score = Math.max(0, 15 - velocity * 100);
      detail = `Improving: +${velocity.toFixed(4)}/min`;
    } else if (velocity > -0.005) {
      // Stable
      score = 25;
      detail = `Stable: ${velocity.toFixed(4)}/min`;
    } else if (velocity > -0.02) {
      // Declining slowly
      score = 50;
      detail = `Declining: ${velocity.toFixed(4)}/min`;
    } else if (velocity > -0.05) {
      // Declining fast
      score = 75;
      detail = `Rapid decline: ${velocity.toFixed(4)}/min`;
    } else {
      // Free fall
      score = 95;
      detail = `FREE FALL: ${velocity.toFixed(4)}/min`;

      // Estimate time to liquidation
      if (position.healthFactor > 1.0 && velocity < 0) {
        const minutesToLiquidation = (position.healthFactor - 1.0) / Math.abs(velocity);
        detail += ` — est. ${minutesToLiquidation.toFixed(0)}min to liquidation`;
      }
    }

    return {
      name: 'trend',
      score: Math.round(Math.min(100, score)),
      weight: 0.20,
      detail,
    };
  }

  private assessProtocolRisk(position: LendingPosition): RiskFactor | null {
    const params = PROTOCOL_PARAMS[position.protocol];
    if (!params) return null;

    // MarginFi has closeFactor=1.0 (full liquidation), making it riskier
    let score = 0;
    const details: string[] = [];

    if (params.closeFactor >= 1.0) {
      score += 20;
      details.push('100% close factor (full liquidation possible)');
    }

    if (params.liquidationPenalty > 0.05) {
      score += 15;
      details.push(`${(params.liquidationPenalty * 100).toFixed(0)}% liquidation penalty`);
    }

    if (score === 0) return null;

    return {
      name: 'protocol_risk',
      score,
      weight: 0.10,
      detail: `${position.protocol}: ${details.join(', ')}`,
    };
  }

  private assessCrossProtocolRisk(positions: LendingPosition[]): RiskFactor | null {
    if (positions.length <= 1) return null;

    const protocols = new Set(positions.map(p => p.protocol));
    if (protocols.size <= 1) return null;

    const totalDebt = positions.reduce(
      (sum, p) => sum + p.debt.reduce((s, d) => s + d.valueUsd, 0), 0
    );

    // More protocols with debt = more correlated liquidation risk
    // (market crash hits all protocols simultaneously)
    const score = Math.min(60, protocols.size * 20);

    return {
      name: 'cross_protocol',
      score,
      weight: 0.15,
      detail: `Debt across ${protocols.size} protocols ($${totalDebt.toFixed(0)} total) — correlated crash risk`,
    };
  }

  // ─── Recommendations ────────────────────────────────────────────

  private generateRecommendations(
    position: LendingPosition,
    riskLevel: RiskLevel,
    factors: RiskFactor[],
  ): ProtectionRecommendation[] {
    const recs: ProtectionRecommendation[] = [];
    const totalDebt = position.debt.reduce((s, d) => s + d.valueUsd, 0);
    const totalCollateral = position.collateral.reduce((s, c) => s + c.valueUsd, 0);
    const params = PROTOCOL_PARAMS[position.protocol] || PROTOCOL_PARAMS.kamino;

    if (riskLevel === 'safe') {
      return [{ action: 'none', urgency: 'monitor', reason: 'Position is healthy' }];
    }

    if (riskLevel === 'critical') {
      // Calculate how much to repay to restore HF to safe zone (1.5)
      const targetHf = 1.5;
      const liqThreshold = position.liquidationThreshold;
      // HF = (collateral * liqThreshold) / debt
      // To reach targetHf: debt_new = (collateral * liqThreshold) / targetHf
      // repayAmount = debt - debt_new
      const safeDebt = (totalCollateral * liqThreshold) / targetHf;
      const repayAmount = Math.max(0, totalDebt - safeDebt);

      if (repayAmount > 0) {
        recs.push({
          action: 'repay',
          urgency: 'immediate',
          amount: Math.round(repayAmount * 100) / 100,
          reason: `Repay $${repayAmount.toFixed(2)} to restore health factor to ${targetHf}`,
        });
      }

      // Also suggest adding collateral as alternative
      // To reach targetHf: collateral_new = (debt * targetHf) / liqThreshold
      const safeCollateral = (totalDebt * targetHf) / liqThreshold;
      const addAmount = Math.max(0, safeCollateral - totalCollateral);
      if (addAmount > 0) {
        recs.push({
          action: 'add-collateral',
          urgency: 'immediate',
          amount: Math.round(addAmount * 100) / 100,
          reason: `Or add $${addAmount.toFixed(2)} collateral to restore health factor to ${targetHf}`,
        });
      }

      return recs;
    }

    if (riskLevel === 'high') {
      const targetHf = 1.5;
      const liqThreshold = position.liquidationThreshold;
      const safeDebt = (totalCollateral * liqThreshold) / targetHf;
      const repayAmount = Math.max(0, totalDebt - safeDebt);

      if (repayAmount > 0) {
        recs.push({
          action: 'repay',
          urgency: 'soon',
          amount: Math.round(repayAmount * 100) / 100,
          reason: `Repay $${repayAmount.toFixed(2)} to improve health factor to ${targetHf}`,
        });
      }
    }

    if (riskLevel === 'medium') {
      // Check if trend is worsening
      const trendFactor = factors.find(f => f.name === 'trend');
      if (trendFactor && trendFactor.score > 50) {
        recs.push({
          action: 'repay',
          urgency: 'soon',
          reason: 'Health factor declining — consider partial repayment',
        });
      } else {
        recs.push({
          action: 'none',
          urgency: 'monitor',
          reason: 'Medium risk — monitor closely, prepare protection if trend worsens',
        });
      }
    }

    if (riskLevel === 'low') {
      recs.push({
        action: 'none',
        urgency: 'monitor',
        reason: 'Low risk — no action needed, continue monitoring',
      });
    }

    return recs;
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private getEffectiveThresholds(position: LendingPosition) {
    const base = { ...this.config.thresholds };

    if (!this.config.positionSizeScaling) return base;

    // Larger positions → tighter thresholds (need more buffer)
    const totalValue = position.collateral.reduce((s, c) => s + c.valueUsd, 0);
    let scaleFactor = 1.0;

    if (totalValue > 1_000_000) {
      scaleFactor = 1.15; // +15% buffer for $1M+ positions
    } else if (totalValue > 100_000) {
      scaleFactor = 1.08; // +8% buffer for $100K+ positions
    } else if (totalValue > 10_000) {
      scaleFactor = 1.03; // +3% buffer for $10K+ positions
    }

    return {
      safe: base.safe * scaleFactor,
      low: base.low * scaleFactor,
      medium: base.medium * scaleFactor,
      high: base.high * scaleFactor,
    };
  }

  private scoreToLevel(score: number): RiskLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'safe';
  }

  private recordSnapshot(key: string, healthFactor: number): void {
    if (!this.healthHistory.has(key)) {
      this.healthHistory.set(key, []);
    }

    const history = this.healthHistory.get(key)!;
    history.push({ healthFactor, timestamp: Date.now() });

    // Trim to window size
    if (history.length > this.config.trendWindowSize * 2) {
      this.healthHistory.set(key, history.slice(-this.config.trendWindowSize));
    }
  }

  private deduplicateRecommendations(recs: ProtectionRecommendation[]): ProtectionRecommendation[] {
    const urgencyRank = { immediate: 0, soon: 1, monitor: 2 };
    const byAction = new Map<string, ProtectionRecommendation>();

    for (const rec of recs) {
      const key = rec.action;
      const existing = byAction.get(key);
      if (!existing || urgencyRank[rec.urgency] < urgencyRank[existing.urgency]) {
        byAction.set(key, rec);
      }
    }

    return [...byAction.values()].sort(
      (a, b) => urgencyRank[a.urgency] - urgencyRank[b.urgency]
    );
  }

  // ─── Public Utilities ────────────────────────────────────────────

  getHealthHistory(wallet: string, protocol: string): HealthSnapshot[] {
    return this.healthHistory.get(`${wallet}:${protocol}`) || [];
  }

  clearHistory(wallet?: string): void {
    if (wallet) {
      for (const key of this.healthHistory.keys()) {
        if (key.startsWith(wallet)) {
          this.healthHistory.delete(key);
        }
      }
    } else {
      this.healthHistory.clear();
    }
  }
}
