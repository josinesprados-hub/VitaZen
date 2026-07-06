export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify token once — reuse the decoded result for both
    // user lookup and emailVerified sync (was verifying twice).
    const decodedToken = await verifyFirebaseToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Look up user by firebaseUid (decoded token already verified)
    let user = await db.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      include: {
        aiUsage: { select: { count: true, resetAt: true } },
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Fallback: search by email if firebaseUid doesn't match
    // (same logic as getAuthUser, but without a second token verify)
    // BUG-A1 FIX: Only allow email fallback if the email is verified.
    // Without this check, an attacker can create a Firebase account with the
    // victim's email and overwrite their firebaseUid, taking over the account.
    if (!user && decodedToken.email && decodedToken.email_verified) {
      user = await db.user.findUnique({
        where: { email: decodedToken.email },
        include: {
          aiUsage: { select: { count: true, resetAt: true } },
          subscriptions: {
            where: { status: { in: ['active', 'trialing'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      // Sync firebaseUid if mismatch (same pattern as getAuthUser)
      if (user && user.firebaseUid !== decodedToken.uid) {
        await db.user.update({
          where: { id: user.id },
          data: { firebaseUid: decodedToken.uid },
        });
        user.firebaseUid = decodedToken.uid;
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Sync emailVerified from token to DB if needed (single token verify)
    if (decodedToken.email_verified && !user.emailVerified) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      user.emailVerified = true;
    }

    // BUG-B3 FIX: Sync email from Firebase if it changed and is verified.
    // Previously, the DB email was never updated — only firebaseUid and
    // emailVerified were synced. A user who changed their Firebase email
    // had a stale DB email, causing transactional emails and Stripe
    // receipts to go to the wrong address.
    if (decodedToken.email_verified && decodedToken.email && user.email !== decodedToken.email) {
      await db.user.update({
        where: { id: user.id },
        data: { email: decodedToken.email },
      });
      user.email = decodedToken.email;

      // Also update the Stripe customer email if the user has one
      if (user.stripeCustomerId) {
        try {
          const { stripe } = await import('@/lib/stripe');
          await stripe.customers.update(user.stripeCustomerId, {
            email: decodedToken.email,
          });
        } catch {
          // Non-blocking — Stripe email update failure should not prevent login
        }
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        plan: user.plan,
        avatarUrl: user.avatarUrl,
        country: user.country,
        city: user.city,
        age: user.age,
        bio: user.bio,
        weeklyEmailSummary: user.weeklyEmailSummary,
        dailyReminders: user.dailyReminders,
        privacyStatsVisible: user.privacyStatsVisible,
        emailVerified: user.emailVerified,
        welcomeEmailSent: user.welcomeEmailSent,
        createdAt: user.createdAt,
        onboardingCompleted: user.onboardingCompleted,
        aiUsage: user.aiUsage
          ? { count: user.aiUsage.count, resetAt: user.aiUsage.resetAt }
          : null,
        subscription: user.subscriptions[0] || null,
      },
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
