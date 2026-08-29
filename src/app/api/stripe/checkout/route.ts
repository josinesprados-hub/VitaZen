export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { stripe, PLANS } from '@/lib/stripe';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const rl = await rateLimit(user.id, 'stripe:checkout', RATE_LIMITS['stripe:checkout']);
    if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

    if (user.plan === 'PREMIUM') {
      // User already has premium — check if they have an active subscription
      const activeSub = user.subscriptions?.find(
        (s) => s.status === 'active' || s.status === 'trialing'
      );
      if (activeSub) {
        return NextResponse.json(
          { error: 'already_subscribed', message: 'Ya tienes Élite activo. Puedes gestionar tu suscripción en Ajustes.' },
          { status: 400 }
        );
      }
      // User is PREMIUM but has no active subscription — allow checkout
      // (could be a manual admin promotion, or a ghost state from a bug)
      console.warn('[Checkout] User is PREMIUM but has no active subscription — allowing checkout:', user.id);
    }

    // ─── Prevent duplicate active checkout sessions ───────────────
    // Check if user already has an active subscription to avoid creating
    // a second one. This catches edge cases where:
    //   - User opens checkout in two tabs
    //   - Webhook hasn't processed yet but user tries again
    //
    // BUG-B5 FIX: The original check was a non-atomic read (findFirst).
    // Two concurrent checkout requests could both pass the check before
    // either created a subscription, resulting in double billing.
    // Now wrapped in a transaction with pg_advisory_xact_lock keyed on
    // the userId, so concurrent checkouts for the same user are serialized.
    // The lock is transaction-scoped — it auto-releases on commit/rollback,
    // so it never blocks future legitimate checkouts.
    const existingActiveSub = await db.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock on this user.
      // Key is derived from md5('checkout|' + userId) — first 8 bytes as bigint.
      const lockSeed = 'checkout|' + user.id;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${lockSeed}), 1, 16))::bit(64)::bigint
        )`;

      return tx.subscription.findFirst({
        where: {
          userId: user.id,
          status: { in: ['active', 'trialing'] },
        },
      });
    });

    if (existingActiveSub) {
      // User has an active subscription but plan might not be PREMIUM yet
      // (webhook race condition). Promote them and redirect to portal.
      if (user.plan !== 'PREMIUM') {
        await db.user.update({
          where: { id: user.id },
          data: { plan: 'PREMIUM' },
        });
        console.log('[Checkout] Found active subscription but FREE plan — promoted:', user.id);
      }
      return NextResponse.json(
        { error: 'already_subscribed', message: 'Ya tienes una suscripción activa. Puedes gestionarla en Ajustes.' },
        { status: 400 }
      );
    }

    // F8.4-03 FIX: Second guard — check Stripe directly for active subscriptions.
    // If DB and Stripe are desynchronized (e.g. webhook delayed, user reactivated
    // from Stripe portal), the DB check above may miss an active subscription.
    // Querying Stripe prevents creating a duplicate checkout session / double charge.
    if (user.stripeCustomerId) {
      try {
        const stripeSubs = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
          limit: 1,
        });
        if (stripeSubs.data.length > 0) {
          // Stripe has an active sub that DB doesn't know about — promote and reject checkout
          if (user.plan !== 'PREMIUM') {
            await db.user.update({
              where: { id: user.id },
              data: { plan: 'PREMIUM' },
            });
            console.log('[Checkout] Found active Stripe sub not in DB — promoted:', user.id);
          }
          return NextResponse.json(
            { error: 'already_subscribed', message: 'Ya tienes una suscripción activa. Puedes gestionarla en Ajustes.' },
            { status: 400 }
          );
        }
      } catch (e) {
        console.error('[Checkout] Stripe subscription check failed (non-blocking):', e);
        // Continue with checkout — don't block on Stripe API failure
      }
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id, firebaseUid: user.firebaseUid },
      });
      customerId = customer.id;
      try {
        await db.user.update({
          where: { id: user.id },
          data: { stripeCustomerId: customerId },
        });
      } catch (dbError) {
        // F8.4-11 FIX: If DB update fails after creating Stripe customer,
        // clean up the orphaned Stripe customer to prevent duplicates on retry.
        console.error('[Checkout] DB update failed after customer creation, cleaning up:', dbError);
        try { await stripe.customers.del(customerId); } catch { /* best-effort */ }
        throw dbError;
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: PLANS.PREMIUM.priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc'}/dashboard?upgraded=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc'}/pricing?canceled=true`,
      metadata: { userId: user.id },
    });

    // Track premium upgrade click
    trackEvent({ event: 'premium_upgrade_clicked', userId: user.id }).catch(() => {});

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
