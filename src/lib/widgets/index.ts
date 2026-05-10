// ═══════════════════════════════════════════
// WIDGETS INDEX — VitaZen
// Public API for the widget module
// ═══════════════════════════════════════════

// Core read path
export { getWidgetSnapshot, recomputeSnapshot, invalidateSnapshot, invalidateSnapshots, invalidateAllSnapshots, cleanupExpiredSnapshots } from './snapshot';

// Refresh system
export { refreshWidgetSnapshot, triggerWidgetRefresh, batchRefreshExpiredSnapshots } from './refresh';

// Cache management
export { startCacheCleanup, stopCacheCleanup, getCacheStats } from './cache';

// Trigger hooks (call from API routes)
export {
  onCheckinChange,
  onHabitChange,
  onMeditationChange,
  onJournalChange,
  onChallengeChange,
  onPlanChange,
} from './triggers';

// Types
export * from './types';
