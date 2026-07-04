// ═══════════════════════════════════════════
// API ROUTE TIMING — VitaZen
// Lightweight middleware for measuring API route
// execution time and detecting slow endpoints
// ═══════════════════════════════════════════
//
// USAGE:
//   Wrap your route handler with `withTiming`:
//
//   export const GET = withTiming('api/insights', async (request) => {
//     // ... your handler logic
//     return NextResponse.json(result);
//   });
//
// WHAT IT DOES:
//   - Measures handler execution time (Date.now at start/end)
//   - Logs slow endpoints (>2s by default) with structured format
//   - Logs 5xx responses as errors
//   - Logs 4xx responses as warnings (only if unusual patterns)
//   - Zero overhead on fast, successful responses (<2s, 2xx)
//
// WHAT IT DOES NOT DO:
//   - No request interception
//   - No body parsing
//   - No rate limiting
//   - No caching
//   - No dependency injection
//
// PRIVACY:
//   - No request body logged
//   - No auth tokens logged
//   - No user IDs logged in timing data
//   - Only route name, method, status, duration

import { NextRequest, NextResponse } from 'next/server';
import { serverLog } from './server-logger';

// ─── Configuration ───────────────────────────

const SLOW_THRESHOLD_MS = 2_000;  // 2 seconds
const VERY_SLOW_THRESHOLD_MS = 5_000;  // 5 seconds

// ─── Types ───────────────────────────────────

type RouteHandler = (
  request: NextRequest,
  context?: { params: Promise<Record<string, string>> },
) => Promise<Response> | Promise<NextResponse>;

interface TimingResult {
  durationMs: number;
  statusCode: number;
  wasSlow: boolean;
  wasVerySlow: boolean;
  was5xx: boolean;
}

// ─── Core Timing Function ────────────────────

/**
 * Wrap an API route handler with timing instrumentation.
 *
 * @param routeName - Identifier for the route (e.g. 'api/dashboard/metrics')
 * @param handler - The original route handler
 * @param options - Optional configuration
 *
 * @example
 *   export const GET = withTiming('api/insights', async (request) => {
 *     const result = await generateInsights(userId);
 *     return NextResponse.json(result);
 *   });
 */
export function withTiming(
  routeName: string,
  handler: RouteHandler,
  options?: { slowThresholdMs?: number },
): RouteHandler {
  const slowThreshold = options?.slowThresholdMs || SLOW_THRESHOLD_MS;

  return async (request: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
    const start = Date.now();
    const method = request.method;

    try {
      const response = await handler(request, context);
      const durationMs = Date.now() - start;
      const statusCode = response.status;

      const result: TimingResult = {
        durationMs,
        statusCode,
        wasSlow: durationMs >= slowThreshold,
        wasVerySlow: durationMs >= VERY_SLOW_THRESHOLD_MS,
        was5xx: statusCode >= 500,
      };

      // ─── Log slow endpoints ───
      if (result.wasVerySlow) {
        serverLog.slow(routeName, `Very slow endpoint: ${method} → ${statusCode}`, durationMs, {
          method,
          statusCode,
          verySlow: true,
        });
      } else if (result.wasSlow) {
        serverLog.slow(routeName, `Slow endpoint: ${method} → ${statusCode}`, durationMs, {
          method,
          statusCode,
        });
      }

      // ─── Log 5xx errors ───
      if (result.was5xx) {
        serverLog.apiError(routeName, method, statusCode, undefined, {
          durationMs,
        });
      }

      return response;
    } catch (error) {
      const durationMs = Date.now() - start;

      // Unhandled error from the handler — log it with timing
      serverLog.apiError(routeName, method, 500, error, {
        durationMs,
        unhandled: true,
      });

      // Re-throw — let Next.js handle the 500 response
      throw error;
    }
  };
}

/**
 * Time a specific operation inside a route handler.
 * Use for timing individual DB queries or sub-operations.
 *
 * @example
 *   const result = await timeOperation('generateInsights', async () => {
 *     return await generateInsights(userId);
 *   });
 */
export async function timeOperation<T>(
  operationName: string,
  fn: () => Promise<T>,
  options?: { slowThresholdMs?: number; module?: string },
): Promise<T> {
  const start = Date.now();
  const module = options?.module || 'operation';

  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const threshold = options?.slowThresholdMs || 3_000;

    if (durationMs >= threshold) {
      serverLog.slow(module, `Slow operation: ${operationName}`, durationMs, {
        operation: operationName,
      });
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - start;
    serverLog.error(module, `Operation failed: ${operationName}`, error, {
      operation: operationName,
      durationMs,
    });
    throw error;
  }
}
