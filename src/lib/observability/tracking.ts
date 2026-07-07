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
//
// GLOBAL-2 FIX: All functions in this module are called exclusively from
// server-side code (snapshot.ts, API routes, triggers.ts). They now use
// serverLog (server-logger) instead of reportError (client logger) which
// was a silent no-op on the server.

import { serverLog } from './server-logger';

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

  serverLog.error('widget_refresh', `Snapshot failed: ${widgetType} — ${message}`, error, { widgetType, route: '/api/widgets/[type]' });
}

/**
 * Track a widget refresh rate limit hit.
 * Useful for understanding if users are hitting refresh too often.
 */
export function trackWidgetRefreshRateLimit(
  widgetType: string,
  reason: string,
): void {
  serverLog.info('widget_refresh', `Refresh rate limited: ${widgetType} — ${reason}`, { widgetType });
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

  serverLog.warn('widget_refresh', `Cache ${operation} failed: ${widgetType} — ${message}`, { widgetType, error: error instanceof Error ? error.message : String(error) });
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

  if (statusCode >= 500) {
    serverLog.error('widget_refresh', `Widget API error: ${widgetType} — ${statusCode} — ${message}`, error, { widgetType, route: '/api/widgets/[type]' });
  } else {
    serverLog.warn('widget_refresh', `Widget API error: ${widgetType} — ${statusCode} — ${message}`, { widgetType, route: '/api/widgets/[type]', error: error instanceof Error ? error.message : undefined });
  }
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

  serverLog.warn('widget_refresh', `Trigger failed: ${trigger} — ${message}`, { trigger, error: error instanceof Error ? error.message : String(error) });
}
