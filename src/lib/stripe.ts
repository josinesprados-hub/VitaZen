import Stripe from 'stripe';

function getStripeClient(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;

  if (!apiKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is required. ' +
      'Set it in the deployment environment (e.g. Vercel > Project Settings > Environment Variables).'
    );
  }

  return new Stripe(apiKey, {
    // No apiVersion specified — SDK uses its bundled default
    // This avoids version mismatch errors with Stripe API
  });
}

// Lazy initialization via Proxy — defers Stripe client setup until first actual use.
// This prevents build failures when env vars are unavailable during static prerendering.
// All existing `stripe.customers.create()` etc. calls work unchanged.
let _stripe: Stripe | null = null;

function getLazyStripe(): Stripe {
  if (!_stripe) {
    _stripe = getStripeClient();
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getLazyStripe();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    aiMessagesLimit: 15, // Must match FREE_DAILY_LIMIT in @/lib/limits.ts
  },
  PREMIUM: {
    name: 'Élite',
    price: 5,
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
    aiMessagesLimit: Infinity,
  },
} as const;
