import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // No apiVersion specified — SDK uses its bundled default
  // This avoids version mismatch errors with Stripe API
});

export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    aiMessagesLimit: 10,
  },
  PREMIUM: {
    name: 'Profundidad',
    price: 5,
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID!,
    aiMessagesLimit: Infinity,
  },
} as const;
