import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    aiMessagesLimit: 10,
  },
  PREMIUM: {
    name: 'Premium',
    price: 5,
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    aiMessagesLimit: Infinity,
  },
} as const;
