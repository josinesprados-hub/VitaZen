import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

// [EMAIL DEBUG] Verificar que RESEND_API_KEY está definida
if (!apiKey) {
  console.error('[EMAIL DEBUG] RESEND_API_KEY NO está definida. Los emails NO se enviarán.');
} else {
  console.log('[EMAIL DEBUG] RESEND_API_KEY definida:', apiKey.substring(0, 6) + '...' + apiKey.substring(apiKey.length - 4));
}

export const resend = new Resend(apiKey);
