export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { sendSubscriptionConfirmedEmail } from '@/lib/emails/sender';
import { trackEvent } from '@/lib/analytics-server';
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
        const customerId = session.customer as string | null;

        console.log('[Webhook] checkout.session.completed — userId:', userId, 'customerId:', customerId || 'null');

        if (userId) {
          // Fetch line items explicitly — they are NOT included in the event object
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
          const stripePriceId = lineItems.data[0]?.price?.id || '';

          // Get subscription period dates if available
          const subscriptionId = session.subscription as string;
          let periodStart = new Date();
          let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

          if (subscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(subscriptionId);
              periodStart = new Date(subscription.current_period_start * 1000);
              periodEnd = new Date(subscription.current_period_end * 1000);
            } catch (e) {
              console.error('[Webhook] Could not retrieve subscription details:', e);
            }
          }

          // Save plan + stripeCustomerId so the portal can find the customer
          const updateData: Record<string, unknown> = { plan: 'PREMIUM' };
          if (customerId) {
            updateData.stripeCustomerId = customerId;
          } else {
            console.warn('[Webhook] checkout.session.completed — no session.customer, stripeCustomerId not updated for user:', userId);
          }

          await db.user.update({
            where: { id: userId },
            data: updateData,
          });

          console.log('[Webhook] User updated — plan: PREMIUM, stripeCustomerId:', customerId || 'unchanged');

          // Track premium upgrade completion
          trackEvent({ event: 'premium_upgrade_completed', userId });

          await db.subscription.create({
            data: {
              userId,
              stripeSubscriptionId: subscriptionId || '',
              stripePriceId,
              status: 'active',
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
          });

          const user = await db.user.findUnique({ where: { id: userId } });
          if (user?.email) {
            await sendSubscriptionConfirmedEmail(user.email, user.name || 'Amigo', 'Élite');
          }
        } else {
          console.warn('[Webhook] checkout.session.completed — no userId in session metadata');
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] customer.subscription.updated — subId:', subscription.id, 'status:', subscription.status);
        try {
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
              console.log('[Webhook] Subscription updated for user:', userId);
            }
          }
        } catch (e) {
          console.error('[Webhook] Could not retrieve customer for subscription update:', e);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] customer.subscription.deleted — subId:', subscription.id);
        try {
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
              console.log('[Webhook] Subscription canceled, user downgraded to FREE:', userId);
            }
          }
        } catch (e) {
          console.error('[Webhook] Could not retrieve customer for subscription deletion:', e);
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
