// ═══════════════════════════════════════════
// BACKGROUND TASK MONITORING — VitaZen
// Monitor cron jobs, scheduled tasks, and server-side failures
// ═══════════════════════════════════════════
//
// Background tasks (cron jobs, scheduled notifications, etc.)
// are invisible to the user and often fail silently.
// This module tracks:
//   - Cron job failures
//   - Scheduled task timeouts
//   - Batch processing errors
//   - Token cleanup failures
//
// All tracking is fire-and-forget and non-blocking.

import { reportError } from './logger';

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
  const message = error instanceof Error ? error.message : 'Cron job failed';
  const duration = durationMs ? ` (${durationMs}ms)` : '';

  reportError(
    'background_task',
    'error',
    `Cron failed: ${cronName}${duration} — ${message}`,
    error instanceof Error ? error.constructor.name : 'CronError',
    { route: `/api/cron/${cronName}` },
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

  reportError(
    'background_task',
    'warning',
    `Cron slow run: ${cronName} took ${durationMs}ms (threshold: ${thresholdMs}ms)`,
    'SlowCronWarning',
    { route: `/api/cron/${cronName}` },
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
  const message = error instanceof Error ? error.message : 'Batch processing errors';

  reportError(
    'background_task',
    errorCount > totalCount * 0.5 ? 'error' : 'warning',
    `Batch ${taskName}: ${errorCount}/${totalCount} failed — ${message}`,
    'BatchProcessingError',
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
  const message = error instanceof Error ? error.message : `Auth sync failed (attempt ${attempt})`;

  reportError(
    'auth_sync',
    attempt >= 2 ? 'error' : 'warning',
    `Auth sync failure (attempt ${attempt}): ${statusCode || 'N/A'} — ${message}`,
    error instanceof Error ? error.constructor.name : 'AuthSyncError',
    { route: '/api/auth/sync' },
  );
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
  const message = error instanceof Error ? error.message : 'API route error';

  reportError(
    'api_route',
    statusCode >= 500 ? 'error' : 'warning',
    `API ${method} ${route} → ${statusCode}: ${message}`,
    error instanceof Error ? error.constructor.name : 'ApiError',
    { route },
  );
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
  const message = error instanceof Error ? error.message : 'Network request failed';

  // Strip any tokens/PII from URL
  const cleanUrl = url
    .replace(/Bearer\s+[\w.-]+/gi, '')
    .replace(/token=[^&]+/gi, 'token=[REDACTED]');

  reportError(
    'network_failure',
    'warning',
    `Network ${method} ${cleanUrl}: ${message}`,
    error instanceof Error ? error.constructor.name : 'NetworkError',
  );
}
