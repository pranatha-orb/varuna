/**
 * x402 Payment Middleware for Varuna API
 *
 * Implements HTTP 402 Payment Required flow:
 * 1. Client requests resource
 * 2. Server returns 402 with payment requirements
 * 3. Client pays via Solana USDC
 * 4. Client retries with X-PAYMENT header
 * 5. Server verifies payment via PayAI facilitator
 * 6. Server returns resource
 */

import { Request, Response, NextFunction } from 'express';
import { x402Config, getNetworkName } from './config';
import { getEndpointPrice, usdToUsdcLamports } from './pricing';

// PayAI facilitator endpoints
const FACILITATOR_VERIFY = '/verify';
const FACILITATOR_SETTLE = '/settle';

/**
 * x402 Payment Required response body (v2 protocol)
 */
interface PaymentRequiredResponse {
  x402Version: 2;
  error: string;
  accepts: {
    network: string;
    token: string;
    recipient: string;
    amount: string;
  }[];
  description: string;
  facilitator: string;
}

/**
 * Verify payment via PayAI facilitator
 */
async function verifyPayment(
  paymentHeader: string,
  expectedAmount: bigint,
): Promise<{ valid: boolean; error?: string; txSignature?: string }> {
  try {
    const response = await fetch(`${x402Config.facilitatorUrl}${FACILITATOR_VERIFY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment: paymentHeader,
        network: x402Config.network,
        recipient: x402Config.walletAddress,
        token: x402Config.paymentToken,
        minAmount: expectedAmount.toString(),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[x402] Facilitator verify failed: ${response.status} ${errorText}`);
      return { valid: false, error: `Facilitator error: ${response.status}` };
    }

    const result = await response.json() as {
      valid?: boolean;
      txSignature?: string;
      signature?: string;
      error?: string;
    };

    if (result.valid) {
      return { valid: true, txSignature: result.txSignature || result.signature };
    } else {
      return { valid: false, error: result.error || 'Payment verification failed' };
    }
  } catch (error) {
    console.error('[x402] Facilitator verify error:', error);
    return { valid: false, error: 'Failed to verify payment' };
  }
}

/**
 * Settle payment via PayAI facilitator (optional, for tracking)
 */
async function settlePayment(txSignature: string): Promise<void> {
  try {
    await fetch(`${x402Config.facilitatorUrl}${FACILITATOR_SETTLE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        signature: txSignature,
        network: x402Config.network,
      }),
    });
  } catch (error) {
    // Settlement is optional, log but don't fail
    console.warn('[x402] Settlement notification failed:', error);
  }
}

/**
 * Create 402 Payment Required response
 */
function createPaymentRequiredResponse(
  price: string,
  priceUsd: number,
  description: string,
): PaymentRequiredResponse {
  const amountLamports = usdToUsdcLamports(priceUsd);

  return {
    x402Version: 2,
    error: 'Payment required',
    accepts: [
      {
        network: x402Config.network,
        token: x402Config.paymentToken,
        recipient: x402Config.walletAddress,
        amount: amountLamports.toString(),
      },
    ],
    description: `${x402Config.description}: ${description}`,
    facilitator: x402Config.facilitatorUrl,
  };
}

// Demo/Judge bypass key (for hackathon testing)
const DEMO_BYPASS_KEY = process.env.VARUNA_DEMO_KEY || 'VARUNA-JUDGE-2026';
const DEMO_HEADER = 'x-varuna-demo';

/**
 * Main x402 payment middleware.
 * Checks if endpoint requires payment, verifies payment if header present.
 */
export function varunaPaymentMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if x402 is disabled
    if (!x402Config.enabled) {
      return next();
    }

    // Check for demo/judge bypass header
    const demoHeader = req.headers[DEMO_HEADER] as string | undefined;
    if (demoHeader === DEMO_BYPASS_KEY) {
      // Mark as demo access for logging
      (req as any).x402Demo = true;
      console.log(`[x402] Demo bypass: ${req.method} ${req.path}`);
      return next();
    }

    // Skip if wallet not configured
    if (!x402Config.walletAddress) {
      console.warn('[x402] Payment wallet not configured, skipping payment check');
      return next();
    }

    // Check if this endpoint requires payment
    const pricing = getEndpointPrice(req.method, req.path);

    if (!pricing) {
      // Free endpoint, pass through
      return next();
    }

    // Check for payment header (x402 v2 uses various header names)
    const paymentHeader =
      req.headers['x-payment'] ||
      req.headers['payment-signature'] ||
      req.headers['x-payment-signature'];

    if (!paymentHeader || typeof paymentHeader !== 'string') {
      // No payment provided, return 402
      const paymentRequired = createPaymentRequiredResponse(
        pricing.price,
        pricing.priceUsd,
        pricing.description,
      );

      console.log(`[x402] 402 Payment Required: ${req.method} ${req.path} (${pricing.price})`);

      return res.status(402).json(paymentRequired);
    }

    // Payment header provided, verify it
    console.log(`[x402] Verifying payment for ${req.method} ${req.path}...`);

    const expectedAmount = usdToUsdcLamports(pricing.priceUsd);
    const verification = await verifyPayment(paymentHeader, expectedAmount);

    if (!verification.valid) {
      console.log(`[x402] Payment verification failed: ${verification.error}`);

      return res.status(402).json({
        x402Version: 2,
        error: 'Payment verification failed',
        details: verification.error,
        accepts: createPaymentRequiredResponse(
          pricing.price,
          pricing.priceUsd,
          pricing.description,
        ).accepts,
      });
    }

    // Payment verified! Log and continue
    console.log(`[x402] Payment verified: ${verification.txSignature}`);

    // Store payment info in request for later use
    (req as any).x402Payment = {
      verified: true,
      txSignature: verification.txSignature,
      amount: pricing.price,
      tier: pricing.tier,
    };

    // Settle payment asynchronously (don't wait)
    if (verification.txSignature) {
      settlePayment(verification.txSignature).catch(() => {});
    }

    return next();
  };
}

/**
 * Add payment receipt to response (for transparency).
 */
export function addPaymentReceipt() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if x402 is disabled
    if (!x402Config.enabled) {
      return next();
    }

    const originalJson = res.json.bind(res);

    res.json = (data: any) => {
      // If demo access, include demo receipt
      if ((req as any).x402Demo) {
        data = {
          ...data,
          _x402: {
            demo: true,
            message: 'Demo/Judge access - no payment required',
            network: getNetworkName(),
          },
        };
        return originalJson(data);
      }

      // If payment was made, include receipt
      const payment = (req as any).x402Payment;
      if (payment?.verified) {
        data = {
          ...data,
          _x402: {
            paid: true,
            amount: payment.amount,
            tier: payment.tier,
            txSignature: payment.txSignature,
            network: getNetworkName(),
            token: 'USDC',
          },
        };
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Endpoint to get pricing information
 */
export function pricingEndpoint() {
  return (_req: Request, res: Response) => {
    const { getAllPricing } = require('./pricing');
    const pricing = getAllPricing();

    res.json({
      service: x402Config.description,
      enabled: x402Config.enabled,
      network: getNetworkName(),
      facilitator: x402Config.facilitatorUrl,
      recipient: x402Config.walletAddress,
      token: 'USDC',
      tokenMint: x402Config.paymentToken,
      tiers: pricing,
    });
  };
}
