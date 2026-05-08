export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { verifyFirebaseToken } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Sync emailVerified from Firebase token to DB if needed
    try {
      const decodedToken = await verifyFirebaseToken(idToken);
      if (decodedToken?.email_verified && !user.emailVerified) {
        await db.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
        user.emailVerified = true;
      }
    } catch {
      // Non-critical — don't fail the session request
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
          ? {
              count: user.aiUsage.count,
              resetAt: user.aiUsage.resetAt,
            }
          : null,
        subscription: user.subscriptions[0] || null,
      },
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
