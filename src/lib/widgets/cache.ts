// ═══════════════════════════════════════════
// WIDGET IN-MEMORY CACHE — VitaZen
// LRU-style cache with TTL for widget snapshots
// ═══════════════════════════════════════════
//
// Why an in-memory cache on top of DB snapshots?
//   - Widget reads happen frequently (every 15-60 min per widget)
//   - Each DB query has latency + connection overhead
//   - In-memory cache eliminates DB hits for fresh data
//   - TTL ensures data doesn't go stale beyond configured limits
//
// Cache structure: Map<"userId:widgetType", CachedSnapshot>
// Max size: 1000 entries (covers ~200 users × 5 widgets)
// Eviction: oldest entries removed when capacity reached

import { CachedSnapshot, WidgetType } from './types';

// ─── Configuration ──────────────────────────

const MAX_CACHE_SIZE = 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // Clean expired entries every 10 min

// ─── Cache Storage ──────────────────────────

const cache = new Map<string, CachedSnapshot>();

/** Build cache key from userId + widgetType */
function cacheKey(userId: string, widgetType: WidgetType): string {
  return `${userId}:${widgetType}`;
}

// ─── Core Operations ────────────────────────

/**
 * Get a cached snapshot if it exists and is not expired.
 * Returns null if not found or expired.
 */
export function getCachedSnapshot(
  userId: string,
  widgetType: WidgetType,
): CachedSnapshot | null {
  const key = cacheKey(userId, widgetType);
  const entry = cache.get(key);

  if (!entry) return null;

  // Check TTL
  if (new Date() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry;
}

/**
 * Store a snapshot in the cache.
 * Evicts the oldest entry if cache is at capacity.
 */
export function setCachedSnapshot(snapshot: CachedSnapshot): void {
  const key = cacheKey(snapshot.userId, snapshot.widgetType);

  // Evict oldest if at capacity
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    // Delete the first (oldest) entry
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }

  cache.set(key, snapshot);
}

/**
 * Invalidate a specific cached snapshot.
 * Called when user data changes (trigger-based invalidation).
 */
export function invalidateCachedSnapshot(
  userId: string,
  widgetType: WidgetType,
): void {
  const key = cacheKey(userId, widgetType);
  cache.delete(key);
}

/**
 * Invalidate all cached snapshots for a user.
 * Called on major data changes (check-in, habit completion).
 */
export function invalidateAllUserSnapshots(userId: string): void {
  const prefix = `${userId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Check if a snapshot is stale (past TTL but still in DB).
 * Used for stale-while-revalidate pattern.
 */
export function isSnapshotStale(snapshot: CachedSnapshot): boolean {
  return new Date() > snapshot.expiresAt;
}

/**
 * Get approximate cache size for monitoring.
 */
export function getCacheStats(): { size: number; maxSize: number } {
  return { size: cache.size, maxSize: MAX_CACHE_SIZE };
}

// ─── Periodic Cleanup ───────────────────────
//
// Remove expired entries periodically to prevent memory leaks.
// This runs in the background and doesn't block any operations.

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function cleanupExpired(): void {
  const now = new Date();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    }
  }
}

/**
 * Start the periodic cleanup timer.
 * Called once on server startup.
 */
export function startCacheCleanup(): void {
  if (cleanupTimer) return; // Already running
  cleanupTimer = setInterval(cleanupExpired, CLEANUP_INTERVAL_MS);

  // Don't prevent Node.js from exiting
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Stop the cleanup timer (for testing).
 */
export function stopCacheCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
