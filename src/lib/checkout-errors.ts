// ═════════════════════════════════════════════════════════════════════
// VITAZEN — CHECKOUT / PORTAL REDIRECT ERRORS (D-6, E-9)
// ═════════════════════════════════════════════════════════════════════
//
// PROBLEM (D-6): the subscription flows already redirect with an error
// query param when Stripe checkout/portal fails —
//
//   pricing/page.tsx  → /pricing?error=checkout   (checkout API non-ok)
//   pricing/page.tsx  → /pricing?error=connection (checkout network error)
//   pricing/page.tsx  → /ajustes?error=portal     (portal API non-ok)
//   pricing/page.tsx  → /ajustes?error=connection (portal network error)
//
// — but nothing consumed those params, so the user landed back in the
// app with ZERO feedback about what failed.
//
// This module maps each existing code to ONE fixed, human message. The
// messages are deliberately generic: no stack traces, no internal IDs,
// no Stripe payloads, no URLs. Unknown codes fall back to the generic
// message so an unexpected value can never leak anything or break the
// page.
//
// Consumers (pricing + ajustes) read the param once on mount, show the
// message through the app's accessible alert pattern (role="alert" +
// Cerrar), and clean the URL with window.history.replaceState — the
// Next.js-documented shallow way to strip query params without a
// reload, a navigation loop, or any state loss.
// ═════════════════════════════════════════════════════════════════════

export const CHECKOUT_ERROR_MESSAGES: Record<string, string> = {
  checkout:
    'No hemos podido iniciar la suscripción a Élite. No se ha realizado ningún cargo. Inténtalo de nuevo en unos momentos.',
  connection:
    'No hemos podido conectar con el servicio de pagos. Comprueba tu conexión e inténtalo de nuevo.',
  portal:
    'No hemos podido abrir la gestión de tu suscripción. Inténtalo de nuevo en unos momentos.',
};

const GENERIC_MESSAGE =
  'No hemos podido completar la operación. Inténtalo de nuevo en unos momentos.';

/**
 * Fixed, user-safe message for a redirect error code. Unknown or empty
 * codes always return the generic message (fail-safe, leak-free).
 */
export function getCheckoutErrorMessage(code: string | null | undefined): string {
  if (code && Object.prototype.hasOwnProperty.call(CHECKOUT_ERROR_MESSAGES, code)) {
    return CHECKOUT_ERROR_MESSAGES[code];
  }
  return GENERIC_MESSAGE;
}
