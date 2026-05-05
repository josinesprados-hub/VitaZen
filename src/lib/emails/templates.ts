const LOGO_URL = `${process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc'}/images/vitazen-logo.png`;

const baseStyles = `
  background-color: #000000;
  color: #FFFFFF;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  margin: 0;
  padding: 0;
`;

const buttonStyle = `
  background-color: #c8a55a;
  color: #000000;
  border: none;
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  border-radius: 4px;
  display: inline-block;
`;

function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="${baseStyles}">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td style="text-align: center; padding-bottom: 32px; border-bottom: 1px solid #1a1a1a;">
        <img src="${LOGO_URL}" alt="VitaZen" width="64" height="64" style="margin-bottom: 16px;" />
        <h1 style="color: #c8a55a; font-size: 28px; margin: 0; letter-spacing: 2px;">VITAZEN</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 0;">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="padding-top: 32px; border-top: 1px solid #1a1a1a; text-align: center; color: #666; font-size: 14px;">
        <p style="margin: 0;">VitaZen &copy; 2025</p>
        <p style="margin: 8px 0 0;">vitazen.cc</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function welcomeEmail(name: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 24px; margin-bottom: 24px;">Bienvenido, ${name}</h2>
    <p style="color: #CCCCCC; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
      Tu viaje de transformación personal comienza ahora. VitaZen está diseñado para ayudarte a construir los 5 imperios de tu vida.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px;">
      <tr>
        <td style="padding: 12px 0; color: #c8a55a; font-size: 15px;">&#9670; Imperio Disciplina</td>
        <td style="color: #999; font-size: 14px;">Hábitos, desafíos y consistencia</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #c8a55a; font-size: 15px;">&#9670; Imperio Mente</td>
        <td style="color: #999; font-size: 14px;">Meditación, mentor IA y bienestar</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #c8a55a; font-size: 15px;">&#9670; Imperio Energía</td>
        <td style="color: #999; font-size: 14px;">Nutrición, salud física y vitalidad</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #c8a55a; font-size: 15px;">&#9670; Imperio Finanzas</td>
        <td style="color: #999; font-size: 14px;">Finanzas, mindset y gestión del dinero</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #c8a55a; font-size: 15px;">&#9670; Imperio Crecimiento</td>
        <td style="color: #999; font-size: 14px;">Diario personal, reflexión y desarrollo</td>
      </tr>
    </table>
    <div style="text-align: center;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc'}/dashboard" style="${buttonStyle}">Comienza tu camino</a>
    </div>
  `);
}

export function verifyEmailTemplate(name: string, verificationLink: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 24px; margin-bottom: 24px;">Confirma tu cuenta, ${name}</h2>
    <p style="color: #CCCCCC; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
      Verifica tu dirección de email para activar tu cuenta de VitaZen y acceder a todos los imperios.
    </p>
    <div style="text-align: center;">
      <a href="${verificationLink}" style="${buttonStyle}">Confirmar email</a>
    </div>
    <p style="color: #666; font-size: 14px; margin-top: 24px; text-align: center;">
      Este enlace caduca en 24 horas.
    </p>
  `);
}

export function resetPasswordTemplate(name: string, resetLink: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 24px; margin-bottom: 24px;">Recupera tu acceso, ${name}</h2>
    <p style="color: #CCCCCC; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
      Hemos recibido una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva.
    </p>
    <div style="text-align: center;">
      <a href="${resetLink}" style="${buttonStyle}">Restablecer Contraseña</a>
    </div>
    <p style="color: #666; font-size: 14px; margin-top: 24px; text-align: center;">
      Este enlace caduca en 1 hora. Si no solicitaste este cambio, ignora este email.
    </p>
  `);
}

export function subscriptionConfirmedTemplate(name: string, planName: string): string {
  return emailWrapper(`
    <h2 style="color: #FFFFFF; font-size: 24px; margin-bottom: 24px;">Bienvenido a ${planName}, ${name}</h2>
    <p style="color: #CCCCCC; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
      Tu suscripción está activa. Ahora tienes acceso completo a todo el ecosistema VitaZen.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 32px; background-color: #0a0a0a; border-radius: 8px;">
      <tr>
        <td style="padding: 20px; color: #c8a55a; font-size: 16px;">&#10003; Mensajes IA ilimitados</td>
      </tr>
      <tr>
        <td style="padding: 0 20px 20px; color: #c8a55a; font-size: 16px;">&#10003; Mentor IA avanzado</td>
      </tr>
      <tr>
        <td style="padding: 0 20px 20px; color: #c8a55a; font-size: 16px;">&#10003; Contenido premium en todos los imperios</td>
      </tr>
      <tr>
        <td style="padding: 0 20px 20px; color: #c8a55a; font-size: 16px;">&#10003; Recomendaciones personalizadas</td>
      </tr>
    </table>
    <div style="text-align: center;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc'}/dashboard" style="${buttonStyle}">Ir al panel</a>
    </div>
  `);
}
