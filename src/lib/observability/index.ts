// ═══════════════════════════════════════════
// OBSERVABILITY INDEX — VitaZen
// Public API for the observability system
// ═══════════════════════════════════════════
//
// Usage:
//   import { initObservability, reportError, reportPerformance } from '@/lib/observability';
//
//   // In root layout or app init:
//   initObservability();
//
//   // In error boundaries:
//   reportError('error_boundary', 'error', message, errorType);
//
//   // In API routes:
//   trackApiRouteError(route, method, statusCode, error);

// Core types and config
export * from './types';

// Logger (main API)
export { reportError, reportPerformance, flush, getSessionId, installVisibilityHandler } from './logger';

// Global error handlers
export { installGlobalErrorHandlers, uninstallGlobalErrorHandlers } from './errors';

// Performance instrumentation
export {
  installPerformanceObservers,
  startRenderMeasure,
  measurePageLoad,
} from './performance';

// Hydration detection
export { installHydrationDetection, reportHydrationMismatch } from './hydration';

// Error boundaries
export {
  ObservantErrorBoundary,
  WidgetErrorBoundary,
  NotificationErrorBoundary,
} from './boundaries';

// Widget error tracking
export {
  trackWidgetSnapshotFailure,
  trackWidgetRefreshRateLimit,
  trackWidgetCacheFailure,
  trackWidgetApiError,
  trackWidgetTriggerFailure,
} from './tracking';

// Notification error tracking
export {
  trackPushTokenRegistrationFailure,
  trackPushNotSupported,
  trackPushPermissionDenied,
  trackPushVapidKeyMissing,
  trackFCMSendFailure,
  trackFCMInvalidTokens,
  trackNoActiveTokens,
  trackSWRegistrationFailure,
  trackSWBackgroundMessageError,
  trackNotificationGateFailure,
  trackNotificationDedupFailure,
} from './notification-tracking';

// Background task monitoring
export {
  trackCronFailure,
  trackCronSlowRun,
  trackBatchProcessingFailure,
  trackAuthSyncFailure,
  trackApiRouteError,
  trackNetworkFailure,
} from './server-tracking';

// ─── One-time Initialization ────────────────

let initialized = false;

/**
 * Initialize the full observability system.
 * Call once in the root layout (client-side only).
 *
 * Installs:
 *   - Global error handlers (onerror, onunhandledrejection)
 *   - Performance observers (long tasks, paint, memory)
 *   - Hydration mismatch detection
 *   - Visibility change handler (flush on tab switch)
 */
export function initObservability(): () => void {
  if (typeof window === 'undefined' || initialized) return () => {};
  initialized = true;

  const cleanups: (() => void)[] = [];

  // Install global error handlers
  installGlobalErrorHandlers();
  // Note: we don't push cleanup here because we never uninstall
  // global error handlers during normal operation

  // Install performance observers
  const perfCleanup = installPerformanceObservers();
  cleanups.push(perfCleanup);

  // Install hydration detection
  const hydrationCleanup = installHydrationDetection();
  cleanups.push(hydrationCleanup);

  // Install visibility handler (flush on tab switch)
  const visibilityCleanup = installVisibilityHandler();
  cleanups.push(visibilityCleanup);

  // Return cleanup for testing/unmount
  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    initialized = false;
  };
}
