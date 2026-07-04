// ═══════════════════════════════════════════════════════════
// VITAZEN ANALYTICS — Client-side utility
// ═══════════════════════════════════════════════════════════
// Privacy-first: only tracks explicit events.
// Uses fetch with keepalive for reliability on mobile.
// No fingerprinting, no cookies, no PII in properties.
// ═══════════════════════════════════════════════════════════

// ─── Valid event names (whitelist — must match server) ─────

export type ClientAnalyticsEvent =
  | 'daily_session'
  | 'recap_opened';

const VALID_CLIENT_EVENTS = new Set<string>([
  'daily_session',
  'recap_opened',
]);

// ─── Track (client-side → POST /api/analytics/track) ──────

interface ClientTrackOptions {
  event: string;
  properties?: Record<string, string | number | boolean>;
}

/**
 * Track an analytics event from the client.
 * Uses fetch with keepalive so events are sent even if the
 * page is being unloaded (critical for mobile).
 * Errors are silently swallowed — analytics never break UX.
 */
export function trackEvent({ event, properties }: ClientTrackOptions): void {
  if (!VALID_CLIENT_EVENTS.has(event)) {
    console.warn(`[Analytics] Unknown client event: ${event}`);
    return;
  }

  try {
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, properties }),
      keepalive: true,   // ensures delivery on page unload
      credentials: 'same-origin',
    }).catch(() => {
      // Silently swallow — analytics never break UX
    });
  } catch {
    // Silently swallow — analytics never break UX
  }
}
