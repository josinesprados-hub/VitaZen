export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.warn('[Portal] Missing or invalid Authorization header');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      console.warn('[Portal] User not found for provided token');
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const rl = await rateLimit(user.id, 'stripe:portal', RATE_LIMITS['stripe:portal']);
    if (rl.limited) return rateLimitedResponse(rl);

    if (!user.stripeCustomerId) {
      console.warn('[Portal] No stripeCustomerId for user:', user.id, '— plan:', user.plan);
      return NextResponse.json(
        { error: 'No Stripe customer associated with this account. If you recently subscribed, please try again in a few moments.' },
        { status: 400 }
      );
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc'}/dashboard`;

    console.log('[Portal] Creating billing portal session — customer:', user.stripeCustomerId, 'returnUrl:', returnUrl);

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    console.log('[Portal] Session created successfully — url:', session.url);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[Portal] Stripe portal error:', error);
    return NextResponse.json(
      { error: 'Unable to open billing portal. Please try again later.' },
      { status: 500 }
    );
  }
}
