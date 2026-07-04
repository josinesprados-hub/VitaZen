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

// Widget rendering
export { renderReflectionWidget } from './render/reflection-html';
export type { WidgetSize, ReflectionWidgetRenderOptions } from './render/reflection-html';

// Types
export * from './types';
