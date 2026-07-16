import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.error('[EMAIL] RESEND_API_KEY no definida. Los emails no se enviarán.');
} else {
  console.log('[EMAIL] RESEND_API_KEY found — length:', apiKey.length, 'prefix:', apiKey.slice(0, 4) + '...');
}

// Pass a placeholder when the key is missing so the constructor doesn't throw
// during build / static prerendering. Actual send calls will fail gracefully
// (returning an error response or throwing), which is the desired behaviour.
export const resend = new Resend(apiKey || 're_build_placeholder');
