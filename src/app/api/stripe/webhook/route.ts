export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { sendSubscriptionConfirmedEmail } from '@/lib/emails/sender';
import { trackEvent } from '@/lib/analytics-server';
import { serverLog } from '@/lib/observability/server-logger';
import Stripe from 'stripe';

// ─── Error serialization for observability ──────────────────────────
// Extracts detailed error information without altering the error
// handling flow. Designed for Prisma, Stripe, and generic errors.
// ONLY used for logging — never changes behavior.

function serializeWebhookError(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {};

  // Constructor name + message + stack for Error instances
  if (error instanceof Error) {
    details.errorConstructor = error.constructor.name;
    details.errorMessage = error.message;
    details.errorStack = error.stack;
  } else {
    details.errorConstructor = typeof error;
    try {
      details.errorRaw = String(error);
    } catch {
      details.errorRaw = '[unstringifiable]';
    }
  }

  // Prisma-specific: P2002 (unique constraint), P2025 (not found), P2003 (FK), etc.
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaLike = error as { code?: string; meta?: unknown; clientVersion?: string };
    if (typeof prismaLike.code === 'string' && /^P\d{4}$/.test(prismaLike.code)) {
      details.prismaCode = prismaLike.code;
      try {
        details.prismaMeta = JSON.stringify(prismaLike.meta);
      } catch {
        details.prismaMeta = String(prismaLike.meta);
      }
      details.prismaClientVersion = prismaLike.clientVersion;
    }
  }

  // Stripe-specific: Stripe.errors.* (identified by rawType property)
  if (error && typeof error === 'object' && 'rawType' in error) {
    const stripeLike = error as { type?: string; code?: string; requestId?: string; statusCode?: number };
    details.stripeErrorType = stripeLike.type;
    details.stripeErrorCode = stripeLike.code;
    details.stripeRequestId = stripeLike.requestId;
    details.stripeStatusCode = stripeLike.statusCode;
  }

  // Safe serialization fallback — captures all own properties
  try {
    details.errorSerialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
  } catch {
    details.errorSerialized = '[not serializable]';
  }

  return details;
}

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
    serverLog.warn('webhook/stripe', 'StripeEventLog table not available — skipping dedup', { eventId });
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
      serverLog.info('webhook/stripe', 'Cleaned up old event logs', { count: result.count });
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
    serverLog.warn('webhook/stripe', 'No userId in metadata and no customer ID — cannot resolve user');
    return null;
  }

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ('deleted' in customer && customer.deleted) {
      serverLog.warn('webhook/stripe', 'Customer deleted — cannot resolve userId', { customerId });
      return null;
    }
    if ('metadata' in customer && customer.metadata?.userId) {
      serverLog.info('webhook/stripe', 'Resolved userId from customer metadata (fallback)');
      return customer.metadata.userId;
    }
  } catch (e) {
    serverLog.error('webhook/stripe', 'Failed to retrieve customer for userId fallback', e);
  }

  // Last resort: search our DB by stripeCustomerId
  try {
    const user = await db.user.findUnique({ where: { stripeCustomerId: customerId } });
    if (user) {
      serverLog.info('webhook/stripe', 'Resolved userId from DB stripeCustomerId (last resort)');
      return user.id;
    }
  } catch {
    // DB lookup failed
  }

  serverLog.warn('webhook/stripe', 'Could not resolve userId for session');
  return null;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let eventType = 'unknown';
  let eventId = 'unknown';
  let checkoutSessionContext: Record<string, unknown> | null = null;

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    eventType = event.type;
    eventId = event.id;
  } catch (liveErr) {
    // Live secret failed — try Test secret if available
    const testSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
    if (testSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, testSecret);
        eventType = event.type;
        eventId = event.id;
        serverLog.info('webhook/stripe', 'Webhook verified with Test secret', { eventType, eventId });
      } catch (testErr) {
        serverLog.error('webhook/stripe', 'Webhook signature verification failed (both secrets)', testErr, {
          eventType,
        });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
      }
    } else {
      serverLog.error('webhook/stripe', 'Webhook signature verification failed', liveErr, {
        eventType,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  }

  // ─── Idempotency check ──────────────────────────────────────────
  if (await isEventProcessed(event.id)) {
    serverLog.info('webhook/stripe', 'Duplicate event skipped', { eventType, eventId });
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const userId = await resolveUserId(session);

        serverLog.info('webhook/stripe', 'checkout.session.completed', {
          userId: userId ? '[RESOLVED]' : 'null',
          customerId: customerId || 'null',
          eventId,
        });

        // Store context for error observability in outer catch
        checkoutSessionContext = {
          userId,
          customerId: customerId || null,
          subscriptionId: session.subscription ?? null,
          sessionId: session.id,
        };

        if (!userId) {
          serverLog.error('webhook/stripe', 'CANNOT resolve userId — customer paid but will NOT get premium. Manual intervention required.', undefined, {
            sessionId: session.id,
            eventType,
          });
          // Still mark as processed to avoid infinite retries
          await markEventProcessed(event.id, event.type);
          await cleanupOldEvents();
          break;
        }

        // Fetch line items explicitly — they are NOT included in the event object
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
        const stripePriceId = lineItems.data[0]?.price?.id || '';

        // Get subscription period dates if available
        // Stripe Basil/Dahlia: current_period_start/end moved from Subscription
        // to SubscriptionItem. Fallback to defaults if unavailable.
        const subscriptionId = session.subscription as string;
        let periodStart = new Date();
        let periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (subscriptionId) {
          try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const firstItem = subscription.items.data[0];
            if (firstItem && typeof firstItem.current_period_start === 'number' && typeof firstItem.current_period_end === 'number') {
              periodStart = new Date(firstItem.current_period_start * 1000);
              periodEnd = new Date(firstItem.current_period_end * 1000);
            } else {
              serverLog.error('webhook/stripe', 'Subscription item missing period dates — using defaults', undefined, {
                subscriptionId,
                hasItems: !!firstItem,
                itemStartType: typeof firstItem?.current_period_start,
                itemEndType: typeof firstItem?.current_period_end,
              });
            }
          } catch (e) {
            serverLog.error('webhook/stripe', 'Could not retrieve subscription details', e, {
              subscriptionId,
            });
          }
        }

        // ─── ATOMIC: user update + subscription create in one transaction ───
        await db.$transaction(async (tx) => {
          // Mark any existing active subscriptions as superseded
          const existingActive = await tx.subscription.findFirst({
            where: { userId, status: 'active' },
          });

          if (existingActive) {
            serverLog.warn('webhook/stripe', 'User already has active subscription — marking old as superseded', {
              oldSubId: existingActive.id,
            });
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
            serverLog.warn('webhook/stripe', 'No session.customer — stripeCustomerId not updated');
          }

          await tx.user.update({
            where: { id: userId },
            data: updateData,
          });

          serverLog.info('webhook/stripe', 'User updated — plan: PREMIUM');

          // Create subscription record (within transaction)
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
              .then(() => serverLog.info('webhook/stripe', 'Subscription confirmation email sent'))
              .catch((err) => serverLog.error('webhook/stripe', 'Subscription confirmation email failed', err));
          }
        } catch {
          // Email lookup failure must not affect webhook response
        }

        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        serverLog.info('webhook/stripe', 'customer.subscription.updated', {
          subId: subscription.id,
          status: subscription.status,
          eventId,
        });

        // Resolve userId from customer
        let userId: string | null = null;
        try {
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if ('metadata' in customer && !('deleted' in customer)) {
            userId = customer.metadata.userId || null;
          }
        } catch (e) {
          serverLog.error('webhook/stripe', 'Could not retrieve customer for subscription update', e);
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
              serverLog.info('webhook/stripe', 'Resolved userId from existing subscription record');
            }
          } catch {
            // DB lookup failed
          }
        }

        if (!userId) {
          serverLog.warn('webhook/stripe', 'customer.subscription.updated — cannot resolve userId', {
            subId: subscription.id,
          });
          await markEventProcessed(event.id, event.type);
          await cleanupOldEvents();
          break;
        }

        // Update subscription record
        // Stripe Basil/Dahlia: current_period_start/end moved from Subscription
        // to SubscriptionItem. Use items.data[0] with defensive validation.
        try {
          const firstItem = subscription.items.data[0];
          const itemPeriodStart = firstItem?.current_period_start;
          const itemPeriodEnd = firstItem?.current_period_end;

          if (!firstItem || typeof itemPeriodStart !== 'number' || typeof itemPeriodEnd !== 'number') {
            serverLog.error('webhook/stripe', 'Subscription update — item missing period dates, skipping period update', undefined, {
              subId: subscription.id,
              hasItems: !!firstItem,
              itemStartType: typeof itemPeriodStart,
              itemEndType: typeof itemPeriodEnd,
            });
          }

          await db.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              userId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0]?.price.id || '',
              status: subscription.status,
              currentPeriodStart: typeof itemPeriodStart === 'number' ? new Date(itemPeriodStart * 1000) : new Date(),
              currentPeriodEnd: typeof itemPeriodEnd === 'number' ? new Date(itemPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              status: subscription.status,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              ...(typeof itemPeriodEnd === 'number' ? { currentPeriodEnd: new Date(itemPeriodEnd * 1000) } : {}),
            },
          });
        } catch (e) {
          serverLog.error('webhook/stripe', 'Failed to update subscription record', e, {
            subId: subscription.id,
          });
        }

        // ─── Sync user.plan with subscription status ───────────────────
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
            serverLog.info('webhook/stripe', 'Subscription terminal-inactive — user downgraded to FREE', {
              status: subscription.status,
            });
          } else {
            serverLog.info('webhook/stripe', 'Subscription inactive but another active sub exists — keeping PREMIUM');
          }
        } else if (subscription.status === 'active') {
          // Ensure user is marked PREMIUM if subscription is active
          const user = await db.user.findUnique({ where: { id: userId } });
          if (user && user.plan !== 'PREMIUM') {
            await db.user.update({
              where: { id: userId },
              data: { plan: 'PREMIUM' },
            });
            serverLog.info('webhook/stripe', 'Subscription active — user restored to PREMIUM');
          }
        } else if (subscription.status === 'past_due') {
          serverLog.info('webhook/stripe', 'Subscription past_due — keeping PREMIUM during Stripe retry period');
        } else if (subscription.status === 'incomplete') {
          serverLog.info('webhook/stripe', 'Subscription incomplete — keeping PREMIUM while payment processes');
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        serverLog.info('webhook/stripe', 'customer.subscription.deleted', {
          subId: subscription.id,
          eventId,
        });

        // Resolve userId — try customer metadata first, then DB fallback
        let userId: string | null = null;
        try {
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if ('metadata' in customer && !('deleted' in customer)) {
            userId = customer.metadata.userId || null;
          }
        } catch (e) {
          serverLog.error('webhook/stripe', 'Could not retrieve customer for subscription deletion', e);
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
              serverLog.info('webhook/stripe', 'Resolved userId from existing subscription record (deleted)');
            }
          } catch {
            // DB lookup failed
          }
        }

        if (!userId) {
          serverLog.warn('webhook/stripe', 'customer.subscription.deleted — cannot resolve userId', {
            subId: subscription.id,
          });
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
          serverLog.info('webhook/stripe', 'Subscription canceled, user downgraded to FREE');
        } else {
          serverLog.info('webhook/stripe', 'Subscription canceled but another active sub exists — keeping PREMIUM');
        }

        // Mark this subscription as canceled
        await db.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: 'canceled' },
        });

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        serverLog.warn('webhook/stripe', 'invoice.payment_failed', {
          invoiceId: invoice.id,
          subscriptionId: subscriptionId || 'null',
          attemptCount: invoice.attempt_count,
          eventId,
        });

        // We don't downgrade on payment failure because Stripe will send
        // customer.subscription.updated with past_due status, which we
        // handle with a grace period. If all retries fail, Stripe
        // transitions to canceled/unpaid, which triggers downgrade.
        break;
      }

      default:
        serverLog.info('webhook/stripe', 'Unhandled event type', { eventType: event.type, eventId: event.id });
    }
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorDetails = serializeWebhookError(error);
    serverLog.error('webhook/stripe', 'Webhook handler error', error, {
      eventType,
      eventId,
      durationMs,
      ...(checkoutSessionContext && { checkout: checkoutSessionContext }),
      ...errorDetails,
    });
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

  const durationMs = Date.now() - start;
  serverLog.info('webhook/stripe', 'Webhook processed successfully', {
    eventType,
    eventId,
    durationMs,
  });

  return NextResponse.json({ received: true });
}
