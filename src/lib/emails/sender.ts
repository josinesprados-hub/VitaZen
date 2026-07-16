// ═══════════════════════════════════════════
// VITAZEN EMAIL SENDER
// Deliverability-optimized: text+html multipart,
// reply-to, consistent from, proper headers
// X-Priority only on verify + reset password
// ═══════════════════════════════════════════

import { resend } from '../resend';
import {
  welcomeEmail,
  verifyEmailTemplate,
  resetPasswordTemplate,
  subscriptionConfirmedTemplate,
} from './templates';

const FROM_EMAIL = 'VitaZen <hola@vitazen.cc>';
const REPLY_TO = 'hola@vitazen.cc';

// ─── Welcome email (no X-Priority — informational, not urgent) ───

export async function sendWelcomeEmail(to: string, name: string) {
  console.log('[WELCOME] starting — to:', to, 'name:', name);
  try {
    const { html, text, subject } = welcomeEmail(name);
    console.log('[WELCOME] template generated, calling Resend...');

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
      headers: {
        'X-Auto-Response-Suppress': 'OOF',
      },
    });

    // Log raw Resend response for diagnostics
    console.log('[WELCOME] Resend raw response — data:', JSON.stringify(result?.data), 'error:', JSON.stringify(result?.error));

    if (result?.data?.id) {
      console.log('[WELCOME] sent ✓ — ID:', result.data.id);
      return;
    }

    // Resend returned an error — throw so the caller knows it failed
    const errorMsg = result?.error?.message || JSON.stringify(result?.error) || 'Resend error desconocido';
    console.error('[WELCOME] Resend returned error:', errorMsg);
    throw new Error(`Error enviando welcome email: ${errorMsg}`);
  } catch (error) {
    // Re-throw our own errors; wrap unexpected errors
    if (error instanceof Error && error.message.startsWith('Error enviando welcome email')) {
      console.error('[WELCOME] failed (Resend error):', error.message);
      throw error;
    }
    console.error('[WELCOME] failed (unexpected):', error instanceof Error ? error.message : String(error));
    throw new Error(`No se pudo enviar el welcome email: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// ─── Verify email (X-Priority: 1 — action required) ───

export async function sendVerifyEmail(to: string, name: string, verificationLink: string) {
  console.log('[EMAIL] Enviando verify a:', to);
  try {
    const { html, text, subject } = verifyEmailTemplate(name, verificationLink);

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
      headers: {
        'X-Priority': '1',
        'X-Auto-Response-Suppress': 'OOF',
      },
    });

    if (result?.data?.id) {
      console.log('[EMAIL] Verify enviado. ID:', result.data.id);
      return; // success
    }

    // Resend returned an error — throw so the caller knows it failed
    const errorMsg = result?.error?.message || JSON.stringify(result?.error) || 'Resend error desconocido';
    console.error('[EMAIL] Error Resend verify:', errorMsg);
    throw new Error(`Error enviando email de verificación: ${errorMsg}`);
  } catch (error) {
    // Re-throw our own errors; wrap unexpected errors
    if (error instanceof Error && error.message.startsWith('Error enviando email')) {
      throw error;
    }
    console.error('[EMAIL] Excepción verify:', error instanceof Error ? error.message : error);
    throw new Error('No se pudo enviar el email de verificación. Inténtalo más tarde.');
  }
}

// ─── Reset password email (X-Priority: 1 — security action) ───

export async function sendResetPasswordEmail(to: string, name: string, resetLink: string) {
  try {
    const { html, text, subject } = resetPasswordTemplate(name, resetLink);

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
      headers: {
        'X-Priority': '1',
        'X-Auto-Response-Suppress': 'OOF',
      },
    });

    if (result?.error) {
      // M-13 FIX: Throw instead of silently swallowing — the caller
      // (reset-password endpoint) must know the email failed so it can
      // return an error to the user instead of a false success message.
      throw new Error(`Resend error: ${JSON.stringify(result.error)}`);
    }
  } catch (error) {
    // Re-throw to let the caller handle the failure
    throw error;
  }
}

// ─── Subscription confirmed email (no X-Priority — informational) ───

export async function sendSubscriptionConfirmedEmail(to: string, name: string, planName: string) {
  console.log('[EMAIL] Enviando subscription-confirmed a:', to, 'plan:', planName);
  try {
    const { html, text, subject } = subscriptionConfirmedTemplate(name, planName);

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
      headers: {
        'X-Auto-Response-Suppress': 'OOF',
      },
    });

    if (result?.data?.id) {
      console.log('[EMAIL] Subscription confirmed enviado. ID:', result.data.id);
    } else if (result?.error) {
      console.error('[EMAIL] Error Resend subscription:', JSON.stringify(result.error));
    }
  } catch (error) {
    console.error('[EMAIL] Excepción subscription:', error instanceof Error ? error.message : error);
  }
}
