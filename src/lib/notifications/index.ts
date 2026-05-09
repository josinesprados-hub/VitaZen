// ═══════════════════════════════════════════
// NOTIFICATIONS INDEX — VitaZen
// Public API for the notification module
// ═══════════════════════════════════════════

export { sendNotification, deferNotification, getTodayNotificationCount } from './service';
export { canSendNotification, isInQuietHours, isDuplicateNotification } from './scheduler';
export { getTemplate } from './templates';
export * from './types';
