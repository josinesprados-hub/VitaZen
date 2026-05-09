// ═══════════════════════════════════════════
// VITAZEN EMAIL TEMPLATES
// Premium dark/gold design, transactional-first
// Black background, gold accents, clean HTML
// Optimized for Gmail/Outlook/Apple Mail
// ═══════════════════════════════════════════

import type { EmailContent } from './types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

// ─── Premium dark wrapper: black bg, gold brand, elegant spacing ───

function emailWrapper(content: string, preheaderText: string): string {
  return `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>VitaZen</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#080808;-webkit-font-smoothing:antialiased;" bgcolor="#080808">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#080808;line-height:1px;">
    ${preheaderText}
    &zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#080808;" bgcolor="#080808">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
          <tr>
            <td style="padding:0 40px 28px;text-align:center;">
              <p style="color:#c8a55a;font-size:12px;letter-spacing:6px;margin:0;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">VITAZEN</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 0;">
              <div style="width:40px;height:1px;background-color:#c8a55a;margin:0 auto;"></div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              ${content}
            </td>
          </tr>
        </table>
        <p style="color:#555;font-size:11px;margin:24px 0 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">VitaZen · vitazen.cc</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Bulletproof gold CTA button (Outlook-safe) ───

function ctaButton(link: string, text: string): string {
  return `<div style="padding:28px 0 0;text-align:center;">
  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td style="background-color:#c8a55a;border-radius:3px;">
        <a href="${link}" style="display:inline-block;padding:12px 32px;color:#0a0a0a;font-size:14px;font-weight:500;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;letter-spacing:0.5px;">${text}</a>
      </td>
    </tr>
  </table>
</div>`;
}

const textMain = 'color:#d4d4d4;font-size:15px;line-height:1.7;margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
const headingStyle = 'color:#ffffff;font-size:20px;font-weight:400;margin:0 0 20px;line-height:1.3;letter-spacing:0.3px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

export function welcomeEmail(name: string): EmailContent {
  const subject = 'Cuenta creada en VitaZen';
  const preheader = 'Tu cuenta se ha creado correctamente.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Hola, ' + name + '.</h1><p style="' + textMain + '">Tu cuenta en VitaZen se ha creado correctamente. Ya puedes acceder cuando quieras.</p>' + ctaButton(APP_URL + '/dashboard', 'Acceder') + '<p style="color:#666;font-size:12px;line-height:1.5;margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>', preheader);
  const text = 'Hola, ' + name + '.\n\nTu cuenta en VitaZen se ha creado correctamente. Ya puedes acceder cuando quieras.\n\nAcceder: ' + APP_URL + '/dashboard\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.';
  return { html, text, subject };
}

export function verifyEmailTemplate(name: string, verificationLink: string): EmailContent {
  const subject = 'Verifica tu email para VitaZen';
  const preheader = name + ', confirma tu dirección de email.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Confirma tu email.</h1><p style="' + textMain + '">Haz clic en el enlace para verificar tu dirección de email y activar tu cuenta.</p>' + ctaButton(verificationLink, 'Verificar email') + '<p style="color:#666;font-size:12px;line-height:1.5;margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Este enlace caduca en 24 horas. Si no solicitaste esta verificación, ignora este mensaje.</p>', preheader);
  const text = 'Confirma tu email.\n\nHaz clic en el enlace para verificar tu dirección de email y activar tu cuenta.\n\nVerificar email: ' + verificationLink + '\n\nEste enlace caduca en 24 horas. Si no solicitaste esta verificación, ignora este mensaje.';
  return { html, text, subject };
}

export function resetPasswordTemplate(name: string, resetLink: string): EmailContent {
  const subject = 'Restablece tu contraseña de VitaZen';
  const preheader = name + ', se solicitó un cambio de contraseña.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Restablece tu contraseña.</h1><p style="' + textMain + '">Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>' + ctaButton(resetLink, 'Restablecer contraseña') + '<p style="color:#666;font-size:12px;line-height:1.5;margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Este enlace caduca en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje y tu contraseña permanecerá sin cambios.</p>', preheader);
  const text = 'Restablece tu contraseña.\n\nRecibimos una solicitud para cambiar la contraseña de tu cuenta.\n\nRestablecer contraseña: ' + resetLink + '\n\nEste enlace caduca en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje y tu contraseña permanecerá sin cambios.';
  return { html, text, subject };
}

export function subscriptionConfirmedTemplate(name: string, planName: string): EmailContent {
  const subject = 'Tu suscripción a VitaZen está activa';
  const preheader = name + ', tu plan ' + planName + ' está activo.';
  const html = emailWrapper('<h1 style="' + headingStyle + '">Tu suscripción está activa.</h1><p style="' + textMain + '">Tu plan ' + planName + ' de VitaZen se ha activado correctamente.</p>' + ctaButton(APP_URL + '/dashboard', 'Acceder') + '<p style="color:#666;font-size:12px;line-height:1.5;margin:24px 0 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">Si tienes alguna pregunta, responde a este email.</p>', preheader);
  const text = 'Tu suscripción está activa.\n\nTu plan ' + planName + ' de VitaZen se ha activado correctamente.\n\nAcceder: ' + APP_URL + '/dashboard\n\nSi tienes alguna pregunta, responde a este email.';
  return { html, text, subject };
}
