// ═══════════════════════════════════════════
// OBSERVABILITY LOGGER — VitaZen
// Core lightweight, structured logging
// ═══════════════════════════════════════════
//
// This logger is the foundation of the observability system.
// It buffers reports and batches them to minimize network usage.
//
// Key features:
//   - Buffer + batch sending (not one request per error)
//   - Client-side dedup (same error within 1 min is dropped)
//   - Rate-limited (max 10 reports per minute)
//   - Flushes on page visibility change (mobile tab switch)
//   - Uses requestIdleCallback for non-critical sends
//   - Privacy-safe: strips PII, hashes messages

import {
  ErrorReport,
  PerformanceReport,
  OBSERVABILITY_CONFIG,
  ErrorCategory,
  Severity,
} from './types';

// ─── Message Hashing ────────────────────────
//
// Hash the error message so we can dedup without
// sending raw error text (which might contain PII).

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ─── Session ID ─────────────────────────────
//
// Random session ID per page load. No PII.
// Helps server group reports from the same session.

let sessionId: string | null = null;

function generateSessionId(): string {
  if (sessionId) return sessionId;
  // Random 8-char string — no user info
  sessionId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36).slice(-4);
  return sessionId;
}

// ─── Device Class Detection ─────────────────
//
// Rough device classification for filtering reports.
// No fingerprinting — just hardware concurrency + memory.

function getDeviceClass(): 'low' | 'mid' | 'high' {
  if (typeof navigator === 'undefined') return 'mid';

  const cores = navigator.hardwareConcurrency || 2;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;

  if (cores <= 2 || memory <= 2) return 'low';
  if (cores <= 4 || memory <= 4) return 'mid';
  return 'high';
}

function getConnectionType(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  return conn?.effectiveType || 'unknown';
}

// ─── Dedup Tracking ─────────────────────────

const recentReports = new Map<string, number>();

function isDuplicate(dedupKey: string): boolean {
  const now = Date.now();
  const lastSeen = recentReports.get(dedupKey);

  if (lastSeen && (now - lastSeen) < OBSERVABILITY_CONFIG.DEDUP_WINDOW_MS) {
    return true; // Same error within dedup window
  }

  recentReports.set(dedupKey, now);

  // Prune old entries periodically
  if (recentReports.size > OBSERVABILITY_CONFIG.MAX_STORED_REPORTS) {
    const cutoff = now - OBSERVABILITY_CONFIG.DEDUP_WINDOW_MS;
    for (const [key, ts] of recentReports.entries()) {
      if (ts < cutoff) recentReports.delete(key);
    }
  }

  return false;
}

// ─── Rate Limiting ──────────────────────────

const reportTimestamps: number[] = [];

function isRateLimited(): boolean {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  // Remove timestamps older than 1 minute
  while (reportTimestamps.length > 0 && reportTimestamps[0] < oneMinuteAgo) {
    reportTimestamps.shift();
  }

  if (reportTimestamps.length >= OBSERVABILITY_CONFIG.MAX_REPORTS_PER_MINUTE) {
    return true; // Rate limited
  }

  reportTimestamps.push(now);
  return false;
}

// ─── Buffer ─────────────────────────────────

const errorBuffer: ErrorReport[] = [];
const performanceBuffer: PerformanceReport[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush().catch(() => {
      // Silent — observability never breaks UX
    });
  }, OBSERVABILITY_CONFIG.FLUSH_INTERVAL_MS);
}

function scheduleIdleFlush(): void {
  if (typeof window === 'undefined' || !('requestIdleCallback' in window)) {
    scheduleFlush();
    return;
  }

  (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
    () => {
      flush().catch(() => {});
    },
    { timeout: OBSERVABILITY_CONFIG.FLUSH_INTERVAL_MS },
  );
}

// ─── Flush (Send to Server) ─────────────────

export async function flush(): Promise<void> {
  if (errorBuffer.length === 0 && performanceBuffer.length === 0) return;

  // Take everything from the buffers
  const errors = errorBuffer.splice(0);
  const performance = performanceBuffer.splice(0);

  const payload = {
    errors,
    performance,
    sessionId: generateSessionId(),
    deviceClass: getDeviceClass(),
    connectionType: getConnectionType(),
  };

  try {
    // Use sendBeacon if available (most reliable on mobile, survives page unload)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/observability/report', blob);
      if (sent) return;
    }

    // Fallback to fetch with keepalive
    await fetch('/api/observability/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: 'same-origin',
    });
  } catch {
    // Silent — observability never breaks UX
  }
}

// ─── Public API ─────────────────────────────

/**
 * Report an error to the observability system.
 * Deduplicated and rate-limited client-side.
 * Buffered and sent in batches.
 */
export function reportError(
  category: ErrorCategory,
  severity: Severity,
  message: string,
  errorType: string,
  extra?: { route?: string; widgetType?: string },
): void {
  if (!OBSERVABILITY_CONFIG.ENABLED) return;

  const dedupKey = `${category}:${simpleHash(message)}:${extra?.route || ''}`;

  // Dedup check
  if (isDuplicate(dedupKey)) return;

  // Rate limit check
  if (isRateLimited()) return;

  const report: ErrorReport = {
    category,
    severity,
    messageHash: simpleHash(message),
    errorType,
    route: extra?.route || (typeof window !== 'undefined' ? window.location.pathname : undefined),
    widgetType: extra?.widgetType,
    ts: Date.now(),
    dedupKey,
  };

  errorBuffer.push(report);

  // Flush immediately for critical errors
  if (severity === 'critical') {
    flush().catch(() => {});
    return;
  }

  // Flush if buffer is full
  if (errorBuffer.length >= OBSERVABILITY_CONFIG.MAX_BUFFER_SIZE) {
    scheduleIdleFlush();
    return;
  }

  // Otherwise, schedule a flush
  scheduleFlush();
}

/**
 * Report a performance observation.
 * Less critical than errors — always deferred.
 */
export function reportPerformance(
  type: PerformanceReport['type'],
  extra?: {
    durationMs?: number;
    route?: string;
    component?: string;
    memory?: PerformanceReport['memory'];
  },
): void {
  if (!OBSERVABILITY_CONFIG.ENABLED) return;

  const report: PerformanceReport = {
    type,
    durationMs: extra?.durationMs,
    route: extra?.route || (typeof window !== 'undefined' ? window.location.pathname : undefined),
    component: extra?.component,
    ts: Date.now(),
    memory: extra?.memory,
  };

  performanceBuffer.push(report);

  if (performanceBuffer.length >= OBSERVABILITY_CONFIG.MAX_BUFFER_SIZE) {
    scheduleIdleFlush();
  } else {
    scheduleFlush();
  }
}

/**
 * Get the current session ID.
 */
export function getSessionId(): string {
  return generateSessionId();
}

/**
 * Install visibility change listener to flush on tab switch.
 * Critical for mobile: when a tab goes to background,
 * we want to send any buffered reports before the browser
 * might kill the tab.
 */
export function installVisibilityHandler(): () => void {
  if (typeof document === 'undefined') return () => {};

  const handler = () => {
    if (document.visibilityState === 'hidden') {
      flush().catch(() => {});
    }
  };

  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/**
 * Get current buffer sizes (for debugging only).
 */
export function getBufferStatus(): { errors: number; performance: number } {
  return {
    errors: errorBuffer.length,
    performance: performanceBuffer.length,
  };
}
