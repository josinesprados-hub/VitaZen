export const dynamic = 'force-dynamic';
export const maxDuration = 300;
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
//
// C-03 FIX: Claim-first pattern replaces the previous check-then-mark
// approach (isEventProcessed → process → markEventProcessed) which had
// a TOCTOU window between the READ and WRITE. Now we WRITE first (claim
// the event via create), and only proceed if the claim succeeds. If
// another worker already claimed the same eventId, the @@unique
// constraint rejects it with P2002, and we skip processing.
// On processing failure, the claim is rolled back (deleted) so Stripe
// can safely retry the event.

const EVENT_TTL_DAYS = 7;

async function claimEvent(eventId: string, eventType: string): Promise<boolean> {
  try {
    await db.stripeEventLog.create({
      data: { eventId, eventType },
    });
    return true; // Claim succeeded — this worker owns the event
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      // Unique constraint violation — another worker already claimed
      // this event. Safe to skip.
      return false;
    }
    // If the table doesn't exist yet (migration not applied), or any
    // other error, log and allow processing to continue (fail-open).
    // This preserves the original fail-open behavior.
    serverLog.warn('webhook/stripe', 'Event claim failed (non-P2002) — continuing', { eventId });
    return true;
  }
}

async function rollbackClaim(eventId: string): Promise<void> {
  try {
    await db.stripeEventLog.deleteMany({ where: { eventId } });
  } catch {
    // Best-effort rollback — don't block the 500 response
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

  let event: Stripe.Event | null = null;

  // ─── Signature verification with dual-secret support ────────────
  // Try the LIVE secret first. If it fails, fall back to the TEST secret.
  // Both secrets are server-side-only, high-entropy strings — neither is
  // "less protected" than the other. The dual-secret approach allows the
  // same production endpoint to handle both live and test Stripe events,
  // which is required because Vercel always sets NODE_ENV=production.
  //
  // SECURITY NOTE: Accepting test-signed events on production is safe because:
  //   1. Only Stripe can generate valid webhook signatures
  //   2. Both secrets are stored identically (env vars on server)
  //   3. An attacker would need to steal a secret from Stripe Dashboard or
  //      Vercel env — the test secret offers no easier attack vector
  //   4. Stripe signs test events with the test secret, live events with
  //      the live secret — they never cross
  //
  // PREVIOUS BUG: A `!isProduction` gate blocked the test fallback on
  // Vercel (where NODE_ENV is always 'production'), causing ALL test-mode
  // webhooks to fail with 400 "Invalid signature".

  let secretUsed: 'live' | 'test' | null = null;
  const attemptErrors: Array<{ label: string; error: string; secretLen: number }> = [];

  for (const [label, secret] of [
    ['live', process.env.STRIPE_WEBHOOK_SECRET],
    ['test', process.env.STRIPE_TEST_WEBHOOK_SECRET],
  ] as const) {
    if (!secret) {
      attemptErrors.push({ label, error: 'MISSING from env', secretLen: 0 });
      continue;
    }
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      eventType = event.type;
      eventId = event.id;
      secretUsed = label;
      break;
    } catch (err) {
      attemptErrors.push({
        label,
        error: err instanceof Error ? err.message : String(err),
        secretLen: secret.length,
      });
    }
  }

  if (!secretUsed) {
    // Parse body safely (no throw) to extract livemode/type for diagnosis
    let eventLivemode: boolean | null = null;
    let eventTypeFromBody: string | null = null;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      eventLivemode = typeof parsed.livemode === 'boolean' ? parsed.livemode : null;
      eventTypeFromBody = typeof parsed.type === 'string' ? parsed.type : null;
    } catch { /* body not parseable, skip */ }

    serverLog.error('webhook/stripe', 'Webhook signature verification failed — no matching secret', undefined, {
      hasLiveSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      hasTestSecret: !!process.env.STRIPE_TEST_WEBHOOK_SECRET,
      liveSecretLength: process.env.STRIPE_WEBHOOK_SECRET?.length ?? 0,
      testSecretLength: process.env.STRIPE_TEST_WEBHOOK_SECRET?.length ?? 0,
      eventLivemode,
      eventTypeFromBody,
      attempts: attemptErrors,
      bodyLength: body.length,
      signaturePresent: true,
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (secretUsed === 'test') {
    serverLog.info('webhook/stripe', 'Webhook verified with TEST secret', { eventType, eventId });
  }

  // TypeScript guard: event is guaranteed non-null here because
  // the !secretUsed check above returns 400 if event was never constructed.
  const verifiedEvent = event!;

  // ─── FASE 9A (A-2): Reject test-mode events in Vercel production ────
  // Vercel always sets NODE_ENV=production. Stripe test events signed
  // with the test webhook secret pass signature verification, but
  // must not modify real user data in production.
  // Allow test events locally (NODE_ENV !== 'production').
  if (process.env.NODE_ENV === 'production' && !verifiedEvent.livemode) {
    serverLog.warn('webhook/stripe', 'Test-mode event rejected in production', {
      eventType: verifiedEvent.type,
      eventId: verifiedEvent.id,
    });
    return NextResponse.json({ received: true, rejected: 'test_event_in_production' });
  }

  // ─── C-03 FIX: Claim-first idempotency ─────────────────────────
  // Attempt to atomically claim this event BEFORE processing.
  // If another worker already claimed it, we skip all side effects.
  if (!(await claimEvent(verifiedEvent.id, verifiedEvent.type))) {
    serverLog.info('webhook/stripe', 'Duplicate event skipped (claim-first)', { eventType, eventId });
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    switch (verifiedEvent.type) {
      case 'checkout.session.completed': {
        const session = verifiedEvent.data.object as Stripe.Checkout.Session;
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
          // Event already claimed — just clean up old events
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
        const subscription = verifiedEvent.data.object as Stripe.Subscription;
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
          // Event already claimed — just clean up old events
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

          // M-01 FIX: Wrap subscription upsert + plan sync in a single
          // transaction. Previously the upsert was outside the tx, so a
          // failure between upsert and plan sync left inconsistent state
          // (subscription record updated but user.plan not synced).
          const downgradeStatuses = ['canceled', 'unpaid', 'incomplete_expired'];

          await db.$transaction(async (tx) => {
            // H-03 FIX: Advisory lock prevents race with concurrent webhooks
            await tx.$executeRaw`
              SELECT pg_advisory_xact_lock(
                ('x' || substring(md5(${userId} || '|plan-sync'), 1, 16))::bit(64)::bigint
              )
            `;

            // Upsert subscription record (now inside the same tx)
            await tx.subscription.upsert({
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
                // BUG-C3 FIX: Also update currentPeriodStart on renewal.
                ...(typeof itemPeriodStart === 'number' ? { currentPeriodStart: new Date(itemPeriodStart * 1000) } : {}),
                ...(typeof itemPeriodEnd === 'number' ? { currentPeriodEnd: new Date(itemPeriodEnd * 1000) } : {}),
              },
            });

            // Sync user.plan with subscription status
            if (downgradeStatuses.includes(subscription.status)) {
              const otherActive = await tx.subscription.findFirst({
                where: {
                  userId,
                  status: { in: ['active', 'trialing'] },
                  stripeSubscriptionId: { not: subscription.id },
                },
              });
              if (!otherActive) {
                await tx.user.update({
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
              const user = await tx.user.findUnique({ where: { id: userId } });
              if (user && user.plan !== 'PREMIUM') {
                await tx.user.update({
                  where: { id: userId },
                  data: { plan: 'PREMIUM' },
                });
                serverLog.info('webhook/stripe', 'Subscription active — user restored to PREMIUM');
              }
            } else if (subscription.status === 'trialing') {
              const user = await tx.user.findUnique({ where: { id: userId } });
              if (user && user.plan !== 'PREMIUM') {
                await tx.user.update({
                  where: { id: userId },
                  data: { plan: 'PREMIUM' },
                });
                serverLog.info('webhook/stripe', 'Subscription trialing — user promoted to PREMIUM');
              }
            } else if (subscription.status === 'past_due') {
              serverLog.info('webhook/stripe', 'Subscription past_due — keeping PREMIUM during Stripe retry period');
            } else if (subscription.status === 'incomplete') {
              serverLog.info('webhook/stripe', 'Subscription incomplete — keeping PREMIUM while payment processes');
            }
          });

        } catch (e) {
          serverLog.error('webhook/stripe', 'Failed to update subscription or sync plan', e, {
            subId: subscription.id,
          });
        }

        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = verifiedEvent.data.object as Stripe.Subscription;
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
          // Event already claimed — just clean up old events
          await cleanupOldEvents();
          break;
        }

        // H-03 FIX: Wrap downgrade check in a transaction with advisory lock
        // to prevent race with concurrent checkout.session.completed or
        // customer.subscription.updated events for the same user.
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              ('x' || substring(md5(${userId} || '|plan-sync'), 1, 16))::bit(64)::bigint
            )
          `;

          // Check if user has any other active subscription before downgrading
          const otherActive = await tx.subscription.findFirst({
            where: {
              userId,
              status: { in: ['active', 'trialing'] },
              stripeSubscriptionId: { not: subscription.id },
            },
          });

          if (!otherActive) {
            await tx.user.update({
              where: { id: userId },
              data: { plan: 'FREE' },
            });
            serverLog.info('webhook/stripe', 'Subscription canceled, user downgraded to FREE');
          } else {
            serverLog.info('webhook/stripe', 'Subscription canceled but another active sub exists — keeping PREMIUM');
          }

          // Mark this subscription as canceled
          await tx.subscription.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: { status: 'canceled' },
          });
        });

        break;
      }

      case 'customer.subscription.created': {
        const subscription = verifiedEvent.data.object as Stripe.Subscription;
        serverLog.info('webhook/stripe', 'customer.subscription.created', {
          subId: subscription.id,
          status: subscription.status,
          customerId: subscription.customer,
          eventId,
        });

        // Resolve userId from customer metadata
        let userId: string | null = null;
        try {
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if ('metadata' in customer && !('deleted' in customer)) {
            userId = customer.metadata.userId || null;
          }
        } catch (e) {
          serverLog.error('webhook/stripe', 'Could not retrieve customer for subscription created', e);
        }

        // Fallback: find user by stripeCustomerId in our DB
        if (!userId) {
          try {
            const user = await db.user.findUnique({
              where: { stripeCustomerId: subscription.customer as string },
              select: { id: true },
            });
            if (user) {
              userId = user.id;
              serverLog.info('webhook/stripe', 'Resolved userId from DB stripeCustomerId (subscription.created)');
            }
          } catch {
            // DB lookup failed
          }
        }

        if (!userId) {
          serverLog.warn('webhook/stripe', 'customer.subscription.created — cannot resolve userId', {
            subId: subscription.id,
            customerId: subscription.customer,
          });
          // Event already claimed — just clean up old events
          await cleanupOldEvents();
          break;
        }

        // Create subscription record and promote user
        const firstItem = subscription.items.data[0];
        const itemPeriodStart = firstItem?.current_period_start;
        const itemPeriodEnd = firstItem?.current_period_end;

        await db.$transaction(async (tx) => {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              ('x' || substring(md5(${userId} || '|plan-sync'), 1, 16))::bit(64)::bigint
            )
          `;

          await tx.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              userId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: firstItem?.price.id || '',
              status: subscription.status,
              currentPeriodStart: typeof itemPeriodStart === 'number' ? new Date(itemPeriodStart * 1000) : new Date(),
              currentPeriodEnd: typeof itemPeriodEnd === 'number' ? new Date(itemPeriodEnd * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              status: subscription.status,
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
              stripePriceId: firstItem?.price.id || '',
              ...(typeof itemPeriodStart === 'number' ? { currentPeriodStart: new Date(itemPeriodStart * 1000) } : {}),
              ...(typeof itemPeriodEnd === 'number' ? { currentPeriodEnd: new Date(itemPeriodEnd * 1000) } : {}),
            },
          });

          // Promote user if subscription is active or trialing
          if (['active', 'trialing'].includes(subscription.status)) {
            const user = await tx.user.findUnique({ where: { id: userId } });
            if (user && user.plan !== 'PREMIUM') {
              await tx.user.update({
                where: { id: userId },
                data: { plan: 'PREMIUM', stripeCustomerId: subscription.customer as string },
              });
              serverLog.info('webhook/stripe', 'Subscription created — user promoted to PREMIUM');
            }
          }
        });

        break;
      }

      case 'invoice.paid': {
        const invoice = verifiedEvent.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as unknown as { subscription?: string | null }).subscription as string | null;

        serverLog.info('webhook/stripe', 'invoice.paid', {
          invoiceId: invoice.id,
          subscriptionId: subscriptionId || 'null',
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          eventId,
        });

        // Update subscription period dates on successful payment/renewal
        if (!subscriptionId) {
          break;
        }

        // Retrieve the subscription to get updated period dates (Stripe API — outside TX)
        let subscription: Stripe.Subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        } catch (e) {
          serverLog.error('webhook/stripe', 'Failed to retrieve subscription from Stripe', e, { subscriptionId });
          break;
        }
        const firstItem = subscription.items.data[0];
        const itemPeriodStart = firstItem?.current_period_start;
        const itemPeriodEnd = firstItem?.current_period_end;

        // Resolve userId for advisory lock key (fast indexed lookup)
        const existingSub = await db.subscription.findUnique({
          where: { stripeSubscriptionId: subscriptionId },
          select: { userId: true },
        });
        if (!existingSub) {
          serverLog.warn('webhook/stripe', 'invoice.paid — subscription not found in DB', { subscriptionId });
          break;
        }

        // DI-04 FIX: Wrap period update + plan sync in a single transaction
        // with advisory lock to prevent partial writes and races with other
        // plan-changing events (subscription.deleted, subscription.created, etc.)
        await db.$transaction(async (tx) => {
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(
              ('x' || substring(md5(${existingSub.userId} || '|plan-sync'), 1, 16))::bit(64)::bigint
            )
          `;

          // Update subscription period dates on successful payment/renewal
          if (typeof itemPeriodStart === 'number' && typeof itemPeriodEnd === 'number') {
            await tx.subscription.update({
              where: { stripeSubscriptionId: subscriptionId },
              data: {
                currentPeriodStart: new Date(itemPeriodStart * 1000),
                currentPeriodEnd: new Date(itemPeriodEnd * 1000),
                status: subscription.status,
              },
            });
            serverLog.info('webhook/stripe', 'Updated period dates from invoice.paid', {
              subscriptionId,
              newStart: new Date(itemPeriodStart * 1000).toISOString(),
              newEnd: new Date(itemPeriodEnd * 1000).toISOString(),
            });
          }

          // Ensure user plan is PREMIUM on successful invoice payment
          const user = await tx.user.findUnique({ where: { id: existingSub.userId } });
          if (user && user.plan !== 'PREMIUM' && ['active', 'trialing'].includes(subscription.status)) {
            await tx.user.update({
              where: { id: existingSub.userId },
              data: { plan: 'PREMIUM' },
            });
            serverLog.info('webhook/stripe', 'invoice.paid — user restored to PREMIUM');
          }
        });

        break;
      }

      case 'invoice.payment_failed': {
        const invoice = verifiedEvent.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as unknown as { subscription?: string | null }).subscription as string | null;

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
        serverLog.info('webhook/stripe', 'Unhandled event type', { eventType: verifiedEvent.type, eventId: verifiedEvent.id });
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
    // C-03 FIX: Rollback the claim so Stripe can retry the event.
    // The claim was made before processing (claim-first pattern), so we
    // must remove it on failure to allow Stripe's retry mechanism to work.
    await rollbackClaim(verifiedEvent.id);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  // ─── Cleanup old events ─────────────────────────────────────────
  // Event was already claimed before processing (claim-first pattern).
  // No need to mark again — just clean up expired entries.
  await cleanupOldEvents();

  const durationMs = Date.now() - start;
  serverLog.info('webhook/stripe', 'Webhook processed successfully', {
    eventType,
    eventId,
    durationMs,
  });

  return NextResponse.json({ received: true });
}
