// ═══════════════════════════════════════════
// OBSERVABILITY TYPES — VitaZen
// Lightweight, privacy-safe, battery-safe
// crash monitoring & performance instrumentation
// ═══════════════════════════════════════════
//
// Design principles:
//   - No PII ever (strip emails, names, tokens)
//   - No stack traces sent to server (only category + message hash)
//   - No replay recordings, no screenshots
//   - Batch + buffer sending (not one request per error)
//   - Rate-limited client-side (max N reports per minute)
//   - Battery-safe: uses requestIdleCallback for non-critical work
//   - Invisible to the user
//
// What we monitor:
//   - Unhandled errors (window.onerror)
//   - Unhandled promise rejections
//   - React error boundary catches
//   - Hydration mismatches
//   - Widget refresh/snapshot failures
//   - Push notification send failures
//   - Long rendering tasks
//   - Memory pressure signals
//   - API route failures (server-side)
//
// What we do NOT monitor:
//   - User behavior tracking (that's analytics)
//   - Click tracking
//   - Page view tracking
//   - Session recording
//   - Fingerprinting

// ─── Severity Levels ────────────────────────

export type Severity = 'critical' | 'error' | 'warning' | 'info';

// ─── Error Categories ───────────────────────
//
// Each error is categorized so we can answer:
//   - "What kind of errors happen most?"
//   - "Which screens fail most?"
//   - "Which flows break?"
//   - "Which devices suffer most?"

export type ErrorCategory =
  | 'unhandled_error'         // window.onerror
  | 'unhandled_rejection'     // unhandledrejection
  | 'error_boundary'          // React error boundary catch
  | 'hydration_mismatch'      // SSR/client mismatch
  | 'widget_refresh'          // Widget snapshot/refresh failure
  | 'widget_render'           // Widget rendering failure
  | 'push_notification'       // FCM send/registration failure
  | 'api_route'               // Server-side API route error
  | 'auth_sync'               // Auth state sync failure
  | 'render_stall'            // Long render task detected
  | 'memory_pressure'         // Memory usage warning
  | 'network_failure'         // Fetch/network error
  | 'service_worker'          // Service worker error
  | 'background_task';        // Background task (cron, etc.) failure

// ─── Report Payload ─────────────────────────
//
// This is what gets sent to the server.
// Intentionally minimal — no stack traces, no PII.

export interface ErrorReport {
  /** Error category for grouping */
  category: ErrorCategory;
  /** Severity level */
  severity: Severity;
  /** Hash of the error message (for dedup without sending raw text) */
  messageHash: string;
  /** Short error type/name (e.g., "TypeError", "NetworkError") */
  errorType: string;
  /** Route where the error occurred (e.g., "/dashboard") */
  route?: string;
  /** Widget type if applicable */
  widgetType?: string;
  /** Timestamp */
  ts: number;
  /** Client-side dedup key */
  dedupKey: string;
}

// ─── Performance Report ─────────────────────

export interface PerformanceReport {
  /** Type of measurement */
  type: 'long_task' | 'render_stall' | 'hydration_delay' | 'memory_warning';
  /** Duration in ms (for timing-related) */
  durationMs?: number;
  /** Route where observed */
  route?: string;
  /** Component name if known */
  component?: string;
  /** Timestamp */
  ts: number;
  /** Memory info if available */
  memory?: {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
}

// ─── Batch Report ───────────────────────────
//
// Client sends a batch of reports at once.
// This reduces network requests and battery usage.

export interface BatchReportPayload {
  errors: ErrorReport[];
  performance: PerformanceReport[];
  /** Client session ID (random, no PII) */
  sessionId: string;
  /** Approx device class (for filtering) */
  deviceClass?: 'low' | 'mid' | 'high';
  /** Connection type if available */
  connectionType?: string;
}

// ─── Server Response ────────────────────────

export interface ReportResponse {
  received: boolean;
  /** Server-side rate limit signal */
  throttled?: boolean;
}

// ─── Configuration ──────────────────────────

export const OBSERVABILITY_CONFIG = {
  /** Max errors to buffer before flushing */
  MAX_BUFFER_SIZE: 20,
  /** Max time (ms) before flushing buffer */
  FLUSH_INTERVAL_MS: 30_000, // 30 seconds
  /** Max reports per minute (client-side rate limit) */
  MAX_REPORTS_PER_MINUTE: 10,
  /** Dedup window: same error within this time is dropped */
  DEDUP_WINDOW_MS: 60_000, // 1 minute
  /** Max reports stored in memory */
  MAX_STORED_REPORTS: 100,
  /** Long task threshold (ms) — tasks above this are reported */
  LONG_TASK_THRESHOLD_MS: 100,
  /** Render stall threshold (ms) */
  RENDER_STALL_THRESHOLD_MS: 200,
  /** Memory warning threshold (fraction of heap limit) */
  MEMORY_WARNING_THRESHOLD: 0.85,
  /** Whether observability is enabled */
  ENABLED: true,
} as const;

// ─── Utility Types ──────────────────────────

export interface GlobalErrorHandlers {
  install(): void;
  uninstall(): void;
}

export interface ObservabilityClient {
  reportError(report: Omit<ErrorReport, 'ts' | 'dedupKey'>): void;
  reportPerformance(report: Omit<PerformanceReport, 'ts'>): void;
  flush(): Promise<void>;
  getSessionId(): string;
}
