// ═══════════════════════════════════════════
// WIDGET SNAPSHOT ENGINE — VitaZen
// Compute, read, and invalidate widget snapshots
// ═══════════════════════════════════════════
//
// The snapshot engine is the core of the widget data layer.
//
// Architecture:
//   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
//   │  User Action  │────▶│  Invalidate  │────▶│   Compute    │
//   │  (check-in,   │     │  Cache + DB  │     │   New        │
//   │   habit, etc) │     │  Snapshot    │     │   Snapshot   │
//   └──────────────┘     └──────────────┘     └──────────────┘
//         │                                            │
//         │                                            ▼
//         │                                    ┌──────────────┐
//         │                                    │  Store in DB │
//         │                                    │  + Memory    │
//         │                                    │    Cache     │
//         │                                    └──────────────┘
//         │                                            │
//         ▼                                            ▼
//   ┌──────────────────────────────────────────────────────────┐
//   │                  Widget Read (O(1))                      │
//   │   Memory Cache → DB Snapshot → Compute (lazy fallback)  │
//   └──────────────────────────────────────────────────────────┘
//
// Flow on widget read:
//   1. Check memory cache → return if fresh
//   2. Check DB snapshot → return if not expired, cache in memory
//   3. Compute new snapshot → store in DB + memory, return
//
// This ensures:
//   - No heavy computation on every read (battery-safe)
//   - Stale-while-revalidate (serve stale, compute async)
//   - Trigger-based invalidation (data changes → snapshot updates)

import { db } from '@/lib/db';
import {
  WidgetType,
  WIDGET_TYPES,
  WIDGET_TTL_MS,
  WidgetPayload,
  WidgetResponse,
} from './types';
import {
  getCachedSnapshot,
  setCachedSnapshot,
  invalidateCachedSnapshot,
  isSnapshotStale,
} from './cache';
import {
  shapeReflectionPayload,
  shapeMomentumPayload,
  shapeCheckinPayload,
  shapeDailyFocusPayload,
  shapeCalmQuotePayload,
} from './shaping';

// ─── Snapshot Computation ────────────────────

/**
 * Compute a fresh snapshot for a widget type.
 * This is the "expensive" operation — queries DB, shapes payload.
 * Should only be called when:
 *   - No snapshot exists
 *   - Snapshot has expired
 *   - Data has changed (trigger-based invalidation)
 */
async function computeSnapshot(
  userId: string,
  widgetType: WidgetType,
  plan: string,
): Promise<WidgetPayload> {
  switch (widgetType) {
    case 'reflection':
      return shapeReflectionPayload(userId, plan);
    case 'momentum':
      return shapeMomentumPayload(userId, plan);
    case 'checkin':
      return shapeCheckinPayload(userId, plan);
    case 'daily_focus':
      return shapeDailyFocusPayload(userId, plan);
    case 'calm_quote':
      return shapeCalmQuotePayload(userId, plan);
    default:
      throw new Error(`Unknown widget type: ${widgetType}`);
  }
}

/**
 * Store a computed snapshot in the database.
 * Uses upsert since there's one snapshot per (userId, widgetType).
 */
async function storeSnapshot(
  userId: string,
  widgetType: WidgetType,
  payload: WidgetPayload,
): Promise<{ computedAt: Date; expiresAt: Date }> {
  const now = new Date();
  const ttlMs = WIDGET_TTL_MS[widgetType];
  const expiresAt = new Date(now.getTime() + ttlMs);

  await db.widgetSnapshot.upsert({
    where: {
      userId_widgetType: { userId, widgetType },
    },
    update: {
      data: JSON.stringify(payload),
      version: { increment: 1 },
      computedAt: now,
      expiresAt,
    },
    create: {
      userId,
      widgetType,
      data: JSON.stringify(payload),
      version: 1,
      computedAt: now,
      expiresAt,
    },
  });

  return { computedAt: now, expiresAt };
}

// ─── Public API ──────────────────────────────

/**
 * Get widget data for a user. This is the main read path.
 *
 * Priority:
 *   1. Memory cache (fastest, no DB hit)
 *   2. DB snapshot (one DB query)
 *   3. Fresh computation (expensive, but then cached)
 *
 * Always returns data — never blocks on computation for expired snapshots.
 * Uses stale-while-revalidate: serve stale, compute in background.
 */
