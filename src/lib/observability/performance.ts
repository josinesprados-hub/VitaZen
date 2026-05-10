// ═══════════════════════════════════════════
// MOBILE PERFORMANCE INSTRUMENTATION — VitaZen
// Lightweight render timing & long task detection
// ═══════════════════════════════════════════
//
// Monitors:
//   - Long tasks (>100ms that block the main thread)
//   - Render stalls (>200ms to first paint after navigation)
//   - Memory pressure (heap usage >85% of limit)
//
// Battery-safe design:
//   - Uses PerformanceObserver (no manual timing)
//   - Only observes, never triggers re-renders
//   - Reports are buffered and batched
//   - Uses requestIdleCallback for processing
//
// Privacy-safe:
//   - Only reports timing numbers and categories
//   - No DOM content, no user data

import { reportPerformance } from './logger';
import { OBSERVABILITY_CONFIG } from './types';

// ─── Long Task Observer ─────────────────────

let longTaskObserver: PerformanceObserver | null = null;

/**
 * Start observing long tasks (tasks that block the main thread >50ms).
 * These cause jank and unresponsive UI on mobile.
 *
 * We only report tasks above our threshold (100ms by default)
 * to avoid noise from minor frame drops.
 */
export function startLongTaskObserver(): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= OBSERVABILITY_CONFIG.LONG_TASK_THRESHOLD_MS) {
          reportPerformance('long_task', {
            durationMs: Math.round(entry.duration),
            route: window.location.pathname,
          });
        }
      }
    });

    longTaskObserver.observe({ type: 'longtask', buffered: false });
  } catch {
    // PerformanceObserver with 'longtask' not supported in all browsers
    // Silent failure — observability never breaks UX
  }

  return () => {
    longTaskObserver?.disconnect();
    longTaskObserver = null;
  };
}

// ─── Render Timing ──────────────────────────

let paintObserver: PerformanceObserver | null = null;

/**
 * Observe paint timing metrics (FCP, LCP).
 * Helps detect slow initial renders on mobile devices.
 */
export function startPaintObserver(): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  try {
    paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Report slow paints (over render stall threshold)
        if (entry.entryType === 'largest-contentful-paint') {
          const lcp = entry.startTime;
          if (lcp >= OBSERVABILITY_CONFIG.RENDER_STALL_THRESHOLD_MS) {
            reportPerformance('render_stall', {
              durationMs: Math.round(lcp),
              route: window.location.pathname,
            });
          }
        }
      }
    });

    paintObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    // LCP not supported — silent failure
  }

  return () => {
    paintObserver?.disconnect();
    paintObserver = null;
  };
}

// ─── Memory Monitoring ──────────────────────
//
// Check memory pressure periodically.
// Only runs on Chrome (where performance.memory is available).

let memoryCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic memory pressure checks.
 * Reports when JS heap usage exceeds the threshold.
 *
 * Only available in Chromium-based browsers.
 * No-op on Firefox/Safari (they don't expose memory stats).
 */
export function startMemoryMonitor(): () => void {
  if (typeof window === 'undefined' || typeof performance === 'undefined') {
    return () => {};
  }

  const perfWithMemory = performance as unknown as {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  if (!perfWithMemory.memory) return () => {}; // Not available

  // Check every 30 seconds
  memoryCheckInterval = setInterval(() => {
    try {
      const mem = perfWithMemory.memory;
      if (!mem) return;

      const usageRatio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;

      if (usageRatio >= OBSERVABILITY_CONFIG.MEMORY_WARNING_THRESHOLD) {
        reportPerformance('memory_warning', {
          route: window.location.pathname,
          memory: {
            usedJSHeapSize: mem.usedJSHeapSize,
            totalJSHeapSize: mem.totalJSHeapSize,
            jsHeapSizeLimit: mem.jsHeapSizeLimit,
          },
        });
      }
    } catch {
      // Silent — never break UX
    }
  }, 30_000);

  return () => {
    if (memoryCheckInterval) {
      clearInterval(memoryCheckInterval);
      memoryCheckInterval = null;
    }
  };
}

// ─── Navigation Timing ──────────────────────

/**
 * Measure and report slow page loads.
 * Uses Navigation Timing API (widely supported).
 */
export function measurePageLoad(): void {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return;

  try {
    // Wait for load event to complete
    const measure = () => {
      const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      if (!navEntry) return;

      const domContentLoaded = navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart;
      const loadComplete = navEntry.loadEventEnd - navEntry.loadEventStart;

      // Report slow DOM content loaded
      if (domContentLoaded >= OBSERVABILITY_CONFIG.RENDER_STALL_THRESHOLD_MS) {
        reportPerformance('render_stall', {
          durationMs: Math.round(domContentLoaded),
          route: window.location.pathname,
          component: 'dom_content_loaded',
        });
      }

      // Report slow full page load
      if (loadComplete >= OBSERVABILITY_CONFIG.RENDER_STALL_THRESHOLD_MS * 2) {
        reportPerformance('render_stall', {
          durationMs: Math.round(loadComplete),
          route: window.location.pathname,
          component: 'full_page_load',
        });
      }
    };

    if (document.readyState === 'complete') {
      measure();
    } else {
      window.addEventListener('load', () => {
        // Small delay to ensure timing data is available
        setTimeout(measure, 100);
      });
    }
  } catch {
    // Silent — never break UX
  }
}

// ─── Component Render Timing ────────────────
//
// Lightweight hook for measuring component render time.
// Uses performance.mark/measure which have near-zero overhead.

/**
 * Mark the start of a component render measurement.
 * Returns a function to mark the end and report if slow.
 */
export function startRenderMeasure(componentName: string): () => void {
  if (typeof performance === 'undefined') {
    return () => {};
  }

  const startMark = `vz-render-start-${componentName}`;
  const endMark = `vz-render-end-${componentName}`;
  const measureName = `vz-render-${componentName}`;

  try {
    performance.mark(startMark);
  } catch {
    // Silent
  }

  return () => {
    try {
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);

      const entries = performance.getEntriesByName(measureName);
      const lastEntry = entries[entries.length - 1];

      if (lastEntry && lastEntry.duration >= OBSERVABILITY_CONFIG.RENDER_STALL_THRESHOLD_MS) {
        reportPerformance('render_stall', {
          durationMs: Math.round(lastEntry.duration),
          route: typeof window !== 'undefined' ? window.location.pathname : undefined,
          component: componentName,
        });
      }

      // Clean up marks to avoid memory leaks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
    } catch {
      // Silent — never break UX
    }
  };
}

// ─── Install All Observers ──────────────────

const cleanupFns: (() => void)[] = [];

/**
 * Start all performance observers.
 * Call once on app initialization (client-side only).
 */
export function installPerformanceObservers(): () => void {
  cleanupFns.push(startLongTaskObserver());
  cleanupFns.push(startPaintObserver());
  cleanupFns.push(startMemoryMonitor());
  measurePageLoad();

  // Return a cleanup function for unmount
  return () => {
    for (const cleanup of cleanupFns) {
      cleanup();
    }
    cleanupFns.length = 0;
  };
}
