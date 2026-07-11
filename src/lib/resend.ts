// Lazy Resend client — avoids calling new Resend() at module evaluation time.
// The constructor throws in some SDK versions when apiKey is missing/empty.

let _resend: any = undefined;
function getResend(): any {
  if (!_resend) {
    const { Resend } = require('resend');
    _resend = new Resend(process.env.RESEND_API_KEY as string);
  }
  return _resend;
}

const handler: ProxyHandler<Record<string, unknown>> = {
  get(_target, prop) {
    const instance = getResend();
    const value = instance[prop];
    if (typeof value === 'function') return value.bind(instance);
    return value;
  },
};

// Backward-compatible export: consumers do `resend.emails.send(...)`
export const resend = new Proxy({}, handler) as any;
