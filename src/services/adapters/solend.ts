import { Connection, PublicKey } from '@solana/web3.js';
import { LendingPosition, CollateralAsset, DebtAsset } from '../../types';
import BN from 'bn.js';

// Lightweight Solend adapter using direct RPC calls
export class SolendAdapter {
  private connection: Connection;

  // Solend program ID
  private static readonly SOLEND_PROGRAM = new PublicKey('So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo');

  // Main pool (mainnet)
  private static readonly MAIN_POOL = new PublicKey('4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY');

  // Obligation account size
  private static readonly OBLIGATION_SIZE = 1300;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  async getPosition(wallet: string): Promise<LendingPosition | null> {
    try {
      const walletPubkey = new PublicKey(wallet);

      // Fetch all Solend obligations for this wallet
      const accounts = await this.connection.getProgramAccounts(
        SolendAdapter.SOLEND_PROGRAM,
        {
          filters: [
            { dataSize: SolendAdapter.OBLIGATION_SIZE },
            // Owner is at offset 10 in the obligation account
            { memcmp: { offset: 10, bytes: walletPubkey.toBase58() } },
          ],
        }
      );

      if (accounts.length === 0) {
        console.log(`[Solend] No obligations found for ${wallet}`);
        return null;
      }

      // Parse the first obligation
      return this.parseObligationAccount(accounts[0].account.data, wallet);
    } catch (error) {
      console.error('[Solend] Error fetching position:', error);
      return null;
    }
  }

  private parseObligationAccount(data: Buffer, wallet: string): LendingPosition | null {
    try {
      // Simplified parsing for hackathon
      // Solend obligation layout (simplified):
      // - Version (1 byte)
      // - Last update (9 bytes)
      // - Lending market (32 bytes) at offset 10
      // - Owner (32 bytes) at offset 42
      // - Deposited value (16 bytes) at offset ~74
      // - Borrowed value (16 bytes)
      // - etc.

      if (data.length < SolendAdapter.OBLIGATION_SIZE) {
        return null;
      }

      const collateral: CollateralAsset[] = [];
      const debt: DebtAsset[] = [];

      // Try to extract values
      let depositedValue = 0;
      let borrowedValue = 0;

      try {
        // Read deposited and borrowed values (stored as u128 scaled by 10^18)
        // These offsets are approximate
        const depositedValueOffset = 74;
        const borrowedValueOffset = 90;

        // Read lower 8 bytes of u128 (simplified)
        depositedValue = this.readScaledValue(data, depositedValueOffset);
        borrowedValue = this.readScaledValue(data, borrowedValueOffset);
      } catch (e) {
        // Use default values
      }

      // Calculate health factor
      let healthFactor = 999;
      if (borrowedValue > 0 && depositedValue > 0) {
        // Solend uses ~85% liquidation threshold
        const liquidationThreshold = 0.85;
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
          protocol: 'solend',
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
      console.error('[Solend] Error parsing obligation:', error);
      return null;
    }
  }

  private readScaledValue(data: Buffer, offset: number): number {
    // Read 8 bytes as BigInt and convert to number (divided by 10^18 for WAD)
    try {
      const value = data.readBigUInt64LE(offset);
      return Number(value) / 1e18;
    } catch {
      return 0;
    }
  }

  async getHealthFactor(wallet: string): Promise<number> {
    const position = await this.getPosition(wallet);
    return position?.healthFactor ?? 0;
  }
}
