export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { adminAuth } from '@/lib/firebase-admin';
import { sendResetPasswordEmail } from '@/lib/emails/sender';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';
const TOKEN_EXPIRY_HOURS = 1;

// POST — Request password reset (generates token + sends email)
export async function POST(request: NextRequest) {
  try {
    // [RESET DEBUG] Verificar que Prisma reconoce el modelo
    console.log('[RESET DEBUG] db.passwordResetToken exists:', !!db.passwordResetToken);
    if (!db.passwordResetToken) {
      console.error('[RESET DEBUG] db.passwordResetToken is undefined — Prisma Client desactualizado');
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    console.log('[RESET PASSWORD] Solicitud de reset para:', email);

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      console.log('[RESET PASSWORD] No se encontró usuario para:', email);
      return NextResponse.json({ message: 'Si el email existe, recibirás un enlace de recuperación.' });
    }

    // Invalidate any existing unused tokens for this user
    await db.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate secure token
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // Save token in DB
    await db.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    console.log('[RESET PASSWORD] Token creado para user:', user.id, 'expira:', expiresAt.toISOString());

    // Build reset link
    const resetLink = `${APP_URL}/reset-password?token=${token}`;

    // Send email via Resend
    await sendResetPasswordEmail(user.email, user.name || 'Amigo', resetLink);

    console.log('[RESET PASSWORD] Email enviado a:', user.email);

    return NextResponse.json({ message: 'Si el email existe, recibirás un enlace de recuperación.' });
  } catch (error) {
    console.error('[RESET PASSWORD] Error en POST:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// PUT — Validate token + update password
export async function PUT(request: NextRequest) {
  try {
    // [RESET DEBUG] Verificar que Prisma reconoce el modelo
    console.log('[RESET DEBUG] db.passwordResetToken exists:', !!db.passwordResetToken);
    if (!db.passwordResetToken) {
      console.error('[RESET DEBUG] db.passwordResetToken is undefined — Prisma Client desactualizado');
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
    }

    const { token, newPassword } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    console.log('[RESET PASSWORD] Intentando reset con token:', token.substring(0, 8) + '...');

    // Find valid token
    const resetToken = await db.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      console.log('[RESET PASSWORD] Token no encontrado');
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
    }

    // Check if already used
    if (resetToken.used) {
      console.log('[RESET PASSWORD] Token ya utilizado');
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
    }

    // Check expiry
    if (new Date() > resetToken.expiresAt) {
      console.log('[RESET PASSWORD] Token expirado');
      // Mark as used so it can't be retried
      await db.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
    }

    // Update password in Firebase Admin
    try {
      await adminAuth.updateUser(resetToken.user.firebaseUid, {
        password: newPassword,
      });
      console.log('[RESET PASSWORD] Contraseña actualizada en Firebase para uid:', resetToken.user.firebaseUid);
    } catch (firebaseError) {
      console.error('[RESET PASSWORD] Error actualizando contraseña en Firebase:', firebaseError);
      return NextResponse.json({ error: 'No se pudo actualizar la contraseña' }, { status: 500 });
    }

    // Invalidate token
    await db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    console.log('[RESET PASSWORD] Token invalidado. Reset completado para:', resetToken.user.email);

    return NextResponse.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('[RESET PASSWORD] Error en PUT:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
