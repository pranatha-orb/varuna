import { Connection, PublicKey } from '@solana/web3.js';
import { LendingPosition, CollateralAsset, DebtAsset } from '../../types';

// Simplified Kamino adapter using direct RPC calls
// Note: Full SDK integration has type compatibility issues with @solana/kit
export class KaminoAdapter {
  private connection: Connection;

  // Kamino Lending Program ID
  private static readonly KAMINO_PROGRAM = new PublicKey('KLend2g3cP87ber41GJZGYsChYBcFdNcTyRniYQ1dQj');

  // Main Market
  private static readonly MAIN_MARKET = new PublicKey('7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF');

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getPosition(wallet: string): Promise<LendingPosition | null> {
    try {
      const walletPubkey = new PublicKey(wallet);

      // Search for obligation accounts belonging to this wallet
      const obligations = await this.fetchObligationsForWallet(walletPubkey);

      if (obligations.length === 0) {
        console.log(`[Kamino] No obligations found for ${wallet}`);
        return null;
      }

      return obligations[0];
    } catch (error) {
      console.error('[Kamino] Error fetching position:', error);
      return null;
    }
  }

  private async fetchObligationsForWallet(walletPubkey: PublicKey): Promise<LendingPosition[]> {
    try {
      // Fetch all Kamino obligations for this wallet
      // Owner is typically at offset 32 in obligation account
      const accounts = await this.connection.getProgramAccounts(
        KaminoAdapter.KAMINO_PROGRAM,
        {
          filters: [
            { memcmp: { offset: 32, bytes: walletPubkey.toBase58() } },
          ],
        }
      );

      const positions: LendingPosition[] = [];
      for (const account of accounts) {
        try {
          const position = this.parseObligationAccount(account.account.data, walletPubkey.toBase58());
          if (position) {
            positions.push(position);
          }
        } catch (e) {
          // Skip unparseable accounts
        }
      }

      return positions;
    } catch (error) {
      console.error('[Kamino] Error fetching obligations:', error);
      return [];
    }
  }

  private parseObligationAccount(data: Buffer, wallet: string): LendingPosition | null {
    try {
      // Simplified parsing for hackathon
      // In production would use Kamino SDK for proper decoding

      if (data.length < 200) {
        return null;
      }

      const collateral: CollateralAsset[] = [];
      const debt: DebtAsset[] = [];

      // Try to extract deposited/borrowed values from known offsets
      // These are approximate offsets for Kamino obligation layout
      let depositedValue = 0;
      let borrowedValue = 0;

      try {
        // Read values (simplified - real implementation needs proper layout)
        depositedValue = Number(data.readBigUInt64LE(97)) / 1e9;
        borrowedValue = Number(data.readBigUInt64LE(113)) / 1e9;
      } catch (e) {
        // Use default values
      }

      // Calculate health factor
      let healthFactor = 999;
      if (borrowedValue > 0 && depositedValue > 0) {
        // Kamino uses ~80% LTV for most assets
        const liquidationThreshold = 0.85;
        healthFactor = (depositedValue * liquidationThreshold) / borrowedValue;
      }

      // Only return if we detected a position
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
          protocol: 'kamino',
          wallet,
          collateral,
          debt,
          healthFactor,
          liquidationThreshold: 0.85,
          lastUpdated: new Date(),
        };
      }

      return null;
    } catch (error) {
      console.error('[Kamino] Error parsing obligation:', error);
      return null;
    }
  }

  async getHealthFactor(wallet: string): Promise<number> {
    const position = await this.getPosition(wallet);
    return position?.healthFactor ?? 0;
  }
}
