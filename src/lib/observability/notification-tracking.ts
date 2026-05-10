// ═══════════════════════════════════════════
// PUSH NOTIFICATION ERROR TRACKING — VitaZen
// Track FCM delivery, token, and permission failures
// ═══════════════════════════════════════════
//
// Push notifications have many failure modes:
//   - FCM token invalidation
//   - Permission denied
//   - Network failures during send
//   - Service worker not registered
//   - VAPID key missing
//   - Token registration API failure
//
// These failures are usually silent — the user never knows
// notifications aren't being delivered. This module tracks
// them so we can identify and fix delivery issues.

import { reportError } from './logger';

// ─── FCM Token Errors ───────────────────────

/**
 * Track when push token registration fails on the client.
 */
export function trackPushTokenRegistrationFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Token registration failed';

  reportError(
    'push_notification',
    'warning',
    `Push token registration failed: ${message}`,
    error instanceof Error ? error.constructor.name : 'TokenError',
  );
}

/**
 * Track when push is not supported in the browser.
 * Informational — helps us understand browser compatibility.
 */
export function trackPushNotSupported(): void {
  reportError(
    'push_notification',
    'info',
    'Push notifications not supported in this browser',
    'PushNotSupported',
  );
}

/**
 * Track when permission is denied by the user.
 * Informational — not an error.
 */
export function trackPushPermissionDenied(): void {
  reportError(
    'push_notification',
    'info',
    'Push notification permission denied',
    'PermissionDenied',
  );
}

/**
 * Track when VAPID key is not configured.
 * This is a deployment configuration issue.
 */
export function trackPushVapidKeyMissing(): void {
  reportError(
    'push_notification',
    'error',
    'VAPID key not configured — push notifications unavailable',
    'ConfigurationError',
  );
}

// ─── FCM Send Errors ────────────────────────

/**
 * Track when FCM message send fails on the server.
 * Called from the notification service.
 */
export function trackFCMSendFailure(
  error: unknown,
  tokenCount: number,
): void {
  const message = error instanceof Error ? error.message : 'FCM send failed';

  reportError(
    'push_notification',
    'error',
    `FCM send failed (${tokenCount} tokens): ${message}`,
    error instanceof Error ? error.constructor.name : 'FCMError',
    { route: '/api/notifications' },
  );
}

/**
 * Track when FCM reports invalid tokens.
 * This is expected — tokens expire when users uninstall.
 */
export function trackFCMInvalidTokens(count: number): void {
  if (count === 0) return;

  reportError(
    'push_notification',
    'info',
    `FCM reported ${count} invalid token(s) — cleaned up`,
    'InvalidTokens',
    { route: '/api/notifications' },
  );
}

/**
 * Track when there are no active tokens for a user.
 * May indicate a registration issue.
 */
export function trackNoActiveTokens(): void {
  reportError(
    'push_notification',
    'info',
    'No active push tokens for user — cannot deliver notifications',
    'NoTokens',
  );
}

// ─── Service Worker Errors ──────────────────

/**
 * Track service worker registration failure.
 */
export function trackSWRegistrationFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : 'SW registration failed';

  reportError(
    'service_worker',
    'warning',
    `Service worker registration failed: ${message}`,
    error instanceof Error ? error.constructor.name : 'SWError',
  );
}

/**
 * Track background message handler failure in the service worker.
 */
export function trackSWBackgroundMessageError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'SW background message error';

  reportError(
    'service_worker',
    'warning',
    `Service worker background message error: ${message}`,
    'SWMessageError',
  );
}

// ─── Server-Side Notification Errors ─────────

/**
 * Track when notification gate check fails.
 */
export function trackNotificationGateFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Gate check failed';

  reportError(
    'push_notification',
    'warning',
    `Notification gate check failed: ${message}`,
    error instanceof Error ? error.constructor.name : 'GateError',
    { route: '/api/notifications' },
  );
}

/**
 * Track when notification dedup check fails.
 */
export function trackNotificationDedupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Dedup check failed';

  reportError(
    'push_notification',
    'warning',
    `Notification dedup check failed: ${message}`,
    error instanceof Error ? error.constructor.name : 'DedupError',
    { route: '/api/notifications' },
  );
}
