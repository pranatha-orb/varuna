/**
 * x402 Payment Configuration for Varuna API
 *
 * Uses PayAI Facilitator for Solana payments
 * Docs: https://docs.payai.network/
 */

export interface X402Config {
  enabled: boolean;
  walletAddress: string;           // Varuna's receiving wallet (Solana address)
  network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' | 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';  // CAIP-2 format
  facilitatorUrl: string;          // PayAI facilitator endpoint
  paymentToken: string;            // USDC mint on Solana
  description: string;             // Shown to payers
}

// Solana USDC mint addresses
const USDC_MINTS: Record<string, string> = {
  'mainnet': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// CAIP-2 network identifiers for Solana
// mainnet: solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp
// devnet: solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
const CAIP2_NETWORKS: Record<string, string> = {
  'mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
};

// Determine network from env
const networkEnv = process.env.X402_NETWORK || 'devnet';
const isMainnet = networkEnv === 'mainnet' || networkEnv === 'solana';

export const x402Config: X402Config = {
  enabled: process.env.X402_ENABLED === 'true',
  walletAddress: process.env.VARUNA_PAYMENT_WALLET || '',
  network: (isMainnet ? CAIP2_NETWORKS.mainnet : CAIP2_NETWORKS.devnet) as X402Config['network'],
  facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://facilitator.payai.network',
  paymentToken: isMainnet ? USDC_MINTS.mainnet : USDC_MINTS.devnet,
  description: 'Varuna Risk Intelligence API',
};

// Helper to get network name
export function getNetworkName(): string {
  return isMainnet ? 'solana-mainnet' : 'solana-devnet';
}

// Note: PayAI Facilitator - No API keys required!
// Free tier: 100,000 settlements/month, 4 req/sec
// Endpoints: /verify, /settle, /list
