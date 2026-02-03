import { Connection, PublicKey } from '@solana/web3.js';
import { LendingPosition, CollateralAsset, DebtAsset } from '../../types';

// Lightweight MarginFi adapter using direct RPC calls
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

      // Fetch all MarginFi accounts for this wallet
      const accounts = await this.connection.getProgramAccounts(
        MarginFiAdapter.MARGINFI_PROGRAM,
        {
          filters: [
            // Filter by authority (wallet owner) - typically at offset 8
            { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } },
          ],
        }
      );

      if (accounts.length === 0) {
        console.log(`[MarginFi] No accounts found for ${wallet}`);
        return null;
      }

      // Parse the first account
      return this.parseMarginfiAccount(accounts[0].account.data, wallet);
    } catch (error) {
      console.error('[MarginFi] Error fetching position:', error);
      return null;
    }
  }

  private parseMarginfiAccount(data: Buffer, wallet: string): LendingPosition | null {
    try {
      // Simplified parsing for hackathon
      // Real implementation would properly decode MarginFi account structure

      if (data.length < 100) {
        return null;
      }

      const collateral: CollateralAsset[] = [];
      const debt: DebtAsset[] = [];

      // Try to extract values from known offsets
      // These are approximate and would need verification
      let depositedValue = 0;
      let borrowedValue = 0;

      try {
        // MarginFi account has balances stored in array
        // Simplified: just detect if there's activity
        depositedValue = Number(data.readBigUInt64LE(100)) / 1e9;
        borrowedValue = Number(data.readBigUInt64LE(116)) / 1e9;
      } catch (e) {
        // Use default values
      }

      // Calculate health factor
      let healthFactor = 999;
      if (borrowedValue > 0 && depositedValue > 0) {
        // MarginFi uses maintenance margin of ~90%
        const liquidationThreshold = 0.90;
        healthFactor = (depositedValue * liquidationThreshold) / borrowedValue;
      }

      if (depositedValue > 0 || borrowedValue > 0) {
        if (depositedValue > 0) {
          collateral.push({
            mint: 'aggregate',
            symbol: 'COLLATERAL',
            amount: depositedValue,
            valueUsd: depositedValue,
          });
        }

        if (borrowedValue > 0) {
          debt.push({
            mint: 'aggregate',
            symbol: 'DEBT',
            amount: borrowedValue,
            valueUsd: borrowedValue,
            interestRate: 0,
          });
        }

        return {
          protocol: 'marginfi',
          wallet,
          collateral,
          debt,
          healthFactor,
          liquidationThreshold: 0.90,
          lastUpdated: new Date(),
        };
      }

      return null;
    } catch (error) {
      console.error('[MarginFi] Error parsing account:', error);
      return null;
    }
  }

  async getHealthFactor(wallet: string): Promise<number> {
    const position = await this.getPosition(wallet);
    return position?.healthFactor ?? 0;
  }
}
