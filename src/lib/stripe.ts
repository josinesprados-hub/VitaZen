// Lazy Stripe client — avoids calling new Stripe() at module evaluation time.

let _stripe: any = undefined;
function getStripe(): any {
  if (!_stripe) {
    const Stripe = require('stripe').default;
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  }
  return _stripe;
}

const handler: ProxyHandler<Record<string, unknown>> = {
  get(_target, prop) {
    const instance = getStripe();
    const value = instance[prop];
    if (typeof value === 'function') return value.bind(instance);
    return value;
  },
};

export const stripe = new Proxy({}, handler) as any;

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