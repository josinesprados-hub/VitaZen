// ═════════════════════════════════════════════════════════════════════
// DATA CLEANUP — VitaZen
// Retention and cleanup for infrastructure tables.
// FASE 12-P5 (audit) → FASE 12-P6 (implementation)
// ═════════════════════════════════════════════════════════════════════
//
// Design principles:
// - Batched deletes (never unbounded)
// - Select-then-delete pattern (Prisma compatible)
// - Fire-and-forget tolerance in cron context
// - Each cleanup is independent — failure in one does not affect others
// - Safety margins exceed maximum query windows
// ═════════════════════════════════════════════════════════════════════

import { db } from './db';

export interface CleanupResult {
  table: string;
  deleted: number;
  error?: string;
}

// ─── Retention constants ─────────────────────────────────────────
// All margins exceed the maximum query window used by business logic.

/** Rate-limit events are useless after 10 min (max window is 5 min) */
const RL_RETENTION_MS = 10 * 60 * 1000;

/** NotificationLog is queried up to 7 days (weekly cap). Margin: 8 days. */
const NOTIFICATION_LOG_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

/** Inactive push tokens: 30 days after last update */
const PUSH_TOKEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Real analytics events: insights queries up to 90 days. Margin: 120 days. */
const ANALYTICS_RETENTION_MS = 120 * 24 * 60 * 60 * 1000;

// ─── Batch sizes ──────────────────────────────────────────────────

const BATCH_RL = 1000;
const BATCH_NOTIFICATION_LOG = 500;
const BATCH_PUSH_TOKEN = 200;
const BATCH_DEFERRED = 100;
const BATCH_ANALYTICS = 1000;

// ═════════════════════════════════════════════════════════════════════
// 1. AnalyticsEvent rl: cleanup
// ═════════════════════════════════════════════════════════════════════
// Removes rate-limiting events older than 10 minutes.
// These are purely temporal (max window = 5 min) and serve no
// historical purpose. They also contaminate product analytics.
//
// Safe to run even when no rl: events exist (finds 0 rows).

