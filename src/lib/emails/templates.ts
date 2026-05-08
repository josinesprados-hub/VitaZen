// ═══════════════════════════════════════════
// VITAZEN EMAIL TEMPLATES
// Transactional-first, deliverability-optimized
// White background, text-centric, calm tone
// Inspired by Linear / Notion / Apple email style
// ═══════════════════════════════════════════

import type { EmailContent } from './types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

// ─── Email wrapper: clean white card on light gray ───

function emailWrapper(content: string, preheaderText: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>VitaZen</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f7f7;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#f7f7f7;line-height:1px;">
    ${preheaderText}
    &zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f7f7;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:4px;">
          <tr>
            <td style="padding:36px 40px 0;text-align:left;">
              <p style="color:#c8a55a;font-size:11px;letter-spacing:5px;margin:0;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">VITAZEN</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 0;">
              <div style="width:20px;height:1px;background-color:#c8a55a;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 40px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              ${content}
            </td>
          </tr>
        </table>
        <p style="color:#bbb;font-size:11px;margin:20px 0 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">VitaZen · vitazen.cc</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaLink(link: string, text: string): string {
  return `<div style="padding:24px 0 0;"><a href="${link}" style="color:#c8a55a;font-size:15px;text-decoration:none;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">${text} &rarr;</a></div>`;
}

const textMain = 'color:#1a1a1a;font-size:15px;line-height:1.7;margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
const headingStyle = 'color:#1a1a1a;font-size:20px;font-weight:500;margin:0 0 20px;line-height:1.3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

export function welcomeEmail(name: string): EmailContent {
  const subject = 'Cuenta creada en VitaZen';
  const preheader = 'Tu cuenta se ha creado correctamente.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Hola, ' + name + '.</h1><p style="' + textMain + '">Tu cuenta en VitaZen se ha creado correctamente. Ya puedes acceder cuando quieras.</p>' + ctaLink(APP_URL + '/dashboard', 'Acceder') + '<p style="color:#aaa;font-size:12px;line-height:1.5;margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>', preheader);
  const text = 'Hola, ' + name + '.\n\nTu cuenta en VitaZen se ha creado correctamente. Ya puedes acceder cuando quieras.\n\nAcceder: ' + APP_URL + '/dashboard\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.';
  return { html, text, subject };
}

export function verifyEmailTemplate(name: string, verificationLink: string): EmailContent {
  const subject = 'Verifica tu email para VitaZen';
  const preheader = name + ', confirma tu dirección de email.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Confirma tu email.</h1><p style="' + textMain + '">Haz clic en el enlace para verificar tu dirección de email y activar tu cuenta.</p>' + ctaLink(verificationLink, 'Verificar email') + '<p style="color:#aaa;font-size:12px;line-height:1.5;margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Este enlace caduca en 24 horas. Si no solicitaste esta verificación, ignora este mensaje.</p>', preheader);
  const text = 'Confirma tu email.\n\nHaz clic en el enlace para verificar tu dirección de email y activar tu cuenta.\n\nVerificar email: ' + verificationLink + '\n\nEste enlace caduca en 24 horas. Si no solicitaste esta verificación, ignora este mensaje.';
  return { html, text, subject };
}

export function resetPasswordTemplate(name: string, resetLink: string): EmailContent {
  const subject = 'Restablece tu contraseña de VitaZen';
  const preheader = name + ', se solicitó un cambio de contraseña.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Restablece tu contraseña.</h1><p style="' + textMain + '">Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>' + ctaLink(resetLink, 'Restablecer contraseña') + '<p style="color:#aaa;font-size:12px;line-height:1.5;margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Este enlace caduca en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje y tu contraseña permanecerá sin cambios.</p>', preheader);
  const text = 'Restablece tu contraseña.\n\nRecibimos una solicitud para cambiar la contraseña de tu cuenta.\n\nRestablecer contraseña: ' + resetLink + '\n\nEste enlace caduca en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje y tu contraseña permanecerá sin cambios.';
  return { html, text, subject };
}

export function subscriptionConfirmedTemplate(name: string, planName: string): EmailContent {
  const subject = 'Tu suscripción a VitaZen está activa';
  const preheader = name + ', tu plan ' + planName + ' está activo.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Tu suscripción está activa.</h1><p style="' + textMain + '">Tu plan ' + planName + ' de VitaZen se ha activado correctamente.</p>' + ctaLink(APP_URL + '/dashboard', 'Acceder') + '<p style="color:#aaa;font-size:12px;line-height:1.5;margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Si tienes alguna pregunta, responde a este email.</p>', preheader);
  const text = 'Tu suscripción está activa.\n\nTu plan ' + planName + ' de VitaZen se ha activado correctamente.\n\nAcceder: ' + APP_URL + '/dashboard\n\nSi tienes alguna pregunta, responde a este email.';
  return { html, text, subject };
}
