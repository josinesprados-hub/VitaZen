export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/auth';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════
// PROD-04-R: GET /api/auth/session — READ-ONLY
// ═══════════════════════════════════════════
//
// This endpoint performs NO writes (no DB updates, no Stripe calls).
// All synchronization (firebaseUid, emailVerified, email, Stripe)
// is handled by POST /api/auth/sync, which runs on every
// onAuthStateChanged event (page load, login, tab focus).
//
// Additionally, getAuthUser() and getAuthUserBasic() in @/lib/auth
// sync emailVerified on every authenticated API call.
//
// Why this is safe:
// - POST /api/auth/sync covers all 4 sync operations that were here.
// - GET is only called via refreshUser() (post-save, post-checkout, etc.),
//   NOT on page load. The primary auth path is syncUser() → POST /sync.
// - refreshUser() falls back to POST /sync if GET fails.
// - Email changes are extremely infrequent; a 1-refresh delay is acceptable.
//
// DO NOT re-introduce side effects here.

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];

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
    // BUG-A1 FIX: Only allow email fallback if the email is verified.
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
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
