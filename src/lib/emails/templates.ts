const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';
const LOGO_URL = `${APP_URL}/images/vitazen-logo.png`;

function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="background-color: #000000; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; margin: 0 auto; padding: 48px 24px;">

    <!-- Header -->
    <tr>
      <td style="text-align: center; padding-bottom: 40px;">
        <img src="${LOGO_URL}" alt="V" width="48" height="48" style="margin-bottom: 16px; opacity: 0.95;" />
        <p style="color: #c8a55a; font-size: 14px; letter-spacing: 6px; margin: 0; font-weight: 500;">VITAZEN</p>
      </td>
    </tr>

    <!-- Divider -->
    <tr>
      <td style="padding-bottom: 40px;">
        <div style="height: 1px; background: linear-gradient(90deg, transparent, #1a1a1a, transparent);"></div>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 0 8px;">
        ${content}
      </td>
    </tr>

    <!-- Divider -->
    <tr>
      <td style="padding-top: 40px;">
        <div style="height: 1px; background: linear-gradient(90deg, transparent, #1a1a1a, transparent);"></div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding-top: 32px; text-align: center;">
        <p style="color: #333; font-size: 12px; margin: 0; letter-spacing: 2px;">VITAZEN</p>
        <p style="color: #222; font-size: 11px; margin: 8px 0 0;">vitazen.cc</p>
      </td>
    </tr>

  </table>
</body>
</html>`;
}

function ctaButton(link: string, text: string): string {
  return `
  <div style="text-align: center; margin: 32px 0;">
    <a href="${link}" style="background-color: #c8a55a; color: #000000; border: none; padding: 14px 40px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 4px; display: inline-block; letter-spacing: 1px;">${text}</a>
  </div>`;
}

export function welcomeEmail(name: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 22px; font-weight: 400; margin: 0 0 24px; letter-spacing: 0.5px;">Hola, ${name}.</h2>
    <p style="color: #777; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">
      Tu acceso está listo.
    </p>
    <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0;">
      Cinco imperios. Un solo camino. Continúa cuando quieras.
    </p>
    ${ctaButton(`${APP_URL}/dashboard`, 'ENTRAR')}
    <p style="color: #333; font-size: 12px; margin: 0; text-align: center;">
      Si no esperabas este email, ignóralo.
    </p>
  `);
}

export function verifyEmailTemplate(name: string, verificationLink: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 22px; font-weight: 400; margin: 0 0 24px; letter-spacing: 0.5px;">Confirma tu email, ${name}.</h2>
    <p style="color: #777; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">
      Un paso más para activar tu cuenta.
    </p>
    <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0;">
      Pulsa el botón y estarás dentro.
    </p>
    ${ctaButton(verificationLink, 'CONFIRMAR')}
    <p style="color: #333; font-size: 12px; margin: 0; text-align: center;">
      Este enlace caduca en 24 horas.
    </p>
  `);
}

export function resetPasswordTemplate(name: string, resetLink: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 22px; font-weight: 400; margin: 0 0 24px; letter-spacing: 0.5px;">${name}, restaura tu acceso.</h2>
    <p style="color: #777; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">
      Recibimos una solicitud para cambiar tu contraseña.
    </p>
    <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0;">
      Si fuiste tú, continúa. Si no, ignora este mensaje.
    </p>
    ${ctaButton(resetLink, 'RESTABLECER')}
    <p style="color: #333; font-size: 12px; margin: 0; text-align: center;">
      Este enlace caduca en 1 hora.
    </p>
  `);
}

export function subscriptionConfirmedTemplate(name: string, planName: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 22px; font-weight: 400; margin: 0 0 24px; letter-spacing: 0.5px;">${name}, tu plan ${planName} está activo.</h2>
    <p style="color: #777; font-size: 15px; line-height: 1.7; margin: 0 0 8px;">
      Acceso completo desbloqueado.
    </p>
    <p style="color: #555; font-size: 14px; line-height: 1.7; margin: 0;">
      Tu progreso empieza ahora.
    </p>
    ${ctaButton(`${APP_URL}/dashboard`, 'IR AL PANEL')}
    <p style="color: #333; font-size: 12px; margin: 0; text-align: center;">
      Si tienes alguna duda, estamos aquí.
    </p>
  `);
}
