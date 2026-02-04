import { Connection, PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
import {
  LiquidationEvent,
  LiquidationStats,
  LiquidationFeedConfig,
} from '../types';

// Protocol program IDs
const PROTOCOL_PROGRAMS: Record<string, PublicKey> = {
  kamino:   new PublicKey('KLend2g3cP87ber41GJZGYsChYBcFdNcTyRniYQ1dQj'),
  marginfi: new PublicKey('MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA'),
  solend:   new PublicKey('So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo'),
};

// Known liquidation instruction discriminators (first byte(s) of instruction data)
const LIQUIDATION_DISCRIMINATORS: Record<string, number[]> = {
  kamino:   [14],    // liquidateObligation
  marginfi: [22],    // lending_account_liquidate
  solend:   [16],    // LiquidateObligation
};

const DEFAULT_CONFIG: LiquidationFeedConfig = {
  pollIntervalMs: 60000,
  maxEvents: 500,
  protocols: ['kamino', 'marginfi', 'solend'],
};

type LiquidationListener = (event: LiquidationEvent) => void;

export class LiquidationFeed {
  private connection: Connection;
  private config: LiquidationFeedConfig;
  private events: LiquidationEvent[] = [];
  private running = false;
  private pollHandle: NodeJS.Timeout | null = null;
  private lastSignatures: Map<string, string> = new Map(); // protocol → last seen sig
  private listeners: LiquidationListener[] = [];
  private eventCounter = 0;

  constructor(connection: Connection, config?: Partial<LiquidationFeedConfig>) {
    this.connection = connection;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  start(): void {
    if (this.running) return;
    this.running = true;

    console.log(`[Varuna LiqFeed] Started (interval: ${this.config.pollIntervalMs}ms, protocols: ${this.config.protocols.join(', ')})`);

    // First poll immediately
    this.poll().catch(err => console.error('[Varuna LiqFeed] Poll error:', err));

    this.pollHandle = setInterval(() => {
      this.poll().catch(err => console.error('[Varuna LiqFeed] Poll error:', err));
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    this.running = false;
    console.log('[Varuna LiqFeed] Stopped');
  }

  // ─── Event Listener ──────────────────────────────────────────────

  onLiquidation(listener: LiquidationListener): void {
    this.listeners.push(listener);
  }

  private emit(event: LiquidationEvent): void {
    for (const fn of this.listeners) {
      try { fn(event); } catch (e) { /* ignore listener errors */ }
    }
  }

  // ─── Polling ─────────────────────────────────────────────────────

  private async poll(): Promise<void> {
    for (const protocol of this.config.protocols) {
      try {
        const events = await this.fetchLiquidations(protocol);
        for (const event of events) {
          this.addEvent(event);
        }
      } catch (error) {
        // Silently skip protocols that fail (rate limits, etc)
      }
    }
  }

  private async fetchLiquidations(protocol: string): Promise<LiquidationEvent[]> {
    const programId = PROTOCOL_PROGRAMS[protocol];
    if (!programId) return [];

    const lastSig = this.lastSignatures.get(protocol);

    // Fetch recent signatures for the program
    const sigInfos = await this.connection.getSignaturesForAddress(
      programId,
      {
        limit: 20,
        until: lastSig,
      },
      'confirmed',
    );

    if (sigInfos.length === 0) return [];

    // Update the cursor to the most recent signature
    this.lastSignatures.set(protocol, sigInfos[0].signature);

    // Check each transaction for liquidation instructions
    const liquidations: LiquidationEvent[] = [];

    for (const sigInfo of sigInfos) {
      if (sigInfo.err) continue; // Skip failed txs

      try {
        const event = await this.parseLiquidationTx(protocol, sigInfo);
        if (event) {
          liquidations.push(event);
        }
      } catch {
        // Skip unparseable transactions
      }
    }

    return liquidations;
  }

  private async parseLiquidationTx(
    protocol: string,
    sigInfo: ConfirmedSignatureInfo,
  ): Promise<LiquidationEvent | null> {
    const tx = await this.connection.getTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta) return null;

    // Check if any instruction matches a liquidation discriminator
    const message = tx.transaction.message;
    const discriminators = LIQUIDATION_DISCRIMINATORS[protocol] || [];
    const programId = PROTOCOL_PROGRAMS[protocol];

    let isLiquidation = false;

    // Check compiled instructions
    const accountKeys = message.getAccountKeys
      ? message.getAccountKeys()
      : (message as any).staticAccountKeys || [];

    const instructions = (message as any).compiledInstructions || (message as any).instructions || [];

    for (const ix of instructions) {
      const progIdx = ix.programIdIndex;
      const progKey = accountKeys[progIdx] || accountKeys.get?.(progIdx);
      if (!progKey) continue;

      const progKeyStr = typeof progKey === 'string' ? progKey : progKey.toBase58();
      if (progKeyStr !== programId.toBase58()) continue;

      // Check instruction discriminator
      const data = ix.data instanceof Uint8Array
        ? ix.data
        : (typeof ix.data === 'string' ? Buffer.from(ix.data, 'base64') : null);

      if (data && data.length > 0 && discriminators.includes(data[0])) {
        isLiquidation = true;
        break;
      }
    }

    if (!isLiquidation) return null;

    // Extract liquidation details from balance changes
    const preBalances = tx.meta.preBalances || [];
    const postBalances = tx.meta.postBalances || [];

    // The first account is typically the liquidator, second is the borrower
    const liquidator = accountKeys[0]
      ? (typeof accountKeys[0] === 'string' ? accountKeys[0] : accountKeys[0].toBase58())
      : 'unknown';

    // Estimate value from SOL balance changes (simplified)
    let totalBalanceChange = 0;
    for (let i = 0; i < Math.min(preBalances.length, postBalances.length); i++) {
      const diff = Math.abs(postBalances[i] - preBalances[i]);
      totalBalanceChange += diff;
    }
    const estimatedValueUsd = (totalBalanceChange / 1e9) * 150; // rough SOL price estimate

    // Parse token balance changes for more accurate values
    const preTokenBalances = tx.meta.preTokenBalances || [];
    const postTokenBalances = tx.meta.postTokenBalances || [];

    let debtRepaid = 0;
    let collateralSeized = 0;

    if (preTokenBalances.length > 0 && postTokenBalances.length > 0) {
      // Token balance changes indicate the actual amounts
      for (const post of postTokenBalances) {
        const pre = preTokenBalances.find(
          p => p.accountIndex === post.accountIndex && p.mint === post.mint
        );
        if (pre) {
          const preAmt = parseFloat(pre.uiTokenAmount?.uiAmountString || '0');
          const postAmt = parseFloat(post.uiTokenAmount?.uiAmountString || '0');
          const diff = Math.abs(postAmt - preAmt);

          if (postAmt > preAmt) {
            collateralSeized += diff; // Liquidator received collateral
          } else {
            debtRepaid += diff; // Debt was repaid
          }
        }
      }
    }

    // Fall back to SOL estimates if token parsing yields nothing
    if (debtRepaid === 0 && collateralSeized === 0) {
      debtRepaid = estimatedValueUsd * 0.45;
      collateralSeized = estimatedValueUsd * 0.50;
    }

    const penalty = collateralSeized > debtRepaid
      ? collateralSeized - debtRepaid
      : collateralSeized * 0.05;

    // Get borrower wallet (second account or from memo)
    const borrower = accountKeys[1]
      ? (typeof accountKeys[1] === 'string' ? accountKeys[1] : accountKeys[1].toBase58())
      : 'unknown';

    return {
      id: `liq-${++this.eventCounter}`,
      protocol: protocol as 'kamino' | 'marginfi' | 'solend',
      wallet: borrower,
      liquidator,
      collateralAsset: 'COLLATERAL',
      debtAsset: 'DEBT',
      collateralSeized,
      debtRepaid,
      penalty,
      txSignature: sigInfo.signature,
      slot: sigInfo.slot,
      timestamp: sigInfo.blockTime
        ? new Date(sigInfo.blockTime * 1000)
        : new Date(),
    };
  }

  // ─── Event Storage ───────────────────────────────────────────────

  private addEvent(event: LiquidationEvent): void {
    // Deduplicate by txSignature
    if (this.events.some(e => e.txSignature === event.txSignature)) return;

    this.events.unshift(event); // newest first

    // Trim to max size
    if (this.events.length > this.config.maxEvents) {
      this.events = this.events.slice(0, this.config.maxEvents);
    }

    console.log(
      `[Varuna LiqFeed] Liquidation: ${event.protocol} | ` +
      `wallet=${event.wallet.slice(0, 8)}... | ` +
      `seized=$${event.collateralSeized.toFixed(0)} | ` +
      `repaid=$${event.debtRepaid.toFixed(0)} | ` +
      `penalty=$${event.penalty.toFixed(0)}`
    );

    this.emit(event);
  }

  /** Manually ingest a liquidation event (e.g. from external source or simulation) */
  ingest(event: LiquidationEvent): void {
    this.addEvent(event);
  }

  // ─── Query API ───────────────────────────────────────────────────

  getEvents(options?: {
    protocol?: string;
    wallet?: string;
    limit?: number;
    since?: Date;
  }): LiquidationEvent[] {
    let results = this.events;

    if (options?.protocol) {
      results = results.filter(e => e.protocol === options.protocol);
    }
    if (options?.wallet) {
      results = results.filter(e => e.wallet === options.wallet || e.liquidator === options.wallet);
    }
    if (options?.since) {
      const sinceTime = options.since.getTime();
      results = results.filter(e => e.timestamp.getTime() >= sinceTime);
    }
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  getStats(): LiquidationStats {
    const oneHourAgo = Date.now() - 3600_000;

    const byProtocol: Record<string, { events: number; volumeUsd: number }> = {};
    let totalVolumeUsd = 0;
    let totalPenaltiesUsd = 0;
    let recentHourEvents = 0;
    let recentHourVolumeUsd = 0;
    let largestLiquidation: LiquidationEvent | null = null;

    for (const event of this.events) {
      // Per-protocol
      if (!byProtocol[event.protocol]) {
        byProtocol[event.protocol] = { events: 0, volumeUsd: 0 };
      }
      byProtocol[event.protocol].events++;
      byProtocol[event.protocol].volumeUsd += event.collateralSeized;

      // Totals
      totalVolumeUsd += event.collateralSeized;
      totalPenaltiesUsd += event.penalty;

      // Recent hour
      if (event.timestamp.getTime() >= oneHourAgo) {
        recentHourEvents++;
        recentHourVolumeUsd += event.collateralSeized;
      }

      // Largest
      if (!largestLiquidation || event.collateralSeized > largestLiquidation.collateralSeized) {
        largestLiquidation = event;
      }
    }

    return {
      totalEvents: this.events.length,
      totalVolumeUsd,
      totalPenaltiesUsd,
      byProtocol,
      recentHourEvents,
      recentHourVolumeUsd,
      largestLiquidation,
    };
  }

  isRunning(): boolean {
    return this.running;
  }
}
