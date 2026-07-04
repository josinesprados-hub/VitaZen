// ═══════════════════════════════════════════
// BACKGROUND TASK MONITORING — VitaZen
// Monitor cron jobs, scheduled tasks, and server-side failures
// ═══════════════════════════════════════════
//
// CRITICAL FIX: Previously imported from ./logger (client-side),
// which silently did nothing on the server because it uses
// browser APIs (navigator.sendBeacon, etc.).
//
// Now uses ./server-logger which actually works server-side.
// All tracking functions now produce real, structured,
// searchable logs in Vercel.
//
// All tracking is fire-and-forget and non-blocking.

import { serverLog } from './server-logger';

// ─── Cron Job Tracking ──────────────────────

/**
 * Track a cron job failure.
 * Called when a Vercel cron endpoint encounters an error.
 */
export function trackCronFailure(
  cronName: string,
  error: unknown,
  durationMs?: number,
): void {
  serverLog.error(
    `cron/${cronName}`,
    `Cron failed: ${cronName}`,
    error,
    {
      durationMs,
      route: `/api/cron/${cronName}`,
    },
  );
}

/**
 * Track a cron job that took too long.
 * Helps identify performance regressions in background tasks.
 */
export function trackCronSlowRun(
  cronName: string,
  durationMs: number,
  thresholdMs: number = 30_000,
): void {
  if (durationMs < thresholdMs) return;

  serverLog.slow(
    `cron/${cronName}`,
    `Cron slow run: ${cronName} took ${durationMs}ms (threshold: ${thresholdMs}ms)`,
    durationMs,
    {
      route: `/api/cron/${cronName}`,
      thresholdMs,
    },
  );
}

// ─── Batch Processing Tracking ──────────────

/**
 * Track a batch processing failure.
 * Used in widget refresh batch, notification batch, etc.
 */
export function trackBatchProcessingFailure(
  taskName: string,
  errorCount: number,
  totalCount: number,
  error?: unknown,
): void {
  serverLog.error(
    `batch/${taskName}`,
    `Batch ${taskName}: ${errorCount}/${totalCount} failed`,
    error,
    {
      errorCount,
      totalCount,
      failureRate: `${Math.round((errorCount / totalCount) * 100)}%`,
    },
  );
}

// ─── Auth Sync Tracking ─────────────────────

/**
 * Track an auth sync failure.
 * These can cause users to get stuck in loading states.
 */
export function trackAuthSyncFailure(
  attempt: number,
  statusCode?: number,
  error?: unknown,
): void {
  const level = attempt >= 2 ? 'error' : 'warn';

  if (level === 'error') {
    serverLog.error(
      'auth/sync',
      `Auth sync failure (attempt ${attempt})`,
      error,
      {
        attempt,
        statusCode,
        route: '/api/auth/sync',
      },
    );
  } else {
    serverLog.warn(
      'auth/sync',
      `Auth sync failure (attempt ${attempt})`,
      {
        attempt,
        statusCode,
        route: '/api/auth/sync',
      },
    );
  }
}

// ─── API Route Error Tracking ───────────────

/**
 * Track an API route error.
 * Call from catch blocks in API route handlers.
 */
export function trackApiRouteError(
  route: string,
  method: string,
  statusCode: number,
  error: unknown,
): void {
  serverLog.apiError(route, method, statusCode, error);
}

// ─── Network Error Tracking ─────────────────

/**
 * Track a client-side network failure.
 * Helps identify connectivity issues on mobile.
 */
export function trackNetworkFailure(
  url: string,
  method: string,
  error: unknown,
): void {
  // Strip any tokens/PII from URL
  const cleanUrl = url
    .replace(/Bearer\s+[\w.-]+/gi, '')
    .replace(/token=[^&]+/gi, 'token=[REDACTED]');

  serverLog.warn(
    'network',
    `Network ${method} ${cleanUrl}: failed`,
    {
      method,
      url: cleanUrl,
      errorType: error instanceof Error ? error.constructor.name : 'NetworkError',
    },
  );
}
