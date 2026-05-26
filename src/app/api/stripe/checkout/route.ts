export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { stripe, PLANS } from '@/lib/stripe';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';

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
    const existingActiveSub = await db.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: ['active', 'trialing'] },
      },
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

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id, firebaseUid: user.firebaseUid },
      });
      customerId = customer.id;
      await db.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
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
