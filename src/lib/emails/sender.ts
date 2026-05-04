import { resend } from '../resend';
import {
  welcomeEmail,
  verifyEmailTemplate,
  resetPasswordTemplate,
  subscriptionConfirmedTemplate,
} from './templates';

const FROM_EMAIL = 'VitaZen <no-reply@vitazen.cc>';

export async function sendWelcomeEmail(to: string, name: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Bienvenido a VitaZen — Tu transformación comienza',
      html: welcomeEmail(name),
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
}

export async function sendVerifyEmail(to: string, name: string, verificationLink: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Confirma tu cuenta — VitaZen',
      html: verifyEmailTemplate(name, verificationLink),
    });
  } catch (error) {
    console.error('Error sending verify email:', error);
  }
}

export async function sendResetPasswordEmail(to: string, name: string, resetLink: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'Restablece tu contraseña — VitaZen',
      html: resetPasswordTemplate(name, resetLink),
    });
  } catch (error) {
    console.error('Error sending reset password email:', error);
  }
}

export async function sendSubscriptionConfirmedEmail(to: string, name: string, planName: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Tu suscripción ${planName} está activa — VitaZen`,
      html: subscriptionConfirmedTemplate(name, planName),
    });
  } catch (error) {
    console.error('Error sending subscription confirmed email:', error);
  }
}
