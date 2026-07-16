// ═══════════════════════════════════════════
// VITAZEN EMAIL TEMPLATES
// Premium dark/champagne design, transactional-first
// Black background, V logo, champagne accents
// Optimized for Gmail/Outlook/Apple Mail
// Anti-dark-mode: color-scheme light-only
// ═══════════════════════════════════════════

import type { EmailContent } from './types';

// ─── HTML entity escaping for user-supplied values in email templates ───
// Prevents XSS when user-controlled strings (name, planName) are
// interpolated into HTML. Safe for all email clients.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

// ─── V Logo: public URL for maximum email client compatibility ───
// cid: attachments fail in Gmail iOS/Android; public HTTPS URL works everywhere
const V_LOGO_SRC = 'https://vitazen.cc/images/icon-192x192.png';

// ─── Cross-client font stack ───
// -apple-system / BlinkMacSystemFont → macOS/iOS
// Segoe UI → Windows
// Roboto → Android
// Helvetica / Arial → universal fallback
// sans-serif → final fallback
const FONT_STACK_CSS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// ─── Anti-dark-mode + Gmail compatibility styles ───
//
// KEY STRATEGY: Gmail Android tablet dark mode is the most aggressive.
// It parses color-scheme meta tag and auto-inverts when it sees "light dark".
// Since our emails are ALREADY dark-themed, declaring color-scheme: light
// tells Gmail "I handle my own colors, don't apply your dark mode algorithm".
// This is the #1 most effective fix per Litmus/Email on Acid testing.
//
// Defense layers:
// 1. <meta color-scheme="light"> — prevents Gmail auto-dark inversion
// 2. u + .email-body selectors — override Gmail mobile dark mode
// 3. Inline styles everywhere — survive when <style> is stripped
//
const ANTI_DARK_MODE_STYLES = `
  <style type="text/css">
    /* ====== EMAIL CLIENT RESETS ====== */
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }

    /* ====== GMAIL DARK MODE OVERRIDES (defense layer 2) ====== */
    /* Gmail wraps the email in <u> and auto-inverts colors */
    /* u + .class targets this wrapper — works on Gmail mobile, partial on tablet */
    /* Primary defense is the color-scheme meta tag above */
    u + .email-body .email-bg { background-color:#080808 !important; }
    u + .email-body .content-cell { background-color:#080808 !important; }
    u + .email-body .champagne-text { color:#c8a55a !important; }
    u + .email-body .white-text { color:#ffffff !important; }
    u + .email-body .heading-text { color:#ffffff !important; }
    u + .email-body .body-text { color:#d4d4d4 !important; }
    u + .email-body .secondary-text { color:#aaaaaa !important; }
    u + .email-body .label-text { color:#777777 !important; }
    u + .email-body .muted-text { color:#666666 !important; }
    u + .email-body .subtle-text { color:#555555 !important; }
    u + .email-body .cta-cell { background-color:#c8a55a !important; }
    u + .email-body .cta-link { color:#0a0a0a !important; }
    u + .email-body .divider-champagne { background-color:#c8a55a !important; }
    u + .email-body .divider-subtle { background-color:#333333 !important; }
    u + .email-body .logo-img { filter:none !important; -webkit-filter:none !important; }

    /* ====== NO @media (prefers-color-scheme: dark) ====== */
    /* Deliberately omitted: this email is ALREADY dark-themed. */
    /* Adding a dark media query causes Apple Mail to double-apply */
    /* dark mode transformations, washing out the premium palette. */
    /* color-scheme:light prevents Gmail; inline styles handle the rest. */
  </style>
  <!--[if mso]>
  <style type="text/css">
    body,table,td,p,a,h1,span { font-family:Tahoma,Verdana,Segoe,sans-serif !important; }
  </style>
  <![endif]-->
`;

// ─── Premium dark wrapper: black bg, V logo, champagne brand ───

