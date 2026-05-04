import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { sendSubscriptionConfirmedEmail } from '@/lib/emails/sender';
import Stripe from 'stripe';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;

        if (userId) {
          await db.user.update({
            where: { id: userId },
            data: { plan: 'PREMIUM' },
          });

          await db.subscription.create({
            data: {
              userId,
              stripeSubscriptionId: session.subscription as string,
              stripePriceId: session.line_items?.data[0]?.price?.id || '',
              status: 'active',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });

          const user = await db.user.findUnique({ where: { id: userId } });
          if (user?.email) {
            await sendSubscriptionConfirmedEmail(user.email, user.name || 'Amigo', 'Premium');
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if ('metadata' in customer) {
          const userId = customer.metadata.userId;
          if (userId) {
            await db.subscription.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: {
                status: subscription.status,
                cancelAtPeriodEnd: subscription.cancel_at_period_end,
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              },
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if ('metadata' in customer) {
          const userId = customer.metadata.userId;
          if (userId) {
            await db.user.update({
              where: { id: userId },
              data: { plan: 'FREE' },
            });
            await db.subscription.updateMany({
              where: { stripeSubscriptionId: subscription.id },
              data: { status: 'canceled' },
            });
          }
        }
        break;
      }
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
