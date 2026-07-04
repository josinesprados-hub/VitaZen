// ═══════════════════════════════════════════
// HYDRATION MISMATCH DETECTION — VitaZen
// Detect SSR/client rendering inconsistencies
// ═══════════════════════════════════════════
//
// Hydration mismatches happen when server-rendered HTML
// doesn't match the client's initial render. React 19
// logs warnings but doesn't throw — these silent mismatches
// can cause subtle UI bugs.
//
// This module:
//   1. Listens for React hydration warnings in console
//   2. Checks for common mismatch patterns
//   3. Reports them without breaking the app
//
// Privacy: only reports that a mismatch occurred,
// not the DOM content that mismatched.

import { reportError } from './logger';

// ─── Console Error Interception ─────────────
//
// React logs hydration warnings as console.error.
// We intercept these to detect and report them.
// We only capture the pattern, not the content.

let originalConsoleError: typeof console.error | null = null;
let hydrationDetected = false;

const HYDRATION_PATTERNS = [
  'Hydration failed',
  'There was an error while hydrating',
  'Text content did not match',
  'server-rendered HTML',
  'did not match between server and client',
  'The server could not finish this response',
];

function isHydrationError(args: unknown[]): boolean {
  for (const arg of args) {
    if (typeof arg === 'string') {
      for (const pattern of HYDRATION_PATTERNS) {
        if (arg.includes(pattern)) return true;
      }
    }
  }
  return false;
}

// ─── Common Mismatch Sources ────────────────
//
// These are the most common sources of hydration mismatches.
// We check for them to provide more specific error categories.

function guessMismatchSource(): string {
  if (typeof window === 'undefined') return 'unknown';

  // Check for date/time-based mismatches (most common)
  const now = new Date();
  const hasTimeDependency = document.querySelector(
    'time[datetime], [data-time], [data-date]',
  );
  if (hasTimeDependency) return 'time_dependency';

  // Check for localStorage-dependent rendering
  try {
    if (localStorage.length > 0) return 'localStorage_dependency';
  } catch {
    // localStorage not accessible
  }

  // Check for window-dependent calculations (e.g., innerWidth)
  return 'client_only_value';
}

// ─── Install / Uninstall ────────────────────

/**
 * Install hydration mismatch detection.
 * Call once on app initialization (client-side only).
 */
export function installHydrationDetection(): () => void {
  if (typeof window === 'undefined' || originalConsoleError !== null) return () => {};

  originalConsoleError = console.error;

  console.error = function (...args: unknown[]) {
    // Check if this is a hydration warning
    if (isHydrationError(args)) {
      if (!hydrationDetected) {
        hydrationDetected = true;
        const source = guessMismatchSource();

        reportError(
          'hydration_mismatch',
          'warning',
          `Hydration mismatch detected: ${source}`,
          'HydrationError',
          { route: window.location.pathname },
        );
      }
    }

    // Call original console.error
    return originalConsoleError!.apply(console, args);
  };

  // Reset detection on navigation
  const resetOnNav = () => {
    hydrationDetected = false;
  };

  // Use Next.js router events if available, otherwise popstate
  window.addEventListener('popstate', resetOnNav);

  return () => {
    if (originalConsoleError) {
      console.error = originalConsoleError;
      originalConsoleError = null;
    }
    window.removeEventListener('popstate', resetOnNav);
    hydrationDetected = false;
  };
}

/**
 * Manually report a hydration mismatch.
 * Useful when you detect one outside of console interception.
 */
export function reportHydrationMismatch(component: string): void {
  reportError(
    'hydration_mismatch',
    'warning',
    `Manual hydration report: ${component}`,
    'HydrationError',
  );
}
