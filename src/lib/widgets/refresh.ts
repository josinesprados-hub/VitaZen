// ═══════════════════════════════════════════
// WIDGET REFRESH SCHEDULER — VitaZen
// Rate-limited, intelligent refresh for widget data
// ═══════════════════════════════════════════
//
// Key design decisions:
//   1. Manual refresh is rate-limited (5 min between, max 12/day)
//   2. Automatic refresh uses stale-while-revalidate (never blocks)
//   3. Trigger-based refresh happens on data change (immediate)
//   4. No polling, no loops, no periodic fetching from the client
//
// The refresh system prevents:
//   - Battery drain from excessive refreshes
//   - Duplicate computations from concurrent requests
//   - Refresh storms when widgets wake up simultaneously

import { db } from '@/lib/db';
import {
  WidgetType,
  MIN_REFRESH_INTERVAL_MS,
  MAX_DAILY_REFRESHES,
  WidgetRefreshResult,
} from './types';
import { recomputeSnapshot } from './snapshot';

// ─── In-Memory Rate Limiting ────────────────
//
// Track the last refresh time per user+widget to prevent
// rapid successive refreshes without hitting the DB.
// This is an optimization — the DB check below is the source of truth.

const lastRefreshTime = new Map<string, number>();

function refreshKey(userId: string, widgetType: WidgetType): string {
  return `${userId}:${widgetType}`;
}

function markRefreshed(userId: string, widgetType: WidgetType): void {
  lastRefreshTime.set(refreshKey(userId, widgetType), Date.now());

  // Prevent memory leak: cap the map size
  if (lastRefreshTime.size > 5000) {
    // Remove oldest entries
    const entries = [...lastRefreshTime.entries()].sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < 1000; i++) {
      lastRefreshTime.delete(entries[i][0]);
    }
  }
}

function wasRecentlyRefreshed(userId: string, widgetType: WidgetType): boolean {
  const key = refreshKey(userId, widgetType);
  const lastTime = lastRefreshTime.get(key);
  if (!lastTime) return false;

  return (Date.now() - lastTime) < MIN_REFRESH_INTERVAL_MS;
}

// ─── Public API ──────────────────────────────

/**
 * Attempt a manual refresh of a widget snapshot.
 * Rate-limited to prevent battery drain and excessive computation.
 *
 * Returns:
 *   - refreshed: true if snapshot was recomputed
 *   - refreshed: false if rate-limited or already fresh
 *   - reason: why refresh was skipped
 */
export async function refreshWidgetSnapshot(
  userId: string,
  widgetType: WidgetType,
  plan: string,
): Promise<WidgetRefreshResult> {
  // ── 1. In-memory rate check (fast, no DB) ──
  if (wasRecentlyRefreshed(userId, widgetType)) {
    return {
      type: widgetType,
      refreshed: false,
      reason: 'rate_limited_recently_refreshed',
    };
  }

  // ── 2. DB-based daily cap check ──
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Count refreshes today by checking snapshot version increments.
  // We use the snapshot's computedAt timestamp as a proxy:
  // if computedAt is within the last MIN_REFRESH_INTERVAL_MS, it was recently refreshed.
  const snapshot = await db.widgetSnapshot.findUnique({
    where: {
      userId_widgetType: { userId, widgetType },
    },
    select: { computedAt: true, expiresAt: true },
  });

  if (snapshot) {
    const timeSinceComputation = Date.now() - snapshot.computedAt.getTime();

    // If computed within the minimum interval, skip
    if (timeSinceComputation < MIN_REFRESH_INTERVAL_MS) {
      return {
        type: widgetType,
        refreshed: false,
        reason: 'rate_limited_snapshot_fresh',
      };
    }

    // Check daily cap: count snapshots computed today for this user
    const todayRefreshes = await db.widgetSnapshot.count({
      where: {
        userId,
        computedAt: { gte: todayStart },
      },
    });

    if (todayRefreshes >= MAX_DAILY_REFRESHES * WIDGET_TYPE_COUNT) {
      // MAX_DAILY_REFRESHES per type, but we check total to be safe
      return {
        type: widgetType,
        refreshed: false,
        reason: 'daily_refresh_cap_reached',
      };
    }
  }

  // ── 3. Recompute ──
  const result = await recomputeSnapshot(userId, widgetType, plan);

  if (result) {
    markRefreshed(userId, widgetType);

    return {
      type: widgetType,
      refreshed: true,
      computedAt: result.computedAt.toISOString(),
    };
  }

  return {
    type: widgetType,
    refreshed: false,
    reason: 'computation_failed',
  };
}

/** Number of widget types (for daily cap calculation) */
const WIDGET_TYPE_COUNT = 5;

/**
 * Trigger-based refresh: called when user data changes.
 * This is NOT rate-limited — it's an internal call from data mutations.
 *
 * Examples:
 *   - User checks in → refresh checkin + momentum widgets
 *   - User completes habit → refresh momentum widget
 *   - New day starts → refresh daily_focus + calm_quote widgets
 */
export async function triggerWidgetRefresh(
  userId: string,
  widgetTypes: WidgetType[],
  plan: string,
): Promise<void> {
  // Use Promise.allSettled to avoid blocking on any single failure
  await Promise.allSettled(
    widgetTypes.map(async (type) => {
      try {
        await recomputeSnapshot(userId, type, plan);
        markRefreshed(userId, type);
      } catch {
        // Non-blocking: individual failures shouldn't stop other refreshes
      }
    }),
  );
}

/**
 * Batch refresh for cron jobs.
 * Refreshes all expired snapshots for all users.
 * Rate-limited by design: only processes expired snapshots.
 */
export async function batchRefreshExpiredSnapshots(
  limit: number = 50,
): Promise<{ processed: number; refreshed: number; errors: number }> {
  const now = new Date();

  // Find expired snapshots (stale ones that need refresh)
  const expired = await db.widgetSnapshot.findMany({
    where: {
      expiresAt: { lt: now },
    },
    select: {
      userId: true,
      widgetType: true,
    },
    take: limit,
  });

  let refreshed = 0;
  let errors = 0;

  // Get user plans for computation
  const userIds = [...new Set(expired.map(s => s.userId))];
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, plan: true },
  });
  const planMap = new Map(users.map(u => [u.id, u.plan]));

  for (const snapshot of expired) {
    try {
      const plan = planMap.get(snapshot.userId) || 'FREE';
      await recomputeSnapshot(snapshot.userId, snapshot.widgetType as WidgetType, plan);
      refreshed++;
    } catch {
      errors++;
    }

    // Small delay between computations to avoid DB overload
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return { processed: expired.length, refreshed, errors };
}
