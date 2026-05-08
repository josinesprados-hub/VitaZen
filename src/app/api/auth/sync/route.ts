export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, syncUserToDatabase } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendWelcomeEmail, sendVerifyEmail } from '@/lib/emails/sender';
import { adminAuth } from '@/lib/firebase-admin';
import { trackEvent } from '@/lib/analytics-server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

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

      // ─── Welcome email retry (with dedup via welcomeEmailSent) ───
      // Only attempt if: email present, email not yet sent, and user is very new.
      // Atomic check-and-set prevents duplicate sends from concurrent sync calls.
      if (existingUser.email && !existingUser.welcomeEmailSent) {
        const userAge = Date.now() - existingUser.createdAt.getTime();
        const RETRY_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

        if (userAge < RETRY_WINDOW_MS) {
          // Atomic: only one sync call wins the race to set welcomeEmailSent
          const updated = await db.user.updateMany({
            where: { id: existingUser.id, welcomeEmailSent: false },
            data: { welcomeEmailSent: true },
          });

          if (updated.count > 0) {
            console.log('[WELCOME] retry — user created', Math.round(userAge / 1000), 's ago, sending welcome email');
            sendWelcomeEmail(existingUser.email, existingUser.name || 'Amigo')
              .then(() => console.log('[WELCOME] retry sent ✓'))
              .catch((err) => console.error('[WELCOME] retry failed:', err instanceof Error ? err.message : err));
            // Fire-and-forget: do NOT await — return the response immediately.
          } else {
            console.log('[WELCOME] skipped — another sync already claimed welcome email');
          }
        } else {
          console.log('[WELCOME] skipped — user too old for retry, age:', Math.round(userAge / 1000), 's');
        }
      } else if (existingUser.welcomeEmailSent) {
        console.log('[WELCOME] skipped — welcome email already sent');
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
          welcomeEmailSent: existingUser.welcomeEmailSent,
          createdAt: existingUser.createdAt,
          onboardingCompleted: existingUser.onboardingCompleted,
        },
      });
    }

    // ─── New user path ───
    console.log('[SYNC] new user — email:', decodedToken.email);

    const user = await syncUserToDatabase(
      decodedToken.uid,
      decodedToken.email!,
      decodedToken.name
    );

    // ─── Atomic welcome email dedup ───
    // Set welcomeEmailSent = true BEFORE sending the email.
    // This prevents any concurrent sync call from also sending.
    // If the email fails, we accept a single missed email over duplicates.
    if (user.email && !user.welcomeEmailSent) {
      const claimed = await db.user.updateMany({
        where: { id: user.id, welcomeEmailSent: false },
        data: { welcomeEmailSent: true },
      });

      if (claimed.count > 0) {
        // We won the race — fire emails in background (do NOT await)
        console.log('[WELCOME] claimed — scheduling welcome email for:', user.email);

        // 1. Welcome email (fire-and-forget, non-throwing)
        sendWelcomeEmail(user.email, user.name || 'Amigo')
          .then(() => console.log('[WELCOME] sent ✓'))
          .catch((err) => console.error('[WELCOME] failed:', err instanceof Error ? err.message : err));

        // 2. Verification email (only for non-Google users, fire-and-forget)
        if (!decodedToken.email_verified) {
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
          })();
        }
      } else {
        console.log('[WELCOME] skipped — another sync already claimed welcome email');
      }
    } else {
      console.log('[WELCOME] skipped — user.email is falsy or already sent');
    }

    // ─── Analytics — fire-and-forget (never block the response) ───
    trackEvent({ event: 'user_registered', userId: user.id }).catch(() => {});

    // ─── Return user data IMMEDIATELY ───
    // No awaiting emails, analytics, or other background operations.
    // The user gets their data back as fast as the DB write completes.
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
      },
    });
  } catch (error) {
    console.error('[Auth] sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