export async function cleanupRateLimitEvents(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - RL_RETENTION_MS);
  let totalDeleted = 0;

  try {
    let batch: { id: string }[];
    do {
      batch = await db.analyticsEvent.findMany({
        where: {
          event: { startsWith: 'rl:' },
          createdAt: { lt: cutoff },
        },
        select: { id: true },
        take: BATCH_RL,
        orderBy: { createdAt: 'asc' },
      });

      if (batch.length === 0) break;

      const ids = batch.map(r => r.id);
      const result = await db.analyticsEvent.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += result.count;
    } while (batch.length === BATCH_RL);

    return { table: 'AnalyticsEvent (rl:)', deleted: totalDeleted };
  } catch (error) {
    return {
      table: 'AnalyticsEvent (rl:)',
      deleted: totalDeleted,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// 2. NotificationLog cleanup
// ═════════════════════════════════════════════════════════════════════
// Removes notification logs older than 8 days.
// Business logic queries at most 7 days (weekly cap, cooldown, dedup).
// 8-day margin ensures caps are never disrupted.

export async function cleanupNotificationLogs(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - NOTIFICATION_LOG_RETENTION_MS);
  let totalDeleted = 0;

  try {
    let batch: { id: string }[];
    do {
      batch = await db.notificationLog.findMany({
        where: { sentAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH_NOTIFICATION_LOG,
        orderBy: { sentAt: 'asc' },
      });

      if (batch.length === 0) break;

      const ids = batch.map(r => r.id);
      const result = await db.notificationLog.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += result.count;
    } while (batch.length === BATCH_NOTIFICATION_LOG);

    return { table: 'NotificationLog', deleted: totalDeleted };
  } catch (error) {
    return {
      table: 'NotificationLog',
      deleted: totalDeleted,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// 3. PushToken cleanup (inactive only)
// ═════════════════════════════════════════════════════════════════════
// Removes tokens that are:
//   - active = false (already deactivated by FCM invalidation,
//     user logout, or deactivate-all)
//   - updatedAt > 30 days ago (sufficient margin — FCM tokens
//     rotate naturally within ~1 week)
//
// active=true tokens are NEVER touched.

export async function cleanupInactivePushTokens(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - PUSH_TOKEN_RETENTION_MS);
  let totalDeleted = 0;

  try {
    let batch: { id: string }[];
    do {
      batch = await db.pushToken.findMany({
        where: {
          active: false,
          updatedAt: { lt: cutoff },
        },
        select: { id: true },
        take: BATCH_PUSH_TOKEN,
        orderBy: { updatedAt: 'asc' },
      });

      if (batch.length === 0) break;

      const ids = batch.map(r => r.id);
      const result = await db.pushToken.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += result.count;
    } while (batch.length === BATCH_PUSH_TOKEN);

    return { table: 'PushToken', deleted: totalDeleted };
  } catch (error) {
    return {
      table: 'PushToken',
      deleted: totalDeleted,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// 4. DeferredNotification cleanup (terminal states only)
// ═════════════════════════════════════════════════════════════════════
// Removes ONLY terminal DeferredNotifications:
//   - status = 'sent' | 'failed' | 'expired'
//   - processedAt > 3 days ago
//
// ABSOLUTELY NEVER touches:
//   - status = 'pending'  (awaiting delivery)
//   - status = 'delivering' (being actively sent)
//
// This is critical for PROD-01 integrity.

/** Terminal DeferredNotifications: 3 days after processing */
const DEFERRED_NOTIFICATION_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES = ['sent', 'failed', 'expired'] as const;

export async function cleanupTerminalDeferredNotifications(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - DEFERRED_NOTIFICATION_RETENTION_MS);
  let totalDeleted = 0;

  try {
    let batch: { id: string }[];
    do {
      batch = await db.deferredNotification.findMany({
        where: {
          status: { in: [...TERMINAL_STATUSES] },
          processedAt: { lt: cutoff },
        },
        select: { id: true },
        take: BATCH_DEFERRED,
        orderBy: { processedAt: 'asc' },
      });

      if (batch.length === 0) break;

      const ids = batch.map(r => r.id);
      const result = await db.deferredNotification.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += result.count;
    } while (batch.length === BATCH_DEFERRED);

    return { table: 'DeferredNotification', deleted: totalDeleted };
  } catch (error) {
    return {
      table: 'DeferredNotification',
      deleted: totalDeleted,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// 5. AnalyticsEvent (real product events) cleanup
// ═════════════════════════════════════════════════════════════════════
// Removes real analytics events older than 120 days.
// The insights endpoint queries at most 90 days. 120-day margin is safe.
//
// IMPORTANT: This must NEVER delete rl: events — those are handled
// by cleanupRateLimitEvents() with a much shorter retention.

export async function cleanupOldAnalyticsEvents(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - ANALYTICS_RETENTION_MS);
  let totalDeleted = 0;

  try {
    let batch: { id: string }[];
    do {
      batch = await db.analyticsEvent.findMany({
        where: {
          event: { not: { startsWith: 'rl:' } },
          createdAt: { lt: cutoff },
        },
        select: { id: true },
        take: BATCH_ANALYTICS,
        orderBy: { createdAt: 'asc' },
      });

      if (batch.length === 0) break;

      const ids = batch.map(r => r.id);
      const result = await db.analyticsEvent.deleteMany({
        where: { id: { in: ids } },
      });
      totalDeleted += result.count;
    } while (batch.length === BATCH_ANALYTICS);

    return { table: 'AnalyticsEvent (product)', deleted: totalDeleted };
  } catch (error) {
    return {
      table: 'AnalyticsEvent (product)',
      deleted: totalDeleted,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ═════════════════════════════════════════════════════════════════════
// Master cleanup — runs all jobs independently
// ═════════════════════════════════════════════════════════════════════

export interface CleanupSummary {
  analyticsRateLimitDeleted: number;
  notificationLogsDeleted: number;
  inactivePushTokensDeleted: number;
  deferredNotificationsDeleted: number;
  analyticsEventsDeleted: number;
  errors: Array<{ table: string; error: string }>;
  durationMs: number;
}

export async function runAllCleanups(): Promise<CleanupSummary> {
  const start = Date.now();
  const errors: CleanupSummary['errors'] = [];

  // 1. rl: events (highest priority — largest volume when active)
  const rlResult = await cleanupRateLimitEvents();
  if (rlResult.error) errors.push({ table: rlResult.table, error: rlResult.error });

  // 2. NotificationLog
  const nlResult = await cleanupNotificationLogs();
  if (nlResult.error) errors.push({ table: nlResult.table, error: nlResult.error });

  // 3. PushToken (inactive)
  const ptResult = await cleanupInactivePushTokens();
  if (ptResult.error) errors.push({ table: ptResult.table, error: ptResult.error });

  // 4. DeferredNotification (terminal only — NEVER pending/delivering)
  const dnResult = await cleanupTerminalDeferredNotifications();
  if (dnResult.error) errors.push({ table: dnResult.table, error: dnResult.error });

  // 5. AnalyticsEvent (real product, > 120 days)
  const aeResult = await cleanupOldAnalyticsEvents();
  if (aeResult.error) errors.push({ table: aeResult.table, error: aeResult.error });

  return {
    analyticsRateLimitDeleted: rlResult.deleted,
    notificationLogsDeleted: nlResult.deleted,
    inactivePushTokensDeleted: ptResult.deleted,
    deferredNotificationsDeleted: dnResult.deleted,
    analyticsEventsDeleted: aeResult.deleted,
    errors,
    durationMs: Date.now() - start,
  };
}
