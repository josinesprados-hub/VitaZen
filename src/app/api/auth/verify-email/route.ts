import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { db } from '@/lib/db';

/**
 * POST /api/auth/verify-email
 *
 * Called by the client after the user clicks the Firebase verification link
 * and is redirected to our /verify-email page. The client sends their ID token,
 * we check Firebase's emailVerified status and sync it to our database.
 */
export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    // Verify the Firebase ID token
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    if (!decodedToken?.uid) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    // Check Firebase's emailVerified status
    const firebaseUser = await adminAuth.getUser(decodedToken.uid);
    if (!firebaseUser.emailVerified) {
      return NextResponse.json(
        { error: 'Email aún no verificado en Firebase', verified: false },
        { status: 400 }
      );
    }

    // Update our database
    const user = await db.user.update({
      where: { firebaseUid: decodedToken.uid },
      data: { emailVerified: true },
    });

    // Invalidate any unused verification tokens
    await db.emailVerificationToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    console.log('[VERIFY] Email verified for user:', user.email);

    return NextResponse.json({
      verified: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
    });
  } catch (error) {
    console.error('[VERIFY] Error verifying email:', error);
    return NextResponse.json({ error: 'Error al verificar email' }, { status: 500 });
  }
}
