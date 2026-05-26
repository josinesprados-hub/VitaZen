export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { sendSubscriptionConfirmedEmail } from '@/lib/emails/sender';
import { trackEvent } from '@/lib/analytics-server';
import Stripe from 'stripe';

// ─── Idempotency: prevent duplicate event processing ─────────────────
// Stripe retries webhooks on 500 responses or connection drops.
// Without dedup, a single event could:
//   - Create duplicate Subscription records
//   - Send duplicate confirmation emails
//   - Track duplicate analytics events
// The StripeEventLog table stores processed event IDs.
// Auto-cleaned: events older than 7 days are pruned on each webhook call.

const EVENT_TTL_DAYS = 7;

async function isEventProcessed(eventId: string): Promise<boolean> {
  try {
    const existing = await db.stripeEventLog.findUnique({ where: { eventId } });
    return !!existing;
  } catch {
    // If the table doesn't exist yet (migration not applied), log and continue
    // rather than blocking ALL webhook processing.
    console.warn('[Webhook] StripeEventLog table not available — skipping dedup for event:', eventId);
    return false;
  }
}

async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  try {
    await db.stripeEventLog.create({
      data: { eventId, eventType },
    });
  } catch {
    // Unique constraint violation = already processed (race condition)
    // This is fine — another worker beat us to it.
  }
}

async function cleanupOldEvents(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - EVENT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const result = await db.stripeEventLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log('[Webhook] Cleaned up', result.count, 'old event logs');
    }
  } catch {
    // Non-critical: cleanup failure must never block webhook processing
  }
}

// ─── Resolve userId from checkout session ────────────────────────────
// Primary: session.metadata.userId (set during checkout creation)
// Fallback: lookup by session.customer → customer.metadata.userId
// This handles edge cases where metadata wasn't set (e.g. manual
// checkout created via Stripe Dashboard).

