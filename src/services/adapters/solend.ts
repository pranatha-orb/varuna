import { Connection, PublicKey } from '@solana/web3.js';
import { LendingPosition } from '../../types';

export class SolendAdapter {
  private connection: Connection;

  // Solend program ID
  private static readonly SOLEND_PROGRAM = new PublicKey('So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo');

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getPosition(wallet: string): Promise<LendingPosition | null> {
    try {
      const walletPubkey = new PublicKey(wallet);

      // Fetch Solend obligation accounts for this wallet
      const accounts = await this.connection.getProgramAccounts(
        SolendAdapter.SOLEND_PROGRAM,
        {
          filters: [
            { dataSize: 1300 }, // Obligation account size
            { memcmp: { offset: 10, bytes: walletPubkey.toBase58() } },
          ],
        }
      );

      if (accounts.length === 0) {
        return null;
      }

      // Parse obligation data
      // In production, use @solendprotocol/solend-sdk
      const position = await this.parseObligation(accounts[0].account.data, wallet);
      return position;
    } catch (error) {
      console.error('[Solend] Error fetching position:', error);
      return null;
    }
  }

  private async parseObligation(data: Buffer, wallet: string): Promise<LendingPosition> {
    // Simplified - real implementation would use Solend SDK

    return {
      protocol: 'solend',
      wallet,
      collateral: [],
      debt: [],
      healthFactor: 1.5,
      liquidationThreshold: 0.85,
      lastUpdated: new Date(),
    };
  }

  async getHealthFactor(wallet: string): Promise<number> {
    const position = await this.getPosition(wallet);
    return position?.healthFactor ?? 0;
  }
}
