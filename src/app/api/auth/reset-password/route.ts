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

    // Save token in DB
    await db.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Build reset link
    const resetLink = `${APP_URL}/reset-password?token=${token}`;

    // Send email via Resend
    await sendResetPasswordEmail(user.email, user.name || 'Amigo', resetLink);

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

    // ─── Rate limiting: global safety net against brute-force token guessing ───
    const FIFTEEN_MIN_AGO = new Date(Date.now() - 15 * 60 * 1000);
    const recentAttempts = await db.passwordResetToken.count({
      where: {
        createdAt: { gte: FIFTEEN_MIN_AGO },
      },
    });
    // Global safety net: if too many reset attempts across all users in 15 min, throttle
    if (recentAttempts > 50) {
      return NextResponse.json(
        { error: 'Demasiados intentos en el sistema. Inténtalo más tarde.', retryAfter: 900 },
        { status: 429 }
      );
    }

    // Find valid token
    const resetToken = await db.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 400 });
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