// ═══════════════════════════════════════════
// WIDGET ERROR TRACKING — VitaZen
// Track widget refresh, snapshot, and render failures
// ═══════════════════════════════════════════
//
// Widgets are a critical UX surface. If they fail silently,
// users see stale data or empty states without knowing why.
//
// This module tracks:
//   - Snapshot computation failures
//   - Cache read/write failures
//   - Refresh rate limit hits
//   - Widget API route errors
//   - Widget rendering failures
//
// All tracking is fire-and-forget and never blocks widget operation.

import { reportError } from './logger';

// ─── Widget Error Tracking ──────────────────

/**
 * Track a widget snapshot computation failure.
 * Called when computeSnapshot() throws.
 */
export function trackWidgetSnapshotFailure(
  widgetType: string,
  error: unknown,
  userId?: string,
): void {
  const message = error instanceof Error ? error.message : 'Snapshot computation failed';
  const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

  reportError(
    'widget_refresh',
    'error',
    `Snapshot failed: ${widgetType} — ${message}`,
    errorType,
    { widgetType, route: '/api/widgets/[type]' },
  );
}

/**
 * Track a widget refresh rate limit hit.
 * Useful for understanding if users are hitting refresh too often.
 */
export function trackWidgetRefreshRateLimit(
  widgetType: string,
  reason: string,
): void {
  reportError(
    'widget_refresh',
    'info', // Not an error — just informational
    `Refresh rate limited: ${widgetType} — ${reason}`,
    'RateLimitHit',
    { widgetType },
  );
}

/**
 * Track a widget cache operation failure.
 * These are non-critical but help identify memory pressure.
 */
export function trackWidgetCacheFailure(
  operation: 'read' | 'write' | 'invalidate',
  widgetType: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'Cache operation failed';

  reportError(
    'widget_refresh',
    'warning',
    `Cache ${operation} failed: ${widgetType} — ${message}`,
    'CacheError',
    { widgetType },
  );
}

/**
 * Track a widget API route error.
 * Called when the widget GET/refresh endpoint returns an error.
 */
export function trackWidgetApiError(
  widgetType: string,
  statusCode: number,
  error?: unknown,
): void {
  const message = error instanceof Error ? error.message : `API error ${statusCode}`;

  reportError(
    'widget_refresh',
    statusCode >= 500 ? 'error' : 'warning',
    `Widget API error: ${widgetType} — ${statusCode} — ${message}`,
    'WidgetApiError',
    { widgetType, route: '/api/widgets/[type]' },
  );
}

/**
 * Track a widget trigger hook failure.
 * When onCheckinChange/onHabitChange/etc fails.
 */
export function trackWidgetTriggerFailure(
  trigger: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : 'Trigger failed';

  reportError(
    'widget_refresh',
    'warning',
    `Trigger failed: ${trigger} — ${message}`,
    'TriggerError',
  );
}
