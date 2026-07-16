export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';

/**
 * POST /api/auth/verify-email
 *
 * Called by the client after the user clicks the Firebase verification link
 * and is redirected to our /verify-email page. The client sends their ID token,
 * we check Firebase's emailVerified status and sync it to our database.
 */
export async function POST(request: NextRequest) {
  try {
    // H-10 FIX: Read ID token from Authorization header (consistent with
    // all other authenticated endpoints). Previously the token was sent
    // in the request body, which could be logged and is inconsistent
    // with the rest of the API.
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token requerido' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
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

    // Find user in DB — try firebaseUid first, then email as fallback
    // BUG-A1 FIX: Only fall back to email lookup if the token's email is verified.
    // Without this check, an attacker could create an unverified Firebase account
    // with the victim's email and gain access to the victim's DB record.
    let user = await db.user.findUnique({
      where: { firebaseUid: decodedToken.uid },
    });

    if (!user && decodedToken.email && decodedToken.email_verified) {
      user = await db.user.findUnique({
        where: { email: decodedToken.email },
      });
    }

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Update our database
    const updatedUser = await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    // Invalidate any unused verification tokens
    await db.emailVerificationToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Track email verification
    trackEvent({ event: 'email_verified', userId: user.id });

    console.log('[VERIFY] Email verified for user:', updatedUser.email);

    return NextResponse.json({
      verified: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        emailVerified: updatedUser.emailVerified,
      },
    });
  } catch (error) {
    console.error('[VERIFY] Error verifying email:', error);
    return NextResponse.json({ error: 'Error al verificar email' }, { status: 500 });
  }
}
