export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, syncUserToDatabase } from '@/lib/auth';
import { db } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { sendWelcomeEmail, sendVerifyEmail } from '@/lib/emails/sender';
import { adminAuth } from '@/lib/firebase-admin';
import { trackEvent } from '@/lib/analytics-server';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

async function handler(request: NextRequest) {
  try {
    // FASE 9A (A-4): Extract token from Authorization header (not request body)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token de autorización requerido' }, { status: 401 });
    }
    const idToken = authHeader.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Token de autorización requerido' }, { status: 401 });
    }

    const decodedToken = await verifyFirebaseToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Search by firebaseUid first
    let existingUser = await db.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
      include: {
        subscriptions: {
          where: { status: { in: ['active', 'trialing'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // If not found by firebaseUid, search by email to avoid P2002
    // BUG-A1 FIX: Only allow email fallback if the email is verified.
    // Without this check, an attacker can create a Firebase account with the
    // victim's email and overwrite their firebaseUid, taking over the account.
    if (!existingUser && decodedToken.email && decodedToken.email_verified) {
      existingUser = await db.user.findUnique({
        where: { email: decodedToken.email },
        include: {
          subscriptions: {
            where: { status: { in: ['active', 'trialing'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });
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

      // BUG-B3 FIX: Sync email from Firebase if it changed and is verified.
      // Previously, the DB email was never updated — only firebaseUid and
      // emailVerified were synced. A user who changed their Firebase email
      // had a stale DB email, causing transactional emails and Stripe
      // receipts to go to the wrong address.
      if (decodedToken.email_verified && decodedToken.email && existingUser.email !== decodedToken.email) {
        serverLog.info('auth/sync', 'Email changed in Firebase — syncing to DB', {
          oldEmail: existingUser.email,
          newEmail: decodedToken.email,
        });
        await db.user.update({
          where: { id: existingUser.id },
          data: { email: decodedToken.email },
        });
        existingUser.email = decodedToken.email;

        // Also update the Stripe customer email if the user has one
        if (existingUser.stripeCustomerId) {
          try {
            await stripe.customers.update(existingUser.stripeCustomerId, {
              email: decodedToken.email,
            });
          } catch (stripeErr) {
            serverLog.error('auth/sync', 'Failed to update Stripe customer email', stripeErr);
          }
        }
      }

      // Sync firebaseUid if it doesn't match (e.g. user registered with email/password
      // and then signed in with Google, creating a different Firebase Auth UID).
      // This keeps the DB in sync with the current auth method.
      // Safe because we've already verified the Firebase ID token.
      if (existingUser.firebaseUid !== decodedToken.uid) {
        serverLog.warn('auth/sync', 'firebaseUid mismatch — updating', {
          oldUid: existingUser.firebaseUid,
          newUid: decodedToken.uid,
        });
        await db.user.update({
          where: { id: existingUser.id },
          data: { firebaseUid: decodedToken.uid },
        });
        existingUser.firebaseUid = decodedToken.uid;
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
            serverLog.info('auth/sync', 'Welcome email retry — sending', { userAgeSec: Math.round(userAge / 1000) });
            sendWelcomeEmail(existingUser.email, existingUser.name || 'Amigo')
              .then(() => serverLog.info('auth/sync', 'Welcome email retry sent'))
              .catch((err) => serverLog.error('auth/sync', 'Welcome email retry failed', err));
            // Fire-and-forget: do NOT await — return the response immediately.
          }
        }
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
          subscription: existingUser.subscriptions[0] || null,
        },
      });
    }

    // ─── New user path ───
    serverLog.info('auth/sync', 'New user registration', { email: decodedToken.email ? '[EMAIL]' : 'null' });

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
        serverLog.info('auth/sync', 'Claimed welcome email — scheduling send');

        // 1. Welcome email (fire-and-forget, non-throwing)
        sendWelcomeEmail(user.email, user.name || 'Amigo')
          .then(() => serverLog.info('auth/sync', 'Welcome email sent'))
          .catch((err) => serverLog.error('auth/sync', 'Welcome email failed', err));

        // 2. Verification email (only for non-Google users, fire-and-forget)
        if (!decodedToken.email_verified) {
          (async () => {
            try {
              const verificationLink = await adminAuth.generateEmailVerificationLink(
                user.email!,
                { url: `${APP_URL}/verify-email?uid=${user.id}` }
              );
              await sendVerifyEmail(user.email!, user.name || 'Amigo', verificationLink);
              serverLog.info('auth/sync', 'Verification email sent');
            } catch (verifyError) {
              serverLog.error('auth/sync', 'Verification email failed', verifyError);
            }
          })();
        }
      }
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
        subscription: null, // New users have no subscription
      },
    });
  } catch (error) {
    serverLog.apiError('api/auth/sync', 'POST', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withTiming('api/auth/sync', handler, { slowThresholdMs: 5_000 });