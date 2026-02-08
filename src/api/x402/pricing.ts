/**
 * Endpoint Pricing Configuration for Varuna API
 *
 * Pricing tiers:
 * - Free: Basic endpoints, config, control
 * - Standard ($0.001): Data aggregation
 * - Premium ($0.003-0.005): High-value analysis
 * - Execution ($0.01): Transaction building
 */

export type PricingTier = 'free' | 'standard' | 'premium' | 'execution';

export interface EndpointPrice {
  price: string;          // e.g., "$0.005"
  priceUsd: number;       // Numeric value for calculations
  tier: PricingTier;
  description: string;
}

// Route pattern → pricing
// Pattern format: "METHOD:path" where path uses :param for dynamic segments
export const ENDPOINT_PRICING: Record<string, EndpointPrice> = {
  // ═══════════════════════════════════════════════════════════════
  // FREE TIER - Basic endpoints, funnel, config
  // ═══════════════════════════════════════════════════════════════
  'GET:/health': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Service health check',
  },
  'GET:/api/status': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Monitor status',
  },
  'GET:/api/health/:wallet': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Basic wallet health check',
  },
  'GET:/api/yields/:protocol': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Yield leaderboard',
  },
  'GET:/api/liquidations/stats': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Liquidation statistics',
  },
  'GET:/api/ws/stats': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'WebSocket statistics',
  },
  'POST:/api/watch': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Add wallet to watchlist',
  },
  'DELETE:/api/watch/:wallet': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Remove wallet from watchlist',
  },
  'GET:/api/protect/config': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Get protection config',
  },
  'PUT:/api/protect/config': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Update protection config',
  },
  'POST:/api/monitor/start': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Start monitoring',
  },
  'POST:/api/monitor/stop': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Stop monitoring',
  },
  'POST:/api/liquidations/start': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Start liquidation feed',
  },
  'POST:/api/liquidations/stop': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Stop liquidation feed',
  },
  'GET:/api/alerts': {
    price: '$0',
    priceUsd: 0,
    tier: 'free',
    description: 'Get alerts',
  },

  // ═══════════════════════════════════════════════════════════════
  // STANDARD TIER ($0.001) - Data aggregation
  // ═══════════════════════════════════════════════════════════════
  'GET:/api/positions/:wallet': {
    price: '$0.001',
    priceUsd: 0.001,
    tier: 'standard',
    description: 'All wallet positions',
  },
  'GET:/api/positions/:wallet/:protocol': {
    price: '$0.001',
    priceUsd: 0.001,
    tier: 'standard',
    description: 'Single protocol position',
  },
  'GET:/api/risk/:wallet/:protocol/trend': {
    price: '$0.001',
    priceUsd: 0.001,
    tier: 'standard',
    description: 'Health factor trend history',
  },
  'GET:/api/liquidations': {
    price: '$0.001',
    priceUsd: 0.001,
    tier: 'standard',
    description: 'Recent liquidation events',
  },
  'GET:/api/protect/log': {
    price: '$0.001',
    priceUsd: 0.001,
    tier: 'standard',
    description: 'Protection execution log',
  },

  // ═══════════════════════════════════════════════════════════════
  // PREMIUM TIER ($0.003 - $0.005) - High-value analysis
  // ═══════════════════════════════════════════════════════════════
  'GET:/api/risk/:wallet': {
    price: '$0.005',
    priceUsd: 0.005,
    tier: 'premium',
    description: 'Full 5-factor risk assessment (all protocols)',
  },
  'GET:/api/risk/:wallet/:protocol': {
    price: '$0.003',
    priceUsd: 0.003,
    tier: 'premium',
    description: '5-factor risk assessment (single protocol)',
  },
  'GET:/api/protect/:wallet/:protocol': {
    price: '$0.005',
    priceUsd: 0.005,
    tier: 'premium',
    description: 'Yield-aware protection options analysis',
  },
  'GET:/api/collateral/:wallet': {
    price: '$0.005',
    priceUsd: 0.005,
    tier: 'premium',
    description: 'Collateral yield optimization (all protocols)',
  },
  'GET:/api/collateral/:wallet/:protocol': {
    price: '$0.003',
    priceUsd: 0.003,
    tier: 'premium',
    description: 'Collateral yield optimization (single protocol)',
  },

  // ═══════════════════════════════════════════════════════════════
  // EXECUTION TIER ($0.01) - Transaction building
  // ═══════════════════════════════════════════════════════════════
  'POST:/api/protect/:wallet/:protocol': {
    price: '$0.01',
    priceUsd: 0.01,
    tier: 'execution',
    description: 'Execute protection action (dry-run or live)',
  },
};

/**
 * Normalize a request path to match pricing patterns.
 * Replaces dynamic segments with :param placeholders.
 */
function normalizePath(path: string): string {
  return path
    // Remove trailing slash
    .replace(/\/$/, '')
    // Replace Solana wallet addresses (32-44 base58 chars)
    .replace(/\/[1-9A-HJ-NP-Za-km-z]{32,44}(?=\/|$)/g, '/:wallet')
    // Replace protocol names
    .replace(/\/(kamino|marginfi|solend)(?=\/|$)/g, '/:protocol')
    // Replace 'trend' segment after :protocol (for /risk/:wallet/:protocol/trend)
    // This is already handled by the pattern above
    ;
}

/**
 * Get pricing for a route.
 * Returns null if route is free or not found (defaults to free).
 */
export function getEndpointPrice(method: string, path: string): EndpointPrice | null {
  const normalizedPath = normalizePath(path);
  const key = `${method.toUpperCase()}:${normalizedPath}`;

  const pricing = ENDPOINT_PRICING[key];

  // If not found or free, return null (no payment required)
  if (!pricing || pricing.priceUsd === 0) {
    return null;
  }

  return pricing;
}

/**
 * Convert USD price to USDC lamports (6 decimals).
 * $0.001 = 1000 lamports
 */
export function usdToUsdcLamports(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

/**
 * Get all endpoint prices for documentation.
 */
export function getAllPricing(): Record<PricingTier, { endpoint: string; price: string; description: string }[]> {
  const result: Record<PricingTier, { endpoint: string; price: string; description: string }[]> = {
    free: [],
    standard: [],
    premium: [],
    execution: [],
  };

  for (const [endpoint, pricing] of Object.entries(ENDPOINT_PRICING)) {
    result[pricing.tier].push({
      endpoint,
      price: pricing.price,
      description: pricing.description,
    });
  }

  return result;
}
