import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, syncUserToDatabase } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendWelcomeEmail } from '@/lib/emails/sender';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'ID token required' }, { status: 400 });
    }

    const decodedToken = await verifyFirebaseToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Search by firebaseUid first
    let existingUser = await db.user.findUnique({ where: { firebaseUid: decodedToken.uid } });

    // If not found by firebaseUid, search by email to avoid P2002
    if (!existingUser && decodedToken.email) {
      existingUser = await db.user.findUnique({ where: { email: decodedToken.email } });
    }

    // If user exists, return it directly
    if (existingUser) {
      return NextResponse.json({
        user: {
          id: existingUser.id,
          firebaseUid: existingUser.firebaseUid,
          email: existingUser.email,
          name: existingUser.name,
          plan: existingUser.plan,
          avatarUrl: existingUser.avatarUrl,
          country: existingUser.country,
          city: existingUser.city,
          age: existingUser.age,
          bio: existingUser.bio,
          createdAt: existingUser.createdAt,
          onboardingCompleted: existingUser.onboardingCompleted,
        },
      });
    }

    // New user: create in database
    const user = await syncUserToDatabase(
      decodedToken.uid,
      decodedToken.email!,
      decodedToken.name
    );

    // Send welcome email for new users
    if (user.email) {
      await sendWelcomeEmail(user.email, user.name || 'Amigo');
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
        createdAt: user.createdAt,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    console.error('[Auth] sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
