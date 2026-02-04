import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  LendingPosition,
  RiskAssessment,
  ProtectionOption,
  ProtectionResult,
  ProtectionEngineConfig,
  YieldImpact,
  ProtectionAction,
} from '../types';

// Default yield rates per protocol (approximations for scoring)
const DEFAULT_YIELD_RATES: Record<string, { supplyAPY: number; borrowAPY: number }> = {
  kamino:   { supplyAPY: 0.065, borrowAPY: 0.085 },
  marginfi: { supplyAPY: 0.055, borrowAPY: 0.090 },
  solend:   { supplyAPY: 0.045, borrowAPY: 0.075 },
};

// Protocol program IDs
const PROTOCOL_PROGRAMS: Record<string, string> = {
  kamino:   'KLend2g3cP87ber41GJZGYsChYBcFdNcTyRniYQ1dQj',
  marginfi: 'MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA',
  solend:   'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo',
};

const DEFAULT_CONFIG: ProtectionEngineConfig = {
  targetHealthFactor: 1.5,
  maxProtectionUsd: 10000,
  dryRun: true,
  preferredStrategy: 'yield-optimized',
  yieldRates: DEFAULT_YIELD_RATES,
};

export class ProtectionEngine {
  private connection: Connection;
  private config: ProtectionEngineConfig;
  private executionLog: ProtectionResult[] = [];

