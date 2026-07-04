export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { sendVerifyEmail } from '@/lib/emails/sender';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (!decodedToken?.uid) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Find user in database — try firebaseUid first, then email
    let user = await db.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });

    if (!user && decodedToken.email) {
      user = await db.user.findUnique({
        where: { email: decodedToken.email },
      });
    }

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Already verified? Sync with Firebase status first
    try {
      const firebaseUser = await adminAuth.getUser(decodedToken.uid);
      if (firebaseUser.emailVerified) {
        // Update DB if Firebase says verified but DB doesn't
        if (!user.emailVerified) {
          await db.user.update({
            where: { id: user.id },
            data: { emailVerified: true },
          });
        }
        return NextResponse.json({ message: 'Email ya verificado', alreadyVerified: true });
      }
    } catch (fbError) {
      console.error('[VERIFY] Could not check Firebase user status:', fbError);
      // Continue — we can still try to send the verification email
    }

    // Rate limit: prevent spamming (max 1 request per 60 seconds)
    const ONE_MINUTE_AGO = new Date(Date.now() - 60 * 1000);
    const recentToken = await db.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: ONE_MINUTE_AGO },
      },
    });
    if (recentToken) {
      return NextResponse.json(
        { error: 'Espera un minuto antes de solicitar otro enlace', retryAfter: 60 },
        { status: 429 }
      );
    }

    // Invalidate any previous unused tokens
    await db.emailVerificationToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // ─── Strategy 1: Firebase generateEmailVerificationLink + Resend ───
    // This gives us a Firebase-hosted verification link that we send
    // through our premium email template via Resend.
    try {
      const verificationLink = await adminAuth.generateEmailVerificationLink(
        user.email,
        {
          url: `${APP_URL}/verify-email?uid=${user.id}`,
        }
      );

      // Send the verification email via Resend (using our premium template)
      // sendVerifyEmail now throws on failure
      await sendVerifyEmail(user.email, user.name || 'Amigo', verificationLink);

      // Create a tracking token in DB (for rate limiting)
      await db.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: `firebase-managed-${Date.now()}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        },
      });

      console.log('[VERIFY] Verification email sent via Firebase+Resend to:', user.email);
      return NextResponse.json({ message: 'Email de verificación enviado' });
    } catch (firebaseLinkError: any) {
      console.error('[VERIFY] Firebase generateEmailVerificationLink failed:', firebaseLinkError?.message || firebaseLinkError);

      // ─── Strategy 2: Fallback — use Firebase's own sendEmailVerification ───
      // If Firebase Admin can't generate a link (e.g. env misconfiguration),
      // we return a signal telling the client to use Firebase's built-in
      // sendEmailVerification method directly.
      console.log('[VERIFY] Falling back to client-side Firebase sendEmailVerification');

      return NextResponse.json({
        message: 'Usa verificación directa de Firebase',
        useClientFallback: true,
      });
    }
  } catch (error: any) {
    console.error('[VERIFY] Error sending verification email:', error);

    // Handle Firebase-specific errors
    if (error?.code === 'auth/user-not-found') {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    if (error?.code === 'auth/too-many-requests') {
      return NextResponse.json(
        { error: 'Demasiados intentos. Inténtalo más tarde.', retryAfter: 300 },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: 'Error al enviar el email. Inténtalo más tarde.' }, { status: 500 });
  }
}
