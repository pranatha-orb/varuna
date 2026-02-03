import { Connection, PublicKey } from '@solana/web3.js';
import { LendingPosition, ProtectionConfig, AlertEvent, MonitorStatus } from '../types';
import { KaminoAdapter } from './adapters/kamino';
import { MarginFiAdapter } from './adapters/marginfi';
import { SolendAdapter } from './adapters/solend';

export class PositionMonitor {
  private connection: Connection;
  private watchlist: Map<string, ProtectionConfig> = new Map();
  private alerts: AlertEvent[] = [];
  private isRunning = false;
  private checkInterval: NodeJS.Timeout | null = null;

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

  async checkHealth(wallet: string): Promise<{ positions: LendingPosition[]; alerts: AlertEvent[] }> {
    const config = this.watchlist.get(wallet);
    const threshold = config?.healthThreshold ?? 1.2;

    const positions = await this.getAllPositions(wallet);
    const newAlerts: AlertEvent[] = [];

    for (const position of positions) {
      if (position.healthFactor <= 1.0) {
        newAlerts.push({
          type: 'liquidated',
          wallet,
          protocol: position.protocol,
          healthFactor: position.healthFactor,
          message: `Position liquidated on ${position.protocol}`,
          timestamp: new Date(),
        });
      } else if (position.healthFactor < 1.05) {
        newAlerts.push({
          type: 'critical',
          wallet,
          protocol: position.protocol,
          healthFactor: position.healthFactor,
          message: `CRITICAL: Health factor ${position.healthFactor.toFixed(2)} on ${position.protocol}`,
          timestamp: new Date(),
        });
      } else if (position.healthFactor < threshold) {
        newAlerts.push({
          type: 'warning',
          wallet,
          protocol: position.protocol,
          healthFactor: position.healthFactor,
          message: `Warning: Health factor ${position.healthFactor.toFixed(2)} below threshold on ${position.protocol}`,
          timestamp: new Date(),
        });
      }
    }

    this.alerts.push(...newAlerts);
    return { positions, alerts: newAlerts };
  }

  start(intervalMs = 30000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`[Varuna] Starting monitor with ${intervalMs}ms interval`);

    this.checkInterval = setInterval(async () => {
      for (const [wallet, config] of this.watchlist) {
        try {
          const { alerts } = await this.checkHealth(wallet);
          if (alerts.length > 0) {
            console.log(`[Varuna] Alerts for ${wallet}:`, alerts);
            // TODO: Trigger protection actions if autoProtect enabled
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
      protectionActionsExecuted: 0, // TODO: track this
    };
  }

  getAlerts(wallet?: string): AlertEvent[] {
    if (wallet) {
      return this.alerts.filter(a => a.wallet === wallet);
    }
    return this.alerts;
  }
}
