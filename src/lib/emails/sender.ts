import { resend } from '../resend';
import {
  welcomeEmail,
  verifyEmailTemplate,
  resetPasswordTemplate,
  subscriptionConfirmedTemplate,
} from './templates';

const FROM_EMAIL = 'VitaZen <no-reply@vitazen.cc>';

export async function sendWelcomeEmail(to: string, name: string) {
  console.log('[EMAIL] Enviando welcome a:', to);
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Tu acceso está listo — VitaZen',
      html: welcomeEmail(name),
    });
    if (result?.data?.id) {
      console.log('[EMAIL] Welcome enviado. ID:', result.data.id);
    } else if (result?.error) {
      console.error('[EMAIL] Error Resend welcome:', JSON.stringify(result.error));
    }
  } catch (error) {
    console.error('[EMAIL] Excepción welcome:', error instanceof Error ? error.message : error);
  }
}

export async function sendVerifyEmail(to: string, name: string, verificationLink: string) {
  console.log('[EMAIL] Enviando verify a:', to);
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Confirma tu email — VitaZen',
      html: verifyEmailTemplate(name, verificationLink),
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

export async function sendResetPasswordEmail(to: string, name: string, resetLink: string) {
  console.log('[EMAIL] Enviando reset-password a:', to);
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Restaura tu acceso — VitaZen',
      html: resetPasswordTemplate(name, resetLink),
    });
    if (result?.data?.id) {
      console.log('[EMAIL] Reset password enviado. ID:', result.data.id);
    } else if (result?.error) {
      console.error('[EMAIL] Error Resend reset-password:', JSON.stringify(result.error));
    }
  } catch (error) {
    console.error('[EMAIL] Excepción reset-password:', error instanceof Error ? error.message : error);
  }
}

export async function sendSubscriptionConfirmedEmail(to: string, name: string, planName: string) {
  console.log('[EMAIL] Enviando subscription-confirmed a:', to, 'plan:', planName);
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Tu plan ${planName} está activo — VitaZen`,
      html: subscriptionConfirmedTemplate(name, planName),
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
