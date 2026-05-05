import { resend } from '../resend';
import {
  welcomeEmail,
  verifyEmailTemplate,
  resetPasswordTemplate,
  subscriptionConfirmedTemplate,
} from './templates';

const FROM_EMAIL = 'VitaZen <no-reply@vitazen.cc>';

export async function sendWelcomeEmail(to: string, name: string) {
  console.log('[EMAIL DEBUG] sendWelcomeEmail — Preparando envío:', { to, name, from: FROM_EMAIL });
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Bienvenido a VitaZen — Tu transformación comienza',
      html: welcomeEmail(name),
    });
    console.log('[EMAIL DEBUG] sendWelcomeEmail — Respuesta del proveedor:', JSON.stringify(result));

    // Verificar modo test: Resend devuelve id con prefijo si está en modo test
    if (result?.data?.id) {
      console.log('[EMAIL DEBUG] sendWelcomeEmail — Email ID:', result.data.id);
    } else if (result?.error) {
      console.error('[EMAIL DEBUG] sendWelcomeEmail — Error del proveedor:', JSON.stringify(result.error));
    }
  } catch (error) {
    console.error('[EMAIL DEBUG] sendWelcomeEmail — Excepción al enviar:', error);
    if (error instanceof Error) {
      console.error('[EMAIL DEBUG] sendWelcomeEmail — Mensaje:', error.message);
      console.error('[EMAIL DEBUG] sendWelcomeEmail — Stack:', error.stack);
    }
  }
}

export async function sendVerifyEmail(to: string, name: string, verificationLink: string) {
  console.log('[EMAIL DEBUG] sendVerifyEmail — Preparando envío:', { to, name, from: FROM_EMAIL });
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Confirma tu cuenta — VitaZen',
      html: verifyEmailTemplate(name, verificationLink),
    });
    console.log('[EMAIL DEBUG] sendVerifyEmail — Respuesta del proveedor:', JSON.stringify(result));

    if (result?.data?.id) {
      console.log('[EMAIL DEBUG] sendVerifyEmail — Email ID:', result.data.id);
    } else if (result?.error) {
      console.error('[EMAIL DEBUG] sendVerifyEmail — Error del proveedor:', JSON.stringify(result.error));
    }
  } catch (error) {
    console.error('[EMAIL DEBUG] sendVerifyEmail — Excepción al enviar:', error);
    if (error instanceof Error) {
      console.error('[EMAIL DEBUG] sendVerifyEmail — Mensaje:', error.message);
      console.error('[EMAIL DEBUG] sendVerifyEmail — Stack:', error.stack);
    }
  }
}

export async function sendResetPasswordEmail(to: string, name: string, resetLink: string) {
  console.log('[EMAIL DEBUG] sendResetPasswordEmail — Preparando envío:', { to, name, from: FROM_EMAIL });
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Restablece tu contraseña — VitaZen',
      html: resetPasswordTemplate(name, resetLink),
    });
    console.log('[EMAIL DEBUG] sendResetPasswordEmail — Respuesta del proveedor:', JSON.stringify(result));

    if (result?.data?.id) {
      console.log('[EMAIL DEBUG] sendResetPasswordEmail — Email ID:', result.data.id);
    } else if (result?.error) {
      console.error('[EMAIL DEBUG] sendResetPasswordEmail — Error del proveedor:', JSON.stringify(result.error));
    }
  } catch (error) {
    console.error('[EMAIL DEBUG] sendResetPasswordEmail — Excepción al enviar:', error);
    if (error instanceof Error) {
      console.error('[EMAIL DEBUG] sendResetPasswordEmail — Mensaje:', error.message);
      console.error('[EMAIL DEBUG] sendResetPasswordEmail — Stack:', error.stack);
    }
  }
}

export async function sendSubscriptionConfirmedEmail(to: string, name: string, planName: string) {
  console.log('[EMAIL DEBUG] sendSubscriptionConfirmedEmail — Preparando envío:', { to, name, planName, from: FROM_EMAIL });
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Tu suscripción ${planName} está activa — VitaZen`,
      html: subscriptionConfirmedTemplate(name, planName),
    });
    console.log('[EMAIL DEBUG] sendSubscriptionConfirmedEmail — Respuesta del proveedor:', JSON.stringify(result));

    if (result?.data?.id) {
      console.log('[EMAIL DEBUG] sendSubscriptionConfirmedEmail — Email ID:', result.data.id);
    } else if (result?.error) {
      console.error('[EMAIL DEBUG] sendSubscriptionConfirmedEmail — Error del proveedor:', JSON.stringify(result.error));
    }
  } catch (error) {
    console.error('[EMAIL DEBUG] sendSubscriptionConfirmedEmail — Excepción al enviar:', error);
    if (error instanceof Error) {
      console.error('[EMAIL DEBUG] sendSubscriptionConfirmedEmail — Mensaje:', error.message);
      console.error('[EMAIL DEBUG] sendSubscriptionConfirmedEmail — Stack:', error.stack);
    }
  }
}
