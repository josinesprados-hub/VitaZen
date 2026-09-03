// ═══════════════════════════════════════════
// RATE LIMITER — VitaZen (PROD-03)
// ═══════════════════════════════════════════
//
// Database-backed per-user rate limiter using the existing AnalyticsEvent table.
// No external dependencies (no Redis, no Upstash). No schema changes.
//
// Design principles:
// - Fail-safe: if the DB query fails, the request is ALLOWED (open on error).
// - Per-user: keyed on userId, not IP (all mutation endpoints require auth).
// - Uses AnalyticsEvent table with event prefix 'rl:' to avoid collision with
//   real analytics events. The existing composite index (userId, event, createdAt)
//   makes the count query efficient.
// - Records are naturally cleaned up by any future retention policy on AnalyticsEvent.
//
// Usage:
//   const limited = await rateLimit(userId, 'checkin:post', { maxRequests: 10, windowMs: 60_000 });
//   if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
// ═══════════════════════════════════════════

import { NextResponse } from 'next/server';
import { db } from './db';

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Discriminated result of a rate limit check.
 *
 * Narrow with the `limited` flag before reading `resetAt`/`current`:
 * only the limited branch guarantees both fields are present.
 */
export type RateLimitResult =
  | {
      /** Whether the request was rate-limited (true in this branch) */
      limited: true;
      /** Current count within the window */
      current: number;
      /** Reset time in ms since epoch */
      resetAt: number;
    }
  | {
      /** Whether the request was rate-limited (false in this branch) */
      limited: false;
      /** Current count within the window (undefined on DB error) */
      current?: number;
      /** Reset time in ms since epoch (undefined on DB error) */
      resetAt?: number;
    };

/**
 * Check and enforce a per-user rate limit.
 *
 * Flow:
 *  1. Count recent 'rl:{key}' events for this user within the window.
 *  2. If count >= maxRequests → return { limited: true }.
 *  3. If count < maxRequests → record the event and return { limited: false }.
 *  4. On any DB error → return { limited: false } (fail-safe / open on error).
 *
 * The record step (3) uses a fire-and-forget approach: the request proceeds
 * regardless of whether the record insert succeeds. This ensures the rate
 * limiter never blocks legitimate traffic due to a transient DB hiccup.
 */
export async function rateLimit(
  userId: string,
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const eventKey = `rl:${key}`;
  const windowStart = new Date(Date.now() - config.windowMs);

  try {
    const count = await db.analyticsEvent.count({
      where: {
        userId,
        event: eventKey,
        createdAt: { gte: windowStart },
      },
    });

    if (count >= config.maxRequests) {
      return { limited: true, current: count, resetAt: Date.now() + config.windowMs };
    }

    // Record this request (fire-and-forget — don't block on insert failure)
    db.analyticsEvent.create({
      data: {
        event: eventKey,
        userId,
        properties: null,
      },
    }).catch(() => {
      // Non-blocking: if the record insert fails, the rate limit check still worked.
      // The next request will re-count and get the correct number.
    });

    return { limited: false, current: count + 1, resetAt: Date.now() + config.windowMs };
  } catch {
    // Fail-safe: on any error, allow the request.
    // This prevents a DB outage from blocking all mutation endpoints.
    return { limited: false };
  }
}

// ═══════════════════════════════════════════
// PREDEFINED LIMITS — grouped by risk level
// ═══════════════════════════════════════════
//
// Tiers:
//   - XP_GRANTING: endpoints that award XP on every call — highest abuse risk.
//     These have the tightest limits because repeated calls inflate empire progress.
//   - DATA_WRITE: endpoints that create/update/delete user data — moderate risk.
//     These need protection against accidental rapid-fire (double-tap, network retry)
//     and intentional abuse, but the limits are more generous.
//   - PREFERENCE: low-risk configuration endpoints — generous limits.
//   - AI_MUTATION: AI-related mutations (thread CRUD, favorites) — moderate limits.
//
// IMPORTANT: These limits do NOT affect Mentor's functional limits
// (10 messages/day for Free, 5 conversations max). Those are handled by
// the existing AIUsage and AIThread count checks in their respective routes.

