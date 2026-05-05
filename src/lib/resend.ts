import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.error('[EMAIL] RESEND_API_KEY no definida. Los emails no se enviarán.');
}

export const resend = new Resend(apiKey);
