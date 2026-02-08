/**
 * x402 Payment Integration for Varuna API
 *
 * Uses PayAI Facilitator for Solana USDC micropayments.
 * Implements HTTP 402 Payment Required protocol v2.
 *
 * @see https://docs.payai.network/
 * @see https://facilitator.payai.network/
 */

export { x402Config, getNetworkName } from './config';
export type { X402Config } from './config';

export {
  ENDPOINT_PRICING,
  getEndpointPrice,
  usdToUsdcLamports,
  getAllPricing,
} from './pricing';
export type { PricingTier, EndpointPrice } from './pricing';

export {
  varunaPaymentMiddleware,
  addPaymentReceipt,
  pricingEndpoint,
} from './middleware';