export const RATE_LIMITS = {
  // ── XP-Granting endpoints (highest abuse risk) ──
  // Each call awards XP. Without rate limiting, an attacker can inflate
  // empire progress, unlock achievements, and manipulate leaderboards.
  'checkin:post':         { maxRequests: 5,  windowMs: 60_000 },    // 5/min
  'meditation:post':      { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'wellness:post':        { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'nutrition:post':       { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'finance:post':         { maxRequests: 20, windowMs: 60_000 },    // 20/min (legitimate use: entering multiple transactions)
  'habits:post':          { maxRequests: 5,  windowMs: 60_000 },    // 5/min (also has daily cap of 5)
  'habits:patch':         { maxRequests: 10, windowMs: 60_000 },    // 10/min (completions)
  'habits:undo':          { maxRequests: 10, windowMs: 60_000 },    // 10/min

  // ── Data write endpoints (moderate risk) ──
  // These create/delete records but don't award XP. Protected against
  // rapid-fire and abuse.
  'journal:post':         { maxRequests: 10, windowMs: 60_000 },    // 10/min (also has daily cap of 5)
  'journal:put':          { maxRequests: 20, windowMs: 60_000 },    // 20/min
  'journal:delete':       { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'checkin:put':          { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'checkin:delete':       { maxRequests: 5,  windowMs: 60_000 },    // 5/min
  'wellness:put':         { maxRequests: 20, windowMs: 60_000 },    // 20/min
  'wellness:delete':      { maxRequests: 5,  windowMs: 60_000 },    // 5/min
  'nutrition:put':        { maxRequests: 20, windowMs: 60_000 },    // 20/min
  'nutrition:delete':     { maxRequests: 5,  windowMs: 60_000 },    // 5/min
  'finance:put':          { maxRequests: 20, windowMs: 60_000 },    // 20/min
  'finance:delete':       { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'habits:put':           { maxRequests: 20, windowMs: 60_000 },    // 20/min
  'habits:delete':        { maxRequests: 10, windowMs: 60_000 },    // 10/min

  // ── AI mutation endpoints ──
  'ai:chat':              { maxRequests: 30, windowMs: 60_000 },    // 30/min (on top of daily 10 for Free)
  'ai:threads:post':      { maxRequests: 5,  windowMs: 60_000 },    // 5/min
  'ai:threads:patch':     { maxRequests: 20, windowMs: 60_000 },    // 20/min
  'ai:threads:delete':    { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'ai:favorites:patch':   { maxRequests: 30, windowMs: 60_000 },    // 30/min

  // ── Notification endpoints ──
  'notifications:register':     { maxRequests: 5,  windowMs: 60_000 },  // 5/min
  'notifications:unregister':   { maxRequests: 10, windowMs: 60_000 },  // 10/min
  'notifications:preferences': { maxRequests: 10, windowMs: 60_000 },  // 10/min

  // ── User settings/profile ──
  'settings:put':         { maxRequests: 10, windowMs: 60_000 },    // 10/min
  'profile:put':          { maxRequests: 5,  windowMs: 60_000 },    // 5/min (avatar upload is heavier)

  // ── Monthly closure ──
  'monthly-closure:post': { maxRequests: 5,  windowMs: 60_000 },    // 5/min

  // ── Analytics ──
  'analytics:track':      { maxRequests: 30, windowMs: 60_000 },    // 30/min

  // ── Stripe ──
  'stripe:checkout':      { maxRequests: 3,  windowMs: 300_000 },  // 3/5min (external API call)
  'stripe:portal':        { maxRequests: 5,  windowMs: 300_000 },  // 5/5min (external API call)
  'stripe:restore':       { maxRequests: 3,  windowMs: 300_000 },  // 3/5min (multiple external API calls)

  // ── Additional data write endpoints (PROD-09) ──
  'meditation:put':       { maxRequests: 20, windowMs: 60_000 },    // 20/min
  'meditation:delete':    { maxRequests: 10, windowMs: 60_000 },    // 10/min (XP revert risk)
  'onboarding:post':      { maxRequests: 3,  windowMs: 300_000 },  // 3/5min (heavy transaction)
  'notifications:deactivate-all': { maxRequests: 5, windowMs: 60_000 },  // 5/min
  'notifications:permission':     { maxRequests: 10, windowMs: 60_000 },  // 10/min
  'widgets:refresh':      { maxRequests: 20, windowMs: 60_000 },    // 20/min (on top of internal limit)
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

// ═══════════════════════════════════════════
// PROD-10 — Retry-After helper
// ═══════════════════════════════════════════
//
// Centralized 429 response builder. All rate-limited routes MUST use this
// function instead of constructing their own 429 response, to guarantee:
//   1. The standard HTTP Retry-After header is always present.
//   2. The header value matches the body's retryAfter field.
//   3. The value is an integer (seconds, per RFC 7231 §7.1.3).
//
// Usage:
//   const rl = await rateLimit(user.id, 'checkin:post', RATE_LIMITS['checkin:post']);
//   if (rl.limited) return rateLimitedResponse(rl);

/**
 * Build a 429 Too Many Requests response with Retry-After header.
 *
 * @param result - The RateLimitResult from rateLimit()
 * @param customMessage - Optional custom error message (defaults to 'Too many requests')
 * @returns NextResponse with status 429, Retry-After header, and JSON body
 */
export function rateLimitedResponse(
  result: { resetAt: number; current?: number },
  customMessage?: string,
): NextResponse {
  const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: customMessage ?? 'Too many requests', retryAfter: result.resetAt },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSec) },
    },
  );
}