  constructor(connection: Connection, config?: Partial<ProtectionEngineConfig>) {
    this.connection = connection;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Main API ────────────────────────────────────────────────────

  /**
   * Evaluate all viable protection options for a position.
   * Returns options ranked by yield-cost efficiency.
   */
  evaluateOptions(position: LendingPosition, assessment: RiskAssessment): ProtectionOption[] {
    const options: ProtectionOption[] = [];
    const totalDebt = position.debt.reduce((s, d) => s + d.valueUsd, 0);
    const totalCollateral = position.collateral.reduce((s, c) => s + c.valueUsd, 0);
    const liqThreshold = position.liquidationThreshold;
    const targetHF = this.config.targetHealthFactor;
    const yields = this.config.yieldRates[position.protocol] || DEFAULT_YIELD_RATES.kamino;

    if (assessment.riskLevel === 'safe' || assessment.riskLevel === 'low') {
      return []; // No protection needed
    }

    // ── Option A: Repay Debt ──────────────────────────────────
    // HF = (collateral * liqThreshold) / debt
    // targetHF = (collateral * liqThreshold) / (debt - repayAmount)
    // repayAmount = debt - (collateral * liqThreshold) / targetHF
    const targetDebt = (totalCollateral * liqThreshold) / targetHF;
    const repayAmount = Math.max(0, totalDebt - targetDebt);

    if (repayAmount > 0 && repayAmount <= this.config.maxProtectionUsd) {
      const newDebt = totalDebt - repayAmount;
      const newHF = totalCollateral > 0 && newDebt > 0
        ? (totalCollateral * liqThreshold) / newDebt
        : 999;

      // Yield impact: repaying debt reduces borrow cost (saves money)
      // but the capital used for repayment was potentially earning yield elsewhere
      const borrowSaved = repayAmount * yields.borrowAPY;
      const supplyCost = repayAmount * yields.supplyAPY; // opportunity cost
      const netYieldChange = borrowSaved - supplyCost; // positive = you save money

      const currentEffectiveAPY = this.calculateEffectiveAPY(totalCollateral, totalDebt, yields);
      const projectedAPY = this.calculateEffectiveAPY(totalCollateral, newDebt, yields);

      const yieldImpact: YieldImpact = {
        currentAPY: currentEffectiveAPY,
        projectedAPY,
        yieldDeltaPercent: currentEffectiveAPY !== 0
          ? ((projectedAPY - currentEffectiveAPY) / Math.abs(currentEffectiveAPY)) * 100
          : 0,
        annualizedCostUsd: -netYieldChange, // negative cost = you save money
      };

      options.push({
        id: `repay-${position.protocol}`,
        action: 'repay',
        protocol: position.protocol,
        asset: position.debt[0]?.symbol || 'DEBT',
        amount: repayAmount,
        amountUsd: repayAmount,
        resultingHF: newHF,
        resultingDebtUsd: newDebt,
        resultingCollateralUsd: totalCollateral,
        yieldImpact,
        capitalCostUsd: repayAmount,
        yieldCostAnnualUsd: yieldImpact.annualizedCostUsd,
        totalScoreUsd: repayAmount + yieldImpact.annualizedCostUsd,
        viable: true,
        reason: `Repay $${repayAmount.toFixed(2)} debt to restore HF to ${newHF.toFixed(2)}`,
      });
    }

    // ── Option B: Add Collateral ──────────────────────────────
    // targetHF = ((collateral + addAmount) * liqThreshold) / debt
    // addAmount = (debt * targetHF / liqThreshold) - collateral
    const targetCollateral = (totalDebt * targetHF) / liqThreshold;
    const addAmount = Math.max(0, targetCollateral - totalCollateral);

    if (addAmount > 0 && addAmount <= this.config.maxProtectionUsd) {
      const newCollateral = totalCollateral + addAmount;
      const newHF = totalDebt > 0
        ? (newCollateral * liqThreshold) / totalDebt
        : 999;

      // Yield impact: adding collateral earns supply APY on new capital
      // The capital itself has opportunity cost = 0 (was idle)
      const additionalYield = addAmount * yields.supplyAPY;

      const currentEffectiveAPY = this.calculateEffectiveAPY(totalCollateral, totalDebt, yields);
      const projectedAPY = this.calculateEffectiveAPY(newCollateral, totalDebt, yields);

      const yieldImpact: YieldImpact = {
        currentAPY: currentEffectiveAPY,
        projectedAPY,
        yieldDeltaPercent: currentEffectiveAPY !== 0
          ? ((projectedAPY - currentEffectiveAPY) / Math.abs(currentEffectiveAPY)) * 100
          : 0,
        annualizedCostUsd: -additionalYield, // negative = you earn more
      };

      options.push({
        id: `add-collateral-${position.protocol}`,
        action: 'add-collateral',
        protocol: position.protocol,
        asset: position.collateral[0]?.symbol || 'COLLATERAL',
        amount: addAmount,
        amountUsd: addAmount,
        resultingHF: newHF,
        resultingDebtUsd: totalDebt,
        resultingCollateralUsd: newCollateral,
        yieldImpact,
        capitalCostUsd: addAmount,
        yieldCostAnnualUsd: yieldImpact.annualizedCostUsd,
        totalScoreUsd: addAmount + yieldImpact.annualizedCostUsd,
        viable: true,
        reason: `Add $${addAmount.toFixed(2)} collateral to restore HF to ${newHF.toFixed(2)}`,
      });
    }

    // ── Option C: Partial Unwind (reduce both sides) ──────────
    // Remove collateral and repay debt proportionally
    // This costs $0 capital but reduces both yield and risk
    // Strategy: repay X debt, withdraw X * (collateral/debt) collateral
    // Net effect: position shrinks, HF improves because we repay slightly more than proportional
    if (totalDebt > 0 && totalCollateral > 0) {
      // To reach targetHF by unwinding:
      // We repay repayPortion of debt and withdraw (repayPortion * ratio) of collateral
      // but withdraw slightly less to improve HF
      // Simpler: unwind by repaying enough debt while keeping collateral
      // Actually unwind = repay debt AND withdraw collateral, but repay MORE debt per collateral removed
      // For simplicity: unwind = repay 50% of what full-repay would need + withdraw equivalent collateral
      const unwindRepay = repayAmount * 0.6;
      const unwindWithdraw = unwindRepay * 0.8; // Withdraw less than we repay to improve HF
      const newDebt = totalDebt - unwindRepay;
      const newCollateral = totalCollateral - unwindWithdraw;

      if (unwindRepay > 0 && newDebt > 0 && newCollateral > 0) {
        const newHF = (newCollateral * liqThreshold) / newDebt;

        // Only viable if it actually improves HF enough
        if (newHF >= targetHF * 0.9) { // Allow 90% of target for unwind
          const currentEffectiveAPY = this.calculateEffectiveAPY(totalCollateral, totalDebt, yields);
          const projectedAPY = this.calculateEffectiveAPY(newCollateral, newDebt, yields);

          // Yield impact: both supply and borrow shrink
          const lostSupplyYield = unwindWithdraw * yields.supplyAPY;
          const savedBorrowCost = unwindRepay * yields.borrowAPY;
          const netYieldChange = savedBorrowCost - lostSupplyYield;

          const yieldImpact: YieldImpact = {
            currentAPY: currentEffectiveAPY,
            projectedAPY,
            yieldDeltaPercent: currentEffectiveAPY !== 0
              ? ((projectedAPY - currentEffectiveAPY) / Math.abs(currentEffectiveAPY)) * 100
              : 0,
            annualizedCostUsd: -netYieldChange,
          };

          options.push({
            id: `unwind-${position.protocol}`,
            action: 'unwind',
            protocol: position.protocol,
            asset: 'POSITION',
            amount: unwindRepay,
            amountUsd: unwindRepay,
            resultingHF: newHF,
            resultingDebtUsd: newDebt,
            resultingCollateralUsd: newCollateral,
            yieldImpact,
            capitalCostUsd: 0, // Unwind uses existing position funds
            yieldCostAnnualUsd: yieldImpact.annualizedCostUsd,
            totalScoreUsd: yieldImpact.annualizedCostUsd, // Only yield cost, no capital cost
            viable: true,
            reason: `Unwind: repay $${unwindRepay.toFixed(2)} + withdraw $${unwindWithdraw.toFixed(2)} to reach HF ${newHF.toFixed(2)}`,
          });
        }
      }
    }

    // Sort by strategy preference
    return this.rankOptions(options);
  }

  /**
   * Select the best protection option based on strategy.
   */
  selectBestOption(options: ProtectionOption[]): ProtectionOption | null {
    const viable = options.filter(o => o.viable);
    if (viable.length === 0) return null;
    return viable[0]; // Already ranked by evaluateOptions
  }

  /**
   * Full pipeline: evaluate → select → execute.
   * This is what the monitor calls on auto-protect.
   */
  async protect(
    position: LendingPosition,
    assessment: RiskAssessment,
    signerKeypair?: Keypair,
  ): Promise<ProtectionResult> {
    const startTime = Date.now();

    // 1. Evaluate all options
    const options = this.evaluateOptions(position, assessment);

    if (options.length === 0) {
      return {
        success: false,
        option: this.noOpOption(position),
        executionTimeMs: Date.now() - startTime,
        previousHF: position.healthFactor,
        error: 'No viable protection options',
        dryRun: this.config.dryRun,
        timestamp: new Date(),
      };
    }

    // 2. Select best
    const best = this.selectBestOption(options)!;

    console.log(`[Varuna] Protection selected: ${best.action} on ${best.protocol}`);
    console.log(`[Varuna]   Amount: $${best.amountUsd.toFixed(2)}`);
    console.log(`[Varuna]   HF: ${position.healthFactor.toFixed(3)} → ${best.resultingHF.toFixed(3)}`);
    console.log(`[Varuna]   Yield: ${(best.yieldImpact.currentAPY * 100).toFixed(2)}% → ${(best.yieldImpact.projectedAPY * 100).toFixed(2)}%`);
    console.log(`[Varuna]   Yield cost: $${best.yieldCostAnnualUsd.toFixed(2)}/year`);

    // 3. Execute (or dry run)
    if (this.config.dryRun || !signerKeypair) {
      console.log('[Varuna] DRY RUN — transaction not sent');
      const result: ProtectionResult = {
        success: true,
        option: best,
        executionTimeMs: Date.now() - startTime,
        previousHF: position.healthFactor,
        newHF: best.resultingHF,
        dryRun: true,
        timestamp: new Date(),
      };
      this.executionLog.push(result);
      return result;
    }

    // 4. Build and send transaction
    try {
      const tx = await this.buildTransaction(best, new PublicKey(position.wallet), signerKeypair);
      const signature = await sendAndConfirmTransaction(this.connection, tx, [signerKeypair], {
        commitment: 'confirmed',
      });

      console.log(`[Varuna] Protection executed: ${signature}`);

      const result: ProtectionResult = {
        success: true,
        option: best,
        txSignature: signature,
        executionTimeMs: Date.now() - startTime,
        previousHF: position.healthFactor,
        newHF: best.resultingHF,
        dryRun: false,
        timestamp: new Date(),
      };
      this.executionLog.push(result);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Varuna] Protection execution failed: ${errorMsg}`);

      const result: ProtectionResult = {
        success: false,
        option: best,
        executionTimeMs: Date.now() - startTime,
        previousHF: position.healthFactor,
        error: errorMsg,
        dryRun: false,
        timestamp: new Date(),
      };
      this.executionLog.push(result);
      return result;
    }
  }

  // ─── Transaction Building ────────────────────────────────────────

  private async buildTransaction(
    option: ProtectionOption,
    walletPubkey: PublicKey,
    signer: Keypair,
  ): Promise<Transaction> {
    const tx = new Transaction();
    const programId = new PublicKey(PROTOCOL_PROGRAMS[option.protocol]);

    switch (option.action) {
      case 'repay':
        tx.add(...this.buildRepayInstructions(programId, walletPubkey, option));
        break;
      case 'add-collateral':
        tx.add(...this.buildDepositInstructions(programId, walletPubkey, option));
        break;
      case 'unwind':
        // Unwind = repay + withdraw
        tx.add(...this.buildRepayInstructions(programId, walletPubkey, option));
        tx.add(...this.buildWithdrawInstructions(programId, walletPubkey, option));
        break;
    }

    tx.feePayer = signer.publicKey;
    const { blockhash } = await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    return tx;
  }

  private buildRepayInstructions(
    programId: PublicKey,
    wallet: PublicKey,
    option: ProtectionOption,
  ): TransactionInstruction[] {
    // Build protocol-specific repay instruction
    // Each protocol has a different instruction layout:
    //   Kamino: instruction 4 (repay)
    //   MarginFi: instruction 5 (lending_account_repay)
    //   Solend: instruction 11 (RepayObligationLiquidity)

    const instructionIndex = this.getRepayInstructionIndex(option.protocol);
    const amountLamports = BigInt(Math.floor(option.amount * LAMPORTS_PER_SOL));

    // Encode instruction data: [instruction_index (1 byte), amount (8 bytes LE)]
    const data = Buffer.alloc(9);
    data.writeUInt8(instructionIndex, 0);
    data.writeBigUInt64LE(amountLamports, 1);

    // Build accounts list (simplified — production would derive proper PDAs)
    const keys = [
      { pubkey: wallet, isSigner: true, isWritable: true },
      // Obligation/account PDA would be derived per-protocol
      { pubkey: wallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    return [new TransactionInstruction({ programId, keys, data })];
  }

  private buildDepositInstructions(
    programId: PublicKey,
    wallet: PublicKey,
    option: ProtectionOption,
  ): TransactionInstruction[] {
    const instructionIndex = this.getDepositInstructionIndex(option.protocol);
    const amountLamports = BigInt(Math.floor(option.amount * LAMPORTS_PER_SOL));

    const data = Buffer.alloc(9);
    data.writeUInt8(instructionIndex, 0);
    data.writeBigUInt64LE(amountLamports, 1);

    const keys = [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: wallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    return [new TransactionInstruction({ programId, keys, data })];
  }

  private buildWithdrawInstructions(
    programId: PublicKey,
    wallet: PublicKey,
    option: ProtectionOption,
  ): TransactionInstruction[] {
    const instructionIndex = this.getWithdrawInstructionIndex(option.protocol);
    // For unwind, withdraw amount = ~80% of repay amount
    const withdrawAmount = BigInt(Math.floor(option.amount * 0.8 * LAMPORTS_PER_SOL));

    const data = Buffer.alloc(9);
    data.writeUInt8(instructionIndex, 0);
    data.writeBigUInt64LE(withdrawAmount, 1);

    const keys = [
      { pubkey: wallet, isSigner: true, isWritable: true },
      { pubkey: wallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    return [new TransactionInstruction({ programId, keys, data })];
  }

  // Protocol-specific instruction indices
  private getRepayInstructionIndex(protocol: string): number {
    switch (protocol) {
      case 'kamino':   return 4;  // Kamino Lend repay
      case 'marginfi': return 5;  // MarginFi lending_account_repay
      case 'solend':   return 11; // Solend RepayObligationLiquidity
      default:         return 4;
    }
  }

  private getDepositInstructionIndex(protocol: string): number {
    switch (protocol) {
      case 'kamino':   return 2;  // Kamino Lend deposit
      case 'marginfi': return 3;  // MarginFi lending_account_deposit
      case 'solend':   return 9;  // Solend DepositReserveLiquidity
      default:         return 2;
    }
  }

  private getWithdrawInstructionIndex(protocol: string): number {
    switch (protocol) {
      case 'kamino':   return 3;  // Kamino Lend withdraw
      case 'marginfi': return 4;  // MarginFi lending_account_withdraw
      case 'solend':   return 10; // Solend RedeemReserveCollateral
      default:         return 3;
    }
  }

  // ─── Yield Calculations ──────────────────────────────────────────

  /**
   * Calculate net effective APY for a leveraged lending position.
   * Effective APY = (collateral * supplyAPY - debt * borrowAPY) / equity
   * where equity = collateral - debt
   */
  private calculateEffectiveAPY(
    collateralUsd: number,
    debtUsd: number,
    yields: { supplyAPY: number; borrowAPY: number },
  ): number {
    const equity = collateralUsd - debtUsd;
    if (equity <= 0) return 0;

    const supplyIncome = collateralUsd * yields.supplyAPY;
    const borrowCost = debtUsd * yields.borrowAPY;
    const netIncome = supplyIncome - borrowCost;

    return netIncome / equity;
  }

  // ─── Option Ranking ──────────────────────────────────────────────

  private rankOptions(options: ProtectionOption[]): ProtectionOption[] {
    switch (this.config.preferredStrategy) {
      case 'yield-optimized':
        // Minimize yield loss (annualized yield cost)
        return options.sort((a, b) => a.yieldCostAnnualUsd - b.yieldCostAnnualUsd);

      case 'cost-optimized':
        // Minimize immediate capital outlay
        return options.sort((a, b) => a.capitalCostUsd - b.capitalCostUsd);

      case 'speed-optimized':
        // Maximize resulting HF (get to safety fastest)
        return options.sort((a, b) => b.resultingHF - a.resultingHF);

      default:
        return options.sort((a, b) => a.totalScoreUsd - b.totalScoreUsd);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private noOpOption(position: LendingPosition): ProtectionOption {
    return {
      id: 'no-op',
      action: 'repay',
      protocol: position.protocol,
      asset: 'NONE',
      amount: 0,
      amountUsd: 0,
      resultingHF: position.healthFactor,
      resultingDebtUsd: position.debt.reduce((s, d) => s + d.valueUsd, 0),
      resultingCollateralUsd: position.collateral.reduce((s, c) => s + c.valueUsd, 0),
      yieldImpact: { currentAPY: 0, projectedAPY: 0, yieldDeltaPercent: 0, annualizedCostUsd: 0 },
      capitalCostUsd: 0,
      yieldCostAnnualUsd: 0,
      totalScoreUsd: 0,
      viable: false,
      reason: 'No protection needed or no viable options',
    };
  }

  // ─── Public Utilities ────────────────────────────────────────────

  getExecutionLog(): ProtectionResult[] {
    return [...this.executionLog];
  }

  getConfig(): ProtectionEngineConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ProtectionEngineConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /** Convert a ProtectionResult to the legacy ProtectionAction format */
  toProtectionAction(result: ProtectionResult): ProtectionAction {
    return {
      type: result.option.action === 'unwind' ? 'repay' : result.option.action,
      wallet: '',
      protocol: result.option.protocol,
      asset: result.option.asset,
      amount: result.option.amount,
      txSignature: result.txSignature,
      status: result.success ? 'success' : 'failed',
      timestamp: result.timestamp,
    };
  }
}
