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
<body style="background-color: #000000; color: #FFFFFF; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto;">

    <!-- Spacer top -->
    <tr><td style="height: 64px;"></td></tr>

    <!-- Logo -->
    <tr>
      <td style="text-align: center; padding-bottom: 12px;">
        <img src="${LOGO_URL}" alt="V" width="40" height="40" style="margin-bottom: 20px; opacity: 0.9;" />
      </td>
    </tr>

    <!-- Brand name -->
    <tr>
      <td style="text-align: center; padding-bottom: 8px;">
        <p style="color: #c8a55a; font-size: 11px; letter-spacing: 8px; margin: 0; font-weight: 400;">VITAZEN</p>
      </td>
    </tr>

    <!-- Gold accent line -->
    <tr>
      <td style="text-align: center; padding: 24px 0 0;">
        <div style="width: 32px; height: 1px; background-color: #c8a55a; margin: 0 auto;"></div>
      </td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 48px 32px 0;">
        ${content}
      </td>
    </tr>

    <!-- Gold accent line -->
    <tr>
      <td style="text-align: center; padding-top: 48px;">
        <div style="width: 32px; height: 1px; background-color: #c8a55a; margin: 0 auto;"></div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 32px 32px 64px; text-align: center;">
        <p style="color: #2a2a2a; font-size: 10px; letter-spacing: 3px; margin: 0;">VITAZEN</p>
      </td>
    </tr>

  </table>
</body>
</html>`;
}

function ctaButton(link: string, text: string): string {
  return `
  <div style="text-align: center; padding: 40px 0 24px;">
    <a href="${link}" style="background-color: #c8a55a; color: #000000; border: none; padding: 16px 48px; font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 2px; display: inline-block; letter-spacing: 3px;">${text}</a>
  </div>`;
}

export function welcomeEmail(name: string): string {
  return emailWrapper(`
    <h1 style="color: #FFFFFF; font-size: 26px; font-weight: 300; margin: 0 0 32px; letter-spacing: 0.5px; line-height: 1.3;">Bienvenido, ${name}.</h1>
    <p style="color: #888888; font-size: 15px; line-height: 1.8; margin: 0 0 16px;">
      Has tomado una decisión que la mayoría evita.
    </p>
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0;">
      Trabajar en ti mismo.
    </p>
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 16px 0 0;">
      A partir de ahora, cada acción cuenta.
    </p>
    ${ctaButton(`${APP_URL}/dashboard`, 'ACCEDER')}
    <p style="color: #2a2a2a; font-size: 11px; margin: 0; text-align: center; line-height: 1.6;">
      Si no creaste esta cuenta, puedes ignorar este mensaje.
    </p>
  `);
}

export function verifyEmailTemplate(name: string, verificationLink: string): string {
  return emailWrapper(`
    <h1 style="color: #FFFFFF; font-size: 26px; font-weight: 300; margin: 0 0 32px; letter-spacing: 0.5px; line-height: 1.3;">Confirma tu email.</h1>
    <p style="color: #888888; font-size: 15px; line-height: 1.8; margin: 0 0 16px;">
      Un paso más.
    </p>
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0;">
      Verifica tu acceso y entra.
    </p>
    ${ctaButton(verificationLink, 'CONFIRMAR')}
    <p style="color: #2a2a2a; font-size: 11px; margin: 0; text-align: center; line-height: 1.6;">
      Este enlace caduca en 24 horas.
    </p>
  `);
}

export function resetPasswordTemplate(name: string, resetLink: string): string {
  return emailWrapper(`
    <h1 style="color: #FFFFFF; font-size: 26px; font-weight: 300; margin: 0 0 32px; letter-spacing: 0.5px; line-height: 1.3;">Restaura tu acceso.</h1>
    <p style="color: #888888; font-size: 15px; line-height: 1.8; margin: 0 0 16px;">
      Se ha solicitado un cambio de contraseña.
    </p>
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0;">
      Si fuiste tú, continúa.
    </p>
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 16px 0 0;">
      Si no lo hiciste, puedes ignorar este mensaje.
    </p>
    ${ctaButton(resetLink, 'RESTABLECER')}
    <p style="color: #2a2a2a; font-size: 11px; margin: 0; text-align: center; line-height: 1.6;">
      Este enlace caduca en 1 hora.
    </p>
  `);
}

export function subscriptionConfirmedTemplate(name: string, planName: string): string {
  return emailWrapper(`
    <h1 style="color: #FFFFFF; font-size: 26px; font-weight: 300; margin: 0 0 32px; letter-spacing: 0.5px; line-height: 1.3;">${name}, acceso completo activado.</h1>
    <p style="color: #888888; font-size: 15px; line-height: 1.8; margin: 0 0 16px;">
      Has desbloqueado el siguiente nivel.
    </p>
    <p style="color: #555555; font-size: 14px; line-height: 1.8; margin: 0;">
      Ahora empieza el trabajo real.
    </p>
    ${ctaButton(`${APP_URL}/dashboard`, 'CONTINUAR')}
    <p style="color: #2a2a2a; font-size: 11px; margin: 0; text-align: center; line-height: 1.6;">
      Si tienes alguna duda, estamos aquí.
    </p>
  `);
}
