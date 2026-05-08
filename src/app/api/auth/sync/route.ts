export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, syncUserToDatabase } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendWelcomeEmail, sendVerifyEmail } from '@/lib/emails/sender';
import { adminAuth } from '@/lib/firebase-admin';
import { trackEvent } from '@/lib/analytics-server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

// How recent a user must be (in ms) to qualify for a welcome email retry
// in the "existing user" path. Covers cases where the first sync call
// failed to send the welcome email (e.g. Resend timeout, cold start, etc.)
const WELCOME_RETRY_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

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
      // Sync emailVerified from Firebase if needed
      if (decodedToken.email_verified && !existingUser.emailVerified) {
        await db.user.update({
          where: { id: existingUser.id },
          data: { emailVerified: true },
        });
        existingUser.emailVerified = true;
      }

      // ─── Welcome email safety net ───
      // If the user was created very recently, the welcome email might have
      // failed on the first sync call (Resend cold-start, timeout, etc.).
      // Try once more so the user doesn't miss their welcome email.
      const userAge = Date.now() - existingUser.createdAt.getTime();
      if (
        existingUser.email &&
        !existingUser.emailVerified &&
        userAge < WELCOME_RETRY_WINDOW_MS
      ) {
        console.log('[WELCOME] retry — user created', Math.round(userAge / 1000), 's ago, email not yet verified');
        sendWelcomeEmail(existingUser.email, existingUser.name || 'Amigo')
          .then(() => console.log('[WELCOME] retry sent ✓'))
          .catch((err) => console.error('[WELCOME] retry failed:', err instanceof Error ? err.message : err));
        // Fire-and-forget: do NOT await — return the response immediately.
        // This prevents the existing-user path from becoming slow or error-prone.
      } else {
        console.log('[WELCOME] skipped — user exists, age:', Math.round(userAge / 1000), 's, verified:', existingUser.emailVerified);
      }

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
          weeklyEmailSummary: existingUser.weeklyEmailSummary,
          dailyReminders: existingUser.dailyReminders,
          privacyStatsVisible: existingUser.privacyStatsVisible,
          emailVerified: existingUser.emailVerified,
          createdAt: existingUser.createdAt,
          onboardingCompleted: existingUser.onboardingCompleted,
        },
      });
    }

    // ─── New user path ───
    console.log('[WELCOME] starting — new user, email:', decodedToken.email);

    const user = await syncUserToDatabase(
      decodedToken.uid,
      decodedToken.email!,
      decodedToken.name
    );

    // Track registration event (privacy-first, no PII)
    trackEvent({ event: 'user_registered', userId: user.id });

    // Send both emails in PARALLEL — neither blocks the other.
    // If one fails, the other still works. Registration never blocked.
    if (user.email) {
      console.log('[WELCOME] user.email present — scheduling emails for:', user.email);

      const emailPromises: Promise<void>[] = [];

      // 1. Welcome email (always, non-throwing)
      emailPromises.push(
        sendWelcomeEmail(user.email, user.name || 'Amigo')
          .catch((err) => {
            console.error('[WELCOME] failed in new-user path:', err instanceof Error ? err.message : err);
          })
      );

      // 2. Verification email (only for non-Google users)
      if (!decodedToken.email_verified) {
        emailPromises.push(
          (async () => {
            try {
              const verificationLink = await adminAuth.generateEmailVerificationLink(
                user.email!,
                { url: `${APP_URL}/verify-email?uid=${user.id}` }
              );
              await sendVerifyEmail(user.email!, user.name || 'Amigo', verificationLink);
              console.log('[AUTH SYNC] Verification email sent to:', user.email);
            } catch (verifyError) {
              console.error('[AUTH SYNC] Verification email failed:', verifyError instanceof Error ? verifyError.message : verifyError);
            }
          })()
        );
      }

      // Wait for both — but errors are already caught above, so this always resolves
      await Promise.allSettled(emailPromises);
    } else {
      console.log('[WELCOME] skipped — user.email is falsy');
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
        createdAt: user.createdAt,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error) {
    console.error('[Auth] sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
