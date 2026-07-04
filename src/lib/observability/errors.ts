// ═══════════════════════════════════════════
// GLOBAL ERROR HANDLERS — VitaZen
// Catch silent crashes before they disappear
// ═══════════════════════════════════════════
//
// Installs global handlers for:
//   - window.onerror (unhandled errors)
//   - window.onunhandledrejection (unhandled promise rejections)
//
// These are the PRIMARY way to catch silent crashes
// that don't hit error boundaries — e.g., errors in:
//   - setTimeout callbacks
//   - Event listeners
//   - Async functions without try/catch
//   - Third-party library code
//
// Privacy: we strip PII from messages before hashing.
// Only the category, error type, and message hash are sent.

import { reportError } from './logger';

// ─── PII Stripping ──────────────────────────
//
// Remove common PII patterns from error messages
// before we hash them for dedup.

const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.\w+/g;
const URL_REGEX = /https?:\/\/[^\s)]+/g;
const TOKEN_REGEX = /Bearer\s+[\w-]+\.[\w-]+\.[\w-]+/gi;
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PATH_WITH_ID_REGEX = /\/[\w-]+\/[\w]{20,}/g;

function stripPII(message: string): string {
  return message
    .replace(EMAIL_REGEX, '[EMAIL]')
    .replace(URL_REGEX, '[URL]')
    .replace(TOKEN_REGEX, 'Bearer [TOKEN]')
    .replace(UUID_REGEX, '[UUID]')
    .replace(PATH_WITH_ID_REGEX, '[PATH]/[ID]');
}

// ─── Error Message Extraction ───────────────

function extractErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.constructor.name || 'Error';
  }
  if (typeof error === 'object' && error !== null) {
    const name = (error as { name?: string }).name;
    if (typeof name === 'string') return name;
  }
  return typeof error === 'string' ? 'String' : 'Unknown';
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: string }).message;
    if (typeof message === 'string') return message;
  }
  return 'Unknown error';
}

// ─── Installed State ────────────────────────

let installed = false;
let originalOnError: ((...args: unknown[]) => unknown) | undefined;
let originalOnRejection: ((...args: unknown[]) => unknown) | undefined;

// ─── Install / Uninstall ────────────────────

/**
 * Install global error handlers.
 * Call once on app initialization (client-side only).
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;

  // ── window.onerror ──
  originalOnError = window.onerror as ((...args: unknown[]) => unknown) | undefined;
  window.onerror = function (
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error,
  ) {
    const msg = typeof message === 'string' ? message : String(message);
    const cleaned = stripPII(msg);
    const errorType = error?.constructor?.name || extractErrorType(error) || 'UnknownError';

    reportError(
      'unhandled_error',
      'error',
      cleaned,
      errorType,
      { route: window.location.pathname },
    );

    // Call original handler if any
    if (typeof originalOnError === 'function') {
      return originalOnError(message, source, lineno, colno, error) as boolean;
    }
    return false;
  };

  // ── window.onunhandledrejection ──
  originalOnRejection = window.onunhandledrejection as ((...args: unknown[]) => unknown) | undefined;
  window.onunhandledrejection = function (event: PromiseRejectionEvent) {
    const reason = event.reason;
    const msg = extractMessage(reason);
    const cleaned = stripPII(msg);
    const errorType = extractErrorType(reason);

    reportError(
      'unhandled_rejection',
      'error',
      cleaned,
      errorType,
      { route: window.location.pathname },
    );

    // Call original handler if any
    if (typeof originalOnRejection === 'function') {
      return originalOnRejection(event) as boolean;
    }
    return false;
  };
}

/**
 * Uninstall global error handlers.
 * Useful for testing or cleanup.
 */
export function uninstallGlobalErrorHandlers(): void {
  if (!installed || typeof window === 'undefined') return;

  if (originalOnError !== undefined) {
    window.onerror = originalOnError as WindowOnError;
  }
  if (originalOnRejection !== undefined) {
    window.onunhandledrejection = originalOnRejection as WindowOnRejection;
  }

  installed = false;
}

// Type helpers
type WindowOnError = Window['onerror'];
type WindowOnRejection = Window['onunhandledrejection'];