function emailWrapper(content: string, preheaderText: string): string {
  return `
<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!-- Anti-dark-mode: declare light-only so Gmail/Android tablets skip auto-inversion -->
  <!-- Our email is already dark-themed; we DON'T want client dark mode on top -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
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
  ${ANTI_DARK_MODE_STYLES}
</head>
<body class="email-body" style="margin:0;padding:0;background-color:#080808;-webkit-font-smoothing:antialiased;font-family:${FONT_STACK_CSS};" bgcolor="#080808">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#080808;line-height:1px;font-family:${FONT_STACK_CSS};">
    ${preheaderText}
    &zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>
  <!-- Outer table: explicit bgcolor on table AND td for maximum Gmail/Outlook compat -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-bg" style="background-color:#080808;" bgcolor="#080808">
    <tr>
      <td align="center" class="content-cell" style="padding:48px 16px;background-color:#080808;" bgcolor="#080808">
        <!-- Inner container table: also explicit bgcolor -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#080808;" bgcolor="#080808">

          <!-- V Logo -->
          <tr>
            <td class="content-cell" style="padding:0 40px 20px;text-align:center;background-color:#080808;" bgcolor="#080808">
              <img class="logo-img" src="${V_LOGO_SRC}" alt="V" width="48" height="48" style="display:inline-block;border:0;outline:none;text-decoration:none;border-radius:10px;-ms-interpolation-mode:bicubic;font-size:20px;color:#c8a55a;" />
            </td>
          </tr>

          <!-- Brand Name -->
          <tr>
            <td class="content-cell" style="padding:0 40px 24px;text-align:center;background-color:#080808;" bgcolor="#080808">
              <p class="champagne-text" style="color:#c8a55a;font-size:12px;letter-spacing:6px;margin:0;font-weight:500;font-family:${FONT_STACK_CSS};">VITAZEN</p>
            </td>
          </tr>

          <!-- Champagne Accent Line -->
          <tr>
            <td class="content-cell" style="padding:0 40px 0;background-color:#080808;" bgcolor="#080808">
              <div class="divider-champagne" style="width:40px;height:1px;background-color:#c8a55a;margin:0 auto;font-size:1px;line-height:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td class="content-cell" style="padding:32px 40px 40px;font-family:${FONT_STACK_CSS};background-color:#080808;" bgcolor="#080808">
              ${content}
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#080808;" bgcolor="#080808">
          <tr>
            <td class="content-cell" style="padding:0 40px;background-color:#080808;" bgcolor="#080808">
              <div class="divider-subtle" style="width:40px;height:1px;background-color:#333;margin:0 auto 20px;font-size:1px;line-height:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="content-cell" style="padding:0 40px;text-align:center;background-color:#080808;" bgcolor="#080808">
              <p class="champagne-text" style="color:#c8a55a;font-size:11px;letter-spacing:4px;margin:0 0 4px;font-weight:500;font-family:${FONT_STACK_CSS};">VITAZEN</p>
              <p class="subtle-text" style="color:#555;font-size:11px;margin:0;font-family:${FONT_STACK_CSS};">vitazen.cc</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Bulletproof champagne CTA button (Outlook-safe) ───

function ctaButton(link: string, text: string): string {
  return `<div style="padding:28px 0 0;text-align:center;">
  <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td class="cta-cell" style="background-color:#c8a55a;border-radius:3px;" bgcolor="#c8a55a">
        <a href="${link}" class="cta-link" style="display:inline-block;padding:12px 32px;color:#0a0a0a;font-size:14px;font-weight:500;text-decoration:none;font-family:${FONT_STACK_CSS};letter-spacing:0.5px;">${text}</a>
      </td>
    </tr>
  </table>
</div>`;
}

const textMain = `color:#d4d4d4;font-size:15px;line-height:1.7;margin:0 0 10px;font-family:${FONT_STACK_CSS};`;
const headingStyle = `color:#ffffff;font-size:20px;font-weight:400;margin:0 0 20px;line-height:1.3;letter-spacing:0.3px;font-family:${FONT_STACK_CSS};`;
const mutedStyle = `color:#666;font-size:12px;line-height:1.5;margin:24px 0 0;font-family:${FONT_STACK_CSS};`;
const secondaryStyle = `color:#aaa;font-size:16px;line-height:1.6;margin:0 0 6px;font-family:${FONT_STACK_CSS};`;
const secondaryStyleNoMargin = `color:#aaa;font-size:16px;line-height:1.6;margin:0;font-family:${FONT_STACK_CSS};`;

export function welcomeEmail(name: string): EmailContent {
  const subject = 'Cuenta creada en VitaZen';
  const preheader = 'Tu cuenta se ha creado correctamente.';
  const safeName = escapeHtml(name);
  const html = emailWrapper('<h1 class="heading-text" style="' + headingStyle + '">Hola, ' + safeName + '.</h1><p class="body-text" style="' + textMain + '">Tu cuenta en VitaZen se ha creado correctamente. Ya puedes acceder cuando quieras.</p>' + ctaButton(APP_URL + '/dashboard', 'ACCEDER') + '<p class="muted-text" style="' + mutedStyle + '">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>', preheader);
  const text = 'Hola, ' + name + '.\n\nTu cuenta en VitaZen se ha creado correctamente. Ya puedes acceder cuando quieras.\n\nAcceder: ' + APP_URL + '/dashboard\n\nSi no creaste esta cuenta, puedes ignorar este mensaje.';
  return { html, text, subject };
}

export function verifyEmailTemplate(name: string, verificationLink: string): EmailContent {
  const subject = 'Verifica tu email para VitaZen';
  const safeName = escapeHtml(name);
  const preheader = safeName + ', confirma tu dirección de email.';
  const html = emailWrapper('<h1 class="heading-text" style="' + headingStyle + '">Confirma tu email.</h1><p class="secondary-text" style="' + secondaryStyle + '">Un paso más.</p><p class="secondary-text" style="' + secondaryStyleNoMargin + '">Verifica tu acceso y entra.</p>' + ctaButton(verificationLink, 'CONFIRMAR') + '<p class="muted-text" style="' + mutedStyle + '">Este enlace caduca en 24 horas. Si no solicitaste esta verificación, ignora este mensaje.</p>', preheader);
  const text = 'Confirma tu email.\n\nUn paso más. Verifica tu acceso y entra.\n\nConfirmar: ' + verificationLink + '\n\nEste enlace caduca en 24 horas. Si no solicitaste esta verificación, ignora este mensaje.';
  return { html, text, subject };
}

export function resetPasswordTemplate(name: string, resetLink: string): EmailContent {
  const subject = 'Restablece tu contraseña de VitaZen';
  const safeName = escapeHtml(name);
  const preheader = safeName + ', se solicitó un cambio de contraseña.';
  const html = emailWrapper('<h1 class="heading-text" style="' + headingStyle + '">Restablece tu contraseña.</h1><p class="body-text" style="' + textMain + '">Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>' + ctaButton(resetLink, 'RESTABLECER') + '<p class="muted-text" style="' + mutedStyle + '">Este enlace caduca en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje y tu contraseña permanecerá sin cambios.</p>', preheader);
  const text = 'Restablece tu contraseña.\n\nRecibimos una solicitud para cambiar la contraseña de tu cuenta.\n\nRestablecer contraseña: ' + resetLink + '\n\nEste enlace caduca en 1 hora. Si no solicitaste este cambio, puedes ignorar este mensaje y tu contraseña permanecerá sin cambios.';
  return { html, text, subject };
}

export function subscriptionConfirmedTemplate(name: string, planName: string): EmailContent {
  const subject = 'Tu suscripción a VitaZen está activa';
  const safeName = escapeHtml(name);
  const safePlanName = escapeHtml(planName);
  const preheader = safeName + ', tu plan ' + safePlanName + ' está activo.';
  const html = emailWrapper('<h1 class="heading-text" style="' + headingStyle + '">Tu suscripción está activa.</h1><p class="body-text" style="' + textMain + '">Tu plan ' + safePlanName + ' de VitaZen se ha activado correctamente.</p>' + ctaButton(APP_URL + '/dashboard', 'ACCEDER') + '<p class="muted-text" style="' + mutedStyle + '">Si tienes alguna pregunta, responde a este email.</p>', preheader);
  const text = 'Tu suscripción está activa.\n\nTu plan ' + planName + ' de VitaZen se ha activado correctamente.\n\nAcceder: ' + APP_URL + '/dashboard\n\nSi tienes alguna pregunta, responde a este email.';
  return { html, text, subject };
}
