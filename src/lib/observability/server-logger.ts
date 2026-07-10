// ═══════════════════════════════════════════
// SERVER-SIDE STRUCTURED LOGGER — VitaZen
// Lightweight structured logging for API routes,
// cron jobs, webhooks, and background tasks
// ═══════════════════════════════════════════
//
// WHY THIS EXISTS:
//   The client-side logger (./logger.ts) uses browser APIs
//   (navigator.sendBeacon, window.location, etc.) and sends
//   reports to /api/observability/report. That's perfect for
//   the client — but server-side code was importing those
//   same functions, which silently did nothing because:
//     - navigator.sendBeacon doesn't exist in Node
//     - Relative URL fetch doesn't work server-side
//     - The in-memory buffer was never flushed
//
//   This module provides proper server-side structured logging
//   that writes to console with a consistent JSON format that
//   Vercel's log aggregator can search and filter.
//
// PRIVACY:
//   - No PII in logs (strip emails, tokens, UUIDs)
//   - No user content (only error types + message hashes)
//   - No external services — logs stay in Vercel infrastructure
//
// FORMAT:
//   All logs use the `vz_obs` marker for easy filtering:
//   ```
//   {"vz_obs":true,"level":"error","module":"api/insights","msg":"...","ts":"..."}
//   ```
//
//   Filter in Vercel: `vz_obs:true`
//   Filter errors: `vz_obs:true level:error`
//   Filter slow endpoints: `vz_obs:true slow:true`

// ─── PII Stripping (shared with client-side errors.ts) ────

const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.\w+/g;
const URL_REGEX = /https?:\/\/[^\s)]+/g;
const TOKEN_REGEX = /Bearer\s+[\w-]+\.[\w-]+\.[\w-]+/gi;
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function stripPII(message: string): string {
  return message
    .replace(EMAIL_REGEX, '[EMAIL]')
    .replace(URL_REGEX, '[URL]')
    .replace(TOKEN_REGEX, 'Bearer [TOKEN]')
    .replace(UUID_REGEX, '[UUID]');
}

// ─── Simple Hash (same as client-side logger.ts) ──────────

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Log Levels ──────────────────────────────

type LogLevel = 'error' | 'warn' | 'info';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

// Minimum log level — can be overridden with env var
const MIN_LEVEL: LogLevel = (process.env.VZ_LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[MIN_LEVEL];
}

// ─── Core Structured Log ─────────────────────

function writeLog(level: LogLevel, module: string, msg: string, extra?: Record<string, unknown>): void {
  const entry: Record<string, unknown> = {
    vz_obs: true,
    level,
    module,
    msg,
    ts: new Date().toISOString(),
    ...extra,
  };

  const json = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(json);
      break;
    case 'warn':
      console.warn(json);
      break;
    case 'info':
      console.info(json);
      break;
  }
}

// ─── Public API ──────────────────────────────

/**
 * Log an error with structured context.
 * Use in catch blocks in API routes, webhooks, cron jobs.
 *
 * @example
 *   serverLog.error('api/insights', 'Failed to generate insights', error, { userId: user.id });
 */
export function serverLogError(
  module: string,
  message: string,
  error?: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!shouldLog('error')) return;

  const cleanedMsg = stripPII(message);
  const errorType = error instanceof Error
    ? error.constructor.name
    : typeof error === 'string' ? 'String' : 'Unknown';

  writeLog('error', module, cleanedMsg, {
    msgHash: simpleHash(cleanedMsg),
    errorType,
    ...extra,
  });
}

/**
 * Log a warning with structured context.
 * Use for degraded states that aren't fatal.
 *
 * @example
 *   serverLog.warn('webhook', 'Could not resolve userId from metadata', { eventType: event.type });
 */
export function serverLogWarn(
  module: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!shouldLog('warn')) return;

  const cleanedMsg = stripPII(message);
  writeLog('warn', module, cleanedMsg, {
    msgHash: simpleHash(cleanedMsg),
    ...extra,
  });
}

/**
 * Log informational messages with structured context.
 * Use for operational events (cron started, webhook processed, etc.).
 *
 * @example
 *   serverLog.info('cron/weekly-recap', 'Cron completed', { sent: 42, failed: 0, durationMs: 3200 });
 */
export function serverLogInfo(
  module: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!shouldLog('info')) return;

  writeLog('info', module, stripPII(message), extra);
}

/**
 * Log a slow operation (endpoint, query, task).
 * Automatically includes duration and a `slow:true` marker.
 *
 * @example
 *   serverLog.slow('api/insights', 'Slow endpoint', 4200, { threshold: 2000 });
 */
export function serverLogSlow(
  module: string,
  message: string,
  durationMs: number,
  extra?: Record<string, unknown>,
): void {
  if (!shouldLog('warn')) return;

  writeLog('warn', module, stripPII(message), {
    durationMs,
    slow: true,
    ...extra,
  });
}

/**
 * Log an API route error with HTTP context.
 * Convenience wrapper that includes method, route, and status.
 *
 * @example
 *   serverLog.apiError('api/insights', 'GET', 500, error);
 */
export function serverLogApiError(
  route: string,
  method: string,
  statusCode: number,
  error?: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!shouldLog('error')) return;

  const message = error instanceof Error ? error.message : `API ${method} ${route} → ${statusCode}`;
  const cleanedMsg = stripPII(message);
  const errorType = error instanceof Error
    ? error.constructor.name
    : 'ApiError';

  writeLog('error', route, cleanedMsg, {
    msgHash: simpleHash(cleanedMsg),
    errorType,
    route,
    method,
    statusCode,
    ...extra,
  });
}

// ─── Namespace export for clean imports ──────

export const serverLog = {
  error: serverLogError,
  warn: serverLogWarn,
  info: serverLogInfo,
  slow: serverLogSlow,
  apiError: serverLogApiError,
} as const;
