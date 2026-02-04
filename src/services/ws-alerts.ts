import WebSocket from 'ws';
import { Server as HttpServer } from 'http';
import {
  AlertEvent,
  RiskAssessment,
  ProtectionResult,
  RiskLevel,
  LiquidationEvent,
} from '../types';

// ─── WebSocket Message Types ───────────────────────────────────────

export type WsMessageType =
  | 'alert'
  | 'risk_update'
  | 'protection_executed'
  | 'health_check'
  | 'liquidation'
  | 'subscribed'
  | 'unsubscribed'
  | 'error';

export interface WsMessage {
  type: WsMessageType;
  wallet?: string;
  data: unknown;
  timestamp: string;
}

interface ClientState {
  ws: WebSocket;
  subscribedWallets: Set<string>;
  subscribedAll: boolean;
}

export class WsAlertServer {
  private wss: WebSocket.Server | null = null;
  private clients: Map<WebSocket, ClientState> = new Map();
  private stats = { connected: 0, messagesSent: 0, peakConnections: 0 };

  /**
   * Attach WebSocket server to an existing HTTP server.
   */
  attach(server: HttpServer): void {
    this.wss = new WebSocket.Server({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleConnection(ws);
    });

    console.log('[Varuna WS] WebSocket alert server ready on /ws');
  }

  // ─── Broadcast Methods (called by monitor) ──────────────────────

  broadcastAlert(alert: AlertEvent): void {
    this.broadcast(alert.wallet, {
      type: 'alert',
      wallet: alert.wallet,
      data: {
        alertType: alert.type,
        protocol: alert.protocol,
        healthFactor: alert.healthFactor,
        message: alert.message,
      },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastRiskUpdate(wallet: string, assessment: RiskAssessment): void {
    this.broadcast(wallet, {
      type: 'risk_update',
      wallet,
      data: {
        protocol: assessment.protocol,
        riskLevel: assessment.riskLevel,
        riskScore: assessment.riskScore,
        healthFactor: assessment.healthFactor,
        recommendations: assessment.recommendations,
      },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastProtection(wallet: string, result: ProtectionResult): void {
    this.broadcast(wallet, {
      type: 'protection_executed',
      wallet,
      data: {
        success: result.success,
        action: result.option.action,
        protocol: result.option.protocol,
        amount: result.option.amountUsd,
        previousHF: result.previousHF,
        newHF: result.newHF,
        dryRun: result.dryRun,
        txSignature: result.txSignature,
        yieldImpact: result.option.yieldImpact,
      },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastHealthCheck(wallet: string, data: {
    positions: { protocol: string; healthFactor: number; riskLevel: RiskLevel }[];
  }): void {
    this.broadcast(wallet, {
      type: 'health_check',
      wallet,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastLiquidation(event: LiquidationEvent): void {
    // Liquidation events broadcast to all subscribers (wallet-specific + wildcard)
    const message: WsMessage = {
      type: 'liquidation',
      wallet: event.wallet,
      data: {
        id: event.id,
        protocol: event.protocol,
        wallet: event.wallet,
        liquidator: event.liquidator,
        collateralAsset: event.collateralAsset,
        debtAsset: event.debtAsset,
        collateralSeized: event.collateralSeized,
        debtRepaid: event.debtRepaid,
        penalty: event.penalty,
        txSignature: event.txSignature,
        slot: event.slot,
      },
      timestamp: event.timestamp.toISOString(),
    };

    // Broadcast to wallet subscribers (the borrower who got liquidated)
    this.broadcast(event.wallet, message);

    // Also broadcast to clients subscribed to the liquidator's wallet
    if (event.liquidator !== event.wallet && event.liquidator !== 'unknown') {
      this.broadcast(event.liquidator, message);
    }
  }

  // ─── Connection Handling ─────────────────────────────────────────

  private handleConnection(ws: WebSocket): void {
    const client: ClientState = {
      ws,
      subscribedWallets: new Set(),
      subscribedAll: false,
    };
    this.clients.set(ws, client);
    this.stats.connected++;
    this.stats.peakConnections = Math.max(this.stats.peakConnections, this.stats.connected);

    console.log(`[Varuna WS] Client connected (${this.stats.connected} total)`);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this.handleClientMessage(client, msg);
      } catch {
        this.send(ws, { type: 'error', data: { message: 'Invalid JSON' }, timestamp: new Date().toISOString() });
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
      this.stats.connected--;
      console.log(`[Varuna WS] Client disconnected (${this.stats.connected} total)`);
    });

    ws.on('error', () => {
      this.clients.delete(ws);
      this.stats.connected--;
    });
  }

  private handleClientMessage(client: ClientState, msg: { action?: string; wallet?: string }): void {
    switch (msg.action) {
      case 'subscribe':
        if (msg.wallet === '*') {
          client.subscribedAll = true;
          this.send(client.ws, {
            type: 'subscribed',
            data: { wallet: '*', message: 'Subscribed to all wallets' },
            timestamp: new Date().toISOString(),
          });
        } else if (msg.wallet) {
          client.subscribedWallets.add(msg.wallet);
          this.send(client.ws, {
            type: 'subscribed',
            wallet: msg.wallet,
            data: { wallet: msg.wallet, message: `Subscribed to ${msg.wallet}` },
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'unsubscribe':
        if (msg.wallet === '*') {
          client.subscribedAll = false;
          client.subscribedWallets.clear();
          this.send(client.ws, {
            type: 'unsubscribed',
            data: { wallet: '*', message: 'Unsubscribed from all' },
            timestamp: new Date().toISOString(),
          });
        } else if (msg.wallet) {
          client.subscribedWallets.delete(msg.wallet);
          this.send(client.ws, {
            type: 'unsubscribed',
            wallet: msg.wallet,
            data: { wallet: msg.wallet, message: `Unsubscribed from ${msg.wallet}` },
            timestamp: new Date().toISOString(),
          });
        }
        break;

      default:
        this.send(client.ws, {
          type: 'error',
          data: { message: 'Unknown action. Use: subscribe, unsubscribe', actions: ['subscribe', 'unsubscribe'] },
          timestamp: new Date().toISOString(),
        });
    }
  }

  // ─── Internal ────────────────────────────────────────────────────

  private broadcast(wallet: string, message: WsMessage): void {
    const payload = JSON.stringify(message);

    for (const [, client] of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      if (client.subscribedAll || client.subscribedWallets.has(wallet)) {
        client.ws.send(payload);
        this.stats.messagesSent++;
      }
    }
  }

  private send(ws: WebSocket, message: WsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      this.stats.messagesSent++;
    }
  }

  getStats() {
    return {
      ...this.stats,
      subscriberCount: this.clients.size,
    };
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    this.stats.connected = 0;
  }
}
