import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, syncUserToDatabase } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendWelcomeEmail } from '@/lib/emails/sender';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();
    console.log('[AUTH SYNC DEBUG] Request recibido. idToken length:', idToken?.length, 'idToken prefix:', idToken?.substring(0, 20) + '...');

    if (!idToken) {
      console.error('[AUTH SYNC DEBUG] No se recibió idToken');
      return NextResponse.json({ error: 'ID token required' }, { status: 400 });
    }

    console.log('[AUTH SYNC DEBUG] Verificando token Firebase...');
    const decodedToken = await verifyFirebaseToken(idToken);
    console.log('[AUTH SYNC DEBUG] verifyFirebaseToken resultado:', decodedToken ? `UID: ${decodedToken.uid}, Email: ${decodedToken.email}` : 'null');

    if (!decodedToken) {
      console.error('[AUTH SYNC DEBUG] Token inválido - verifyFirebaseToken devolvió null');
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const existingUser = await db.user.findUnique({ where: { firebaseUid: decodedToken.uid } });
    const isNewUser = !existingUser;
    console.log('[AUTH SYNC DEBUG] isNewUser:', isNewUser, 'existingUser:', existingUser ? `id: ${existingUser.id}` : 'null');

    console.log('[AUTH SYNC DEBUG] Llamando a syncUserToDatabase...');
    const user = await syncUserToDatabase(
      decodedToken.uid,
      decodedToken.email!,
      decodedToken.name
    );
    console.log('[AUTH SYNC DEBUG] syncUserToDatabase OK. User id:', user.id, 'email:', user.email, 'plan:', user.plan);

    // Send welcome email for new users
    if (isNewUser && user.email) {
      console.log('[AUTH SYNC DEBUG] Enviando welcome email a:', user.email);
      await sendWelcomeEmail(user.email, user.name || 'Amigo');
    }

    const responseData = {
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        plan: user.plan,
        avatarUrl: user.avatarUrl,
      },
    };
    console.log('[AUTH SYNC DEBUG] Respuesta 200:', JSON.stringify(responseData));

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[AUTH SYNC DEBUG] Error en /api/auth/sync:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
