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

    // Find user in database
    const user = await db.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Already verified? Sync with Firebase status first
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
        { error: 'Espera un minuto antes de solicitar otro enlace' },
        { status: 429 }
      );
    }

    // Generate Firebase email verification link
    const verificationLink = await adminAuth.generateEmailVerificationLink(
      user.email,
      {
        // Firebase will redirect to our verify-email page after verification
        url: `${APP_URL}/verify-email?uid=${user.id}`,
      }
    );

    // Invalidate any previous unused tokens
    await db.emailVerificationToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Create a tracking token in DB (for analytics + rate limiting)
    await db.emailVerificationToken.create({
      data: {
        userId: user.id,
        token: `firebase-managed-${Date.now()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    // Send the verification email via Resend (using our premium template)
    await sendVerifyEmail(user.email, user.name || 'Amigo', verificationLink);

    console.log('[VERIFY] Verification email sent to:', user.email);

    return NextResponse.json({ message: 'Email de verificación enviado' });
  } catch (error: any) {
    console.error('[VERIFY] Error sending verification email:', error);

    // Handle Firebase-specific errors
    if (error?.code === 'auth/user-not-found') {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }
    if (error?.code === 'auth/too-many-requests') {
      return NextResponse.json(
        { error: 'Demasiados intentos. Inténtalo más tarde.' },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: 'Error al enviar el email' }, { status: 500 });
  }
}
