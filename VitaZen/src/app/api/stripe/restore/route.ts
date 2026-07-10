export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { stripe, PLANS } from '@/lib/stripe';
import { db } from '@/lib/db';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// POST /api/stripe/restore
// ═══════════════════════════════════════════
//
// BUG-B2 FIX: Restore purchases flow.
//
// Allows a user who lost access to their original Firebase account (and
// created a new one) to recover their existing Stripe subscription.
//
// Flow:
// 1. User authenticates with their NEW Firebase account (new User row,
//    plan=FREE, stripeCustomerId=null).
// 2. User calls /api/stripe/restore.
// 3. We search Stripe for customers with the user's email.
// 4. If we find a customer with an active/trialing subscription, we:
//    a. Link the stripeCustomerId to the current user.
//    b. Set plan=PREMIUM.
//    c. Create/update the Subscription record.
// 5. If no active subscription is found, return 404.
//
// Security:
// - Requires authentication (getAuthUser).
// - Only links subscriptions that belong to the same email — no cross-user
//   linking.
// - Does NOT create new Stripe subscriptions or charge the user.
// - Does NOT modify the Stripe customer or subscription — only reads and
//   links the existing one to the current DB user.

async function handler(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If user already has a stripeCustomerId, check if it has an active sub
    if (user.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all',
          limit: 10,
        });

        const activeSub = subscriptions.data.find(
          (s) => s.status === 'active' || s.status === 'trialing'
        );

        if (activeSub) {
          // User already has access — ensure plan is PREMIUM
          if (user.plan !== 'PREMIUM') {
            await db.user.update({
              where: { id: user.id },
              data: { plan: 'PREMIUM' },
            });
          }

          // Ensure subscription record exists
          const firstItem = activeSub.items.data[0];
          await db.subscription.upsert({
            where: { stripeSubscriptionId: activeSub.id },
            create: {
              userId: user.id,
              stripeSubscriptionId: activeSub.id,
              stripePriceId: firstItem?.price.id || '',
              status: activeSub.status,
              currentPeriodStart: firstItem?.current_period_start
                ? new Date(firstItem.current_period_start * 1000)
                : new Date(),
              currentPeriodEnd: firstItem?.current_period_end
                ? new Date(firstItem.current_period_end * 1000)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              cancelAtPeriodEnd: activeSub.cancel_at_period_end,
            },
            update: {
              userId: user.id,
              status: activeSub.status,
              cancelAtPeriodEnd: activeSub.cancel_at_period_end,
            },
          });

          serverLog.info('stripe/restore', 'Restored via existing stripeCustomerId', {
            userId: user.id,
            customerId: user.stripeCustomerId,
          });

          return NextResponse.json({
            restored: true,
            message: 'Tu suscripción Élite ha sido restaurada.',
          });
        }
      } catch (e) {
        serverLog.error('stripe/restore', 'Failed to check existing customer subscriptions', e);
      }
    }

    // Search Stripe for customers with this email
    const customers = await stripe.customers.list({
      email: user.email,
      limit: 10,
    });

    for (const customer of customers.data) {
      // Skip if this customer is already linked to a DIFFERENT user
      if (customer.metadata?.userId && customer.metadata.userId !== user.id) {
        serverLog.info('stripe/restore', 'Skipping customer — linked to different user', {
          customerId: customer.id,
          linkedUserId: customer.metadata.userId,
        });
        continue;
      }

      // Check for active/trialing subscriptions on this customer
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: 'all',
        limit: 10,
      });

      const activeSub = subscriptions.data.find(
        (s) => s.status === 'active' || s.status === 'trialing'
      );

      if (activeSub) {
        // Found a valid subscription — link it to the current user
        await db.user.update({
          where: { id: user.id },
          data: {
            plan: 'PREMIUM',
            stripeCustomerId: customer.id,
          },
        });

        // Update customer metadata to point to the new user
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: user.id },
        });

        // Create/update subscription record
        const firstItem = activeSub.items.data[0];
        await db.subscription.upsert({
          where: { stripeSubscriptionId: activeSub.id },
          create: {
            userId: user.id,
            stripeSubscriptionId: activeSub.id,
            stripePriceId: firstItem?.price.id || '',
            status: activeSub.status,
            currentPeriodStart: firstItem?.current_period_start
              ? new Date(firstItem.current_period_start * 1000)
              : new Date(),
            currentPeriodEnd: firstItem?.current_period_end
              ? new Date(firstItem.current_period_end * 1000)
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: activeSub.cancel_at_period_end,
          },
          update: {
            userId: user.id,
            status: activeSub.status,
            cancelAtPeriodEnd: activeSub.cancel_at_period_end,
          },
        });

        serverLog.info('stripe/restore', 'Restored via email search', {
          userId: user.id,
          customerId: customer.id,
          subscriptionId: activeSub.id,
        });

        return NextResponse.json({
          restored: true,
          message: 'Tu suscripción Élite ha sido restaurada.',
        });
      }
    }

    // No active subscription found
    return NextResponse.json({
      restored: false,
      message: 'No se encontró una suscripción activa para tu email.',
    }, { status: 404 });
  } catch (error) {
    serverLog.apiError('api/stripe/restore', 'POST', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = handler;
