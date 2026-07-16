export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { adminAuth } from '@/lib/firebase-admin';
import { sendResetPasswordEmail } from '@/lib/emails/sender';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';
const TOKEN_EXPIRY_HOURS = 1;

// F8.4-09 FIX: GET — Validate token without consuming it.
// Used by the client to show an early error if the token is invalid/expired
// instead of letting the user fill out the form first.
export async function GET(request: NextRequest) {
  try {
    if (!db.passwordResetToken) {
      return NextResponse.json({ error: 'Error de configuracion del servidor' }, { status: 500 });
    }
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ valid: false, error: 'Token requerido' });
    }
    const resetToken = await db.passwordResetToken.findUnique({ where: { token } });
    if (!resetToken || resetToken.used) {
      return NextResponse.json({ valid: false, error: 'Token inválido o expirado' });
    }
    if (new Date() > resetToken.expiresAt) {
      return NextResponse.json({ valid: false, error: 'Token inválido o expirado' });
    }
    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false, error: 'Error al validar el token' });
  }
}

// POST — Request password reset (generates token + sends email)
export async function POST(request: NextRequest) {
  try {
    if (!db.passwordResetToken) {
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
    }

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    // ─── Rate limiting: max 3 requests per 15 minutes per email ───
    const FIFTEEN_MIN_AGO = new Date(Date.now() - 15 * 60 * 1000);
    const recentRequests = await db.passwordResetToken.count({
      where: {
        user: { email: email.toLowerCase().trim() },
        createdAt: { gte: FIFTEEN_MIN_AGO },
      },
    });
    if (recentRequests >= 3) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Inténtalo en 15 minutos.', retryAfter: 900 },
        { status: 429 }
      );
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
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

    // Build reset link
    const resetLink = `${APP_URL}/reset-password?token=${token}`;

    // F8.4-10 FIX: Send email BEFORE saving token to DB.
    // If email fails, the token is never persisted, preventing orphaned tokens.
    await sendResetPasswordEmail(user.email, user.name || 'Amigo', resetLink);

    // Save token in DB (only after successful email send)
    await db.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    return NextResponse.json({ message: 'Si el email existe, recibirás un enlace de recuperación.' });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

// PUT — Validate token + update password
export async function PUT(request: NextRequest) {
  try {
    if (!db.passwordResetToken) {
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
    }

    const { token, newPassword } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token requerido' }, { status: 400 });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    // Find valid token first (needed for per-user rate limit)
    const resetToken = await db.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
    }

    // ─── Rate limiting: per-user safety net against brute-force token guessing ───
    // F8.4-05 FIX: Changed from global to per-user rate limit.
    // Previously counted ALL tokens globally, which could block all users
    // during a security incident. Now counts per the token's owner.
    const FIFTEEN_MIN_AGO = new Date(Date.now() - 15 * 60 * 1000);
    const recentAttempts = await db.passwordResetToken.count({
      where: {
        userId: resetToken.userId,
        createdAt: { gte: FIFTEEN_MIN_AGO },
      },
    });
    if (recentAttempts > 10) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Inténtalo más tarde.', retryAfter: 900 },
        { status: 429 }
      );
    }

    // Check if already used
    if (resetToken.used) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
    }

    // Check expiry
    if (new Date() > resetToken.expiresAt) {
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
    } catch (firebaseError) {
      return NextResponse.json({ error: 'No se pudo actualizar la contraseña' }, { status: 500 });
    }

    // Invalidate token
    await db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    return NextResponse.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}