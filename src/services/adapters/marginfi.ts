import { Connection, PublicKey } from '@solana/web3.js';
import { LendingPosition } from '../../types';

export class MarginFiAdapter {
  private connection: Connection;

  // MarginFi program ID
  private static readonly MARGINFI_PROGRAM = new PublicKey('MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA');

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getPosition(wallet: string): Promise<LendingPosition | null> {
    try {
      const walletPubkey = new PublicKey(wallet);

      // Fetch MarginFi accounts for this wallet
      const accounts = await this.connection.getProgramAccounts(
        MarginFiAdapter.MARGINFI_PROGRAM,
        {
          filters: [
            { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } },
          ],
        }
      );

      if (accounts.length === 0) {
        return null;
      }

      // Parse marginfi account data
      // In production, use @mrgnlabs/marginfi-client-v2
      const position = await this.parseAccount(accounts[0].account.data, wallet);
      return position;
    } catch (error) {
      console.error('[MarginFi] Error fetching position:', error);
      return null;
    }
  }

  private async parseAccount(data: Buffer, wallet: string): Promise<LendingPosition> {
    // Simplified - real implementation would use MarginFi SDK

    return {
      protocol: 'marginfi',
      wallet,
      collateral: [],
      debt: [],
      healthFactor: 1.5,
      liquidationThreshold: 0.8,
      lastUpdated: new Date(),
    };
  }

  async getHealthFactor(wallet: string): Promise<number> {
    const position = await this.getPosition(wallet);
    return position?.healthFactor ?? 0;
  }
}