export async function getWidgetSnapshot(
  userId: string,
  widgetType: WidgetType,
  plan: string,
): Promise<WidgetResponse> {
  // ── 1. Check memory cache ──
  const cached = getCachedSnapshot(userId, widgetType);
  if (cached) {
    return {
      type: widgetType,
      data: cached.data,
      computedAt: cached.computedAt.toISOString(),
      expiresAt: cached.expiresAt.toISOString(),
      stale: isSnapshotStale(cached),
    };
  }

  // ── 2. Check DB snapshot ──
  const dbSnapshot = await db.widgetSnapshot.findUnique({
    where: {
      userId_widgetType: { userId, widgetType },
    },
  });

  if (dbSnapshot) {
    const parsedData = JSON.parse(dbSnapshot.data) as WidgetPayload;
    const stale = new Date() > dbSnapshot.expiresAt;

    // Update memory cache
    setCachedSnapshot({
      userId,
      widgetType,
      data: parsedData,
      computedAt: dbSnapshot.computedAt,
      expiresAt: dbSnapshot.expiresAt,
    });

    // If stale, trigger background revalidation (don't block the response)
    if (stale) {
      revalidateSnapshot(userId, widgetType, plan).catch(() => {
        // Non-blocking: if revalidation fails, we served stale data which is fine
      });
    }

    return {
      type: widgetType,
      data: parsedData,
      computedAt: dbSnapshot.computedAt.toISOString(),
      expiresAt: dbSnapshot.expiresAt.toISOString(),
      stale,
    };
  }

  // ── 3. No snapshot exists — compute fresh ──
  const payload = await computeSnapshot(userId, widgetType, plan);
  const { computedAt, expiresAt } = await storeSnapshot(userId, widgetType, payload);

  // Update memory cache
  setCachedSnapshot({
    userId,
    widgetType,
    data: payload,
    computedAt,
    expiresAt,
  });

  return {
    type: widgetType,
    data: payload,
    computedAt: computedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    stale: false,
  };
}

/**
 * Force recompute a snapshot (called by trigger hooks or manual refresh).
 * This is the ONLY way to update snapshot data on user action.
 *
 * After recomputation:
 *   - DB snapshot is updated
 *   - Memory cache is updated
 *   - Old stale data is replaced
 */
export async function recomputeSnapshot(
  userId: string,
  widgetType: WidgetType,
  plan: string,
): Promise<{ computedAt: Date; expiresAt: Date } | null> {
  try {
    const payload = await computeSnapshot(userId, widgetType, plan);
    const result = await storeSnapshot(userId, widgetType, payload);

    // Update memory cache
    setCachedSnapshot({
      userId,
      widgetType,
      data: payload,
      computedAt: result.computedAt,
      expiresAt: result.expiresAt,
    });

    return result;
  } catch (error) {
    console.error(`[Widgets] Failed to recompute ${widgetType} for user ${userId}:`, error);
    return null;
  }
}

/**
 * Background revalidation — same as recompute but never throws.
 * Used for stale-while-revalidate pattern.
 */
async function revalidateSnapshot(
  userId: string,
  widgetType: WidgetType,
  plan: string,
): Promise<void> {
  try {
    await recomputeSnapshot(userId, widgetType, plan);
  } catch {
    // Silent failure — we already served stale data
  }
}

/**
 * Invalidate a specific widget snapshot.
 * Called when related data changes (e.g., check-in → invalidate checkin widget).
 * The next read will trigger recomputation.
 */
export async function invalidateSnapshot(
  userId: string,
  widgetType: WidgetType,
  plan: string,
): Promise<void> {
  // Clear memory cache
  invalidateCachedSnapshot(userId, widgetType);

  // Immediately recompute so the next read is fast
  await recomputeSnapshot(userId, widgetType, plan);
}

/**
 * Invalidate multiple widget types at once.
 * Called when data changes affect multiple widgets.
 */
export async function invalidateSnapshots(
  userId: string,
  widgetTypes: WidgetType[],
  plan: string,
): Promise<void> {
  // Compute all in parallel for efficiency
  await Promise.allSettled(
    widgetTypes.map(type => invalidateSnapshot(userId, type, plan)),
  );
}

/**
 * Invalidate all snapshots for a user on a major data change.
 * Used sparingly — prefer targeted invalidation.
 */
export async function invalidateAllSnapshots(
  userId: string,
  plan: string,
): Promise<void> {
  await invalidateSnapshots(userId, WIDGET_TYPES, plan);
}

// ─── Snapshot Cleanup ────────────────────────
//
// Periodically clean up expired snapshots from the DB.
// This prevents the table from growing unboundedly.
// Called by a cron job or can be triggered manually.

export async function cleanupExpiredSnapshots(): Promise<number> {
  const now = new Date();

  const result = await db.widgetSnapshot.deleteMany({
    where: {
      expiresAt: { lt: now },
    },
  });

  return result.count;
}