async function resolveUserId(session: Stripe.Checkout.Session): Promise<string | null> {
  // Primary path: userId in session metadata
  if (session.metadata?.userId) {
    return session.metadata.userId;
  }

  // Fallback: look up customer metadata
  const customerId = session.customer as string | null;
  if (!customerId) {
    console.warn('[Webhook] No userId in metadata and no customer ID — cannot resolve user');
    return null;
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ('deleted' in customer && customer.deleted) {
      console.warn('[Webhook] Customer deleted — cannot resolve userId:', customerId);
      return null;
    }
    if ('metadata' in customer && customer.metadata?.userId) {
      console.log('[Webhook] Resolved userId from customer metadata (fallback):', customer.metadata.userId);
      return customer.metadata.userId;
    }
  } catch (e) {
    console.error('[Webhook] Failed to retrieve customer for userId fallback:', e);
  }

  // Last resort: search our DB by stripeCustomerId
  try {
    const user = await db.user.findUnique({ where: { stripeCustomerId: customerId } });
    if (user) {
      console.log('[Webhook] Resolved userId from DB stripeCustomerId (last resort):', user.id);
      return user.id;
    }
  } catch {
    // DB lookup failed
  }

  console.warn('[Webhook] Could not resolve userId for session:', session.id);
  return null;
}

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

  // ─── Idempotency check ──────────────────────────────────────────
  if (await isEventProcessed(event.id)) {
    console.log('[Webhook] Duplicate event skipped:', event.id, event.type);
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const userId = await resolveUserId(session);

        console.log('[Webhook] checkout.session.completed — userId:', userId || 'null', 'customerId:', customerId || 'null', 'eventId:', event.id);

        if (!userId) {
          console.error('[Webhook] checkout.session.completed — CANNOT resolve userId. Session:', session.id, 'Customer paid but will NOT get premium. Manual intervention required.');
          // Still mark as processed to avoid infinite retries
          await markEventProcessed(event.id, event.type);
          await cleanupOldEvents();
          break;
        }

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

        // ─── ATOMIC: user update + subscription create in one transaction ───
        // Previously these were separate operations — if subscription.create
        // failed, the user was PREMIUM with no Subscription record (ghost state).
        // Now they succeed or fail together.
        await db.$transaction(async (tx) => {
          // Mark any existing active subscriptions as superseded
          const existingActive = await tx.subscription.findFirst({
            where: { userId, status: 'active' },
          });

          if (existingActive) {
            console.warn('[Webhook] User already has active subscription — marking old as superseded:', existingActive.id);
            await tx.subscription.update({
              where: { id: existingActive.id },
              data: { status: 'superseded' },
            });
          }

          // Update user plan + stripeCustomerId atomically
          const updateData: Record<string, unknown> = { plan: 'PREMIUM' };
          if (customerId) {
            updateData.stripeCustomerId = customerId;
          } else {
            console.warn('[Webhook] checkout.session.completed — no session.customer, stripeCustomerId not updated for user:', userId);
          }

          await tx.user.update({
            where: { id: userId },
            data: updateData,
          });

          console.log('[Webhook] User updated — plan: PREMIUM, stripeCustomerId:', customerId || 'unchanged');

          // Create subscription record (within transaction)
          // Use upsert to handle edge case where subscription already exists
          // (e.g. from a previous failed webhook attempt that partially succeeded)
          if (subscriptionId) {
            await tx.subscription.upsert({
              where: { stripeSubscriptionId: subscriptionId },
              create: {
                userId,
                stripeSubscriptionId: subscriptionId,
                stripePriceId,
                status: 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              },
              update: {
                userId,
                stripePriceId,
                status: 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                cancelAtPeriodEnd: false,
              },
            });
          } else {
            // One-time payment or missing subscription ID — create a synthetic record
            await tx.subscription.create({
              data: {
                userId,
                stripeSubscriptionId: `checkout_${session.id}`,
                stripePriceId,
                status: 'active',
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
              },
            });
          }
        });

        // Track premium upgrade completion (fire-and-forget, outside transaction)
        trackEvent({ event: 'premium_upgrade_completed', userId }).catch(() => {});

        // Send confirmation email (fire-and-forget, outside transaction)
        try {
          const user = await db.user.findUnique({ where: { id: userId } });
          if (user?.email) {
            sendSubscriptionConfirmedEmail(user.email, user.name || 'Amigo', 'Élite')
              .then(() => console.log('[Webhook] Subscription confirmation email sent'))
              .catch((err) => console.error('[Webhook] Subscription confirmation email failed:', err instanceof Error ? err.message : err));
          }
        } catch {
          // Email lookup failure must not affect webhook response
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] customer.subscription.updated — subId:', subscription.id, 'status:', subscription.status, 'eventId:', event.id);

        // Resolve userId from customer
        let userId: string | null = null;
        try {
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if ('metadata' in customer && !('deleted' in customer)) {
            userId = customer.metadata.userId || null;
          }
        } catch (e) {
          console.error('[Webhook] Could not retrieve customer for subscription update:', e);
        }

        // Fallback: find user by subscription in our DB
        if (!userId) {
          try {
            const existingSub = await db.subscription.findUnique({
              where: { stripeSubscriptionId: subscription.id },
              select: { userId: true },
            });
            if (existingSub) {
              userId = existingSub.userId;
              console.log('[Webhook] Resolved userId from existing subscription record:', userId);
            }
          } catch {
            // DB lookup failed
          }
        }

        if (!userId) {
          console.warn('[Webhook] customer.subscription.updated — cannot resolve userId for sub:', subscription.id);
          await markEventProcessed(event.id, event.type);
          await cleanupOldEvents();
          break;
        }

        // Update subscription record
        try {
          await db.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              userId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0]?.price.id || '',
              status: subscription.status,
              currentPeriodStart: new Date(subscription.current_period_start * 1000),
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              status: subscription.status,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });
        } catch (e) {
          console.error('[Webhook] Failed to update subscription record:', e);
        }

        // ─── Sync user.plan with subscription status ───────────────────
        // CRITICAL: Don't downgrade on `past_due` — Stripe is still retrying
        // the payment. Only downgrade on terminal/confirmed-inactive statuses.
        //
        // Grace period strategy:
        //   past_due     → keep PREMIUM (Stripe retries payment for ~7 days)
        //   trialing     → keep PREMIUM
        //   active       → ensure PREMIUM
        //   incomplete   → keep PREMIUM briefly (initial payment may be processing)
        //   incomplete_expired → downgrade (terminal, payment definitively failed)
        //   canceled     → downgrade
        //   unpaid       → downgrade
        const keepPremiumStatuses = ['active', 'trialing', 'past_due', 'incomplete'];
        const downgradeStatuses = ['canceled', 'unpaid', 'incomplete_expired'];

        if (downgradeStatuses.includes(subscription.status)) {
          // Check if user has any other active/trialing subscription before downgrading
          const otherActive = await db.subscription.findFirst({
            where: {
              userId,
              status: { in: ['active', 'trialing'] },
              stripeSubscriptionId: { not: subscription.id },
            },
          });
          if (!otherActive) {
            await db.user.update({
              where: { id: userId },
              data: { plan: 'FREE' },
            });
            console.log('[Webhook] Subscription terminal-inactive — user downgraded to FREE:', userId, 'status:', subscription.status);
          } else {
            console.log('[Webhook] Subscription inactive but another active sub exists — keeping PREMIUM:', userId);
          }
        } else if (subscription.status === 'active') {
          // Ensure user is marked PREMIUM if subscription is active
          // (restores premium if it was temporarily lost)
          const user = await db.user.findUnique({ where: { id: userId } });
          if (user && user.plan !== 'PREMIUM') {
            await db.user.update({
              where: { id: userId },
              data: { plan: 'PREMIUM' },
            });
            console.log('[Webhook] Subscription active — user restored to PREMIUM:', userId);
          }
        } else if (subscription.status === 'past_due') {
          // past_due: Stripe is retrying the payment (up to ~7 days).
          // Keep user as PREMIUM during retry period.
          // If retries all fail, Stripe will transition to 'canceled' or 'unpaid',
          // which WILL trigger downgrade in the block above.
          console.log('[Webhook] Subscription past_due — keeping PREMIUM during Stripe retry period:', userId);
        } else if (subscription.status === 'incomplete') {
          // incomplete: initial payment is still processing.
          // Keep PREMIUM and let Stripe resolve it.
          console.log('[Webhook] Subscription incomplete — keeping PREMIUM while payment processes:', userId);
        }

        console.log('[Webhook] Subscription updated for user:', userId);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('[Webhook] customer.subscription.deleted — subId:', subscription.id, 'eventId:', event.id);

        // Resolve userId — try customer metadata first, then DB fallback
        let userId: string | null = null;
        try {
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if ('metadata' in customer && !('deleted' in customer)) {
            userId = customer.metadata.userId || null;
          }
        } catch (e) {
          console.error('[Webhook] Could not retrieve customer for subscription deletion:', e);
        }

        // Fallback: find user by subscription in our DB
        if (!userId) {
          try {
            const existingSub = await db.subscription.findUnique({
              where: { stripeSubscriptionId: subscription.id },
              select: { userId: true },
            });
            if (existingSub) {
              userId = existingSub.userId;
              console.log('[Webhook] Resolved userId from existing subscription record (deleted):', userId);
            }
          } catch {
            // DB lookup failed
          }
        }

        if (!userId) {
          console.warn('[Webhook] customer.subscription.deleted — cannot resolve userId for sub:', subscription.id);
          await markEventProcessed(event.id, event.type);
          await cleanupOldEvents();
          break;
        }

        // Check if user has any other active subscription before downgrading
        const otherActive = await db.subscription.findFirst({
          where: {
            userId,
            status: { in: ['active', 'trialing'] },
            stripeSubscriptionId: { not: subscription.id },
          },
        });

        if (!otherActive) {
          await db.user.update({
            where: { id: userId },
            data: { plan: 'FREE' },
          });
          console.log('[Webhook] Subscription canceled, user downgraded to FREE:', userId);
        } else {
          console.log('[Webhook] Subscription canceled but another active sub exists — keeping PREMIUM:', userId);
        }

        // Mark this subscription as canceled (use updateMany for safety)
        await db.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: 'canceled' },
        });

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        console.log('[Webhook] invoice.payment_failed — invoice:', invoice.id, 'subscription:', subscriptionId || 'null', 'attempt:', invoice.attempt_count, 'eventId:', event.id);

        // Log for observability — we don't downgrade on payment failure
        // because Stripe will send customer.subscription.updated with
        // past_due status, which we handle with a grace period above.
        // If all retries fail, Stripe transitions to canceled/unpaid,
        // which triggers downgrade in the subscription.updated handler.
        //
        // This handler exists purely for logging/observability.
        // In the future, it could trigger a notification email to the user.
        break;
      }

      default:
        console.log('[Webhook] Unhandled event type:', event.type, 'eventId:', event.id);
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    // DON'T mark as processed — Stripe will retry, which is correct
    // because the handler failed. If the error is persistent, we need
    // to know about it (and Stripe will alert us after multiple failures).
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  // ─── Mark event as processed + cleanup old events ────────────────
  // Only mark as processed if the handler succeeded (no throw).
  // This way, Stripe retries are useful for actual failures.
  await markEventProcessed(event.id, event.type);
  await cleanupOldEvents();

  return NextResponse.json({ received: true });
}
