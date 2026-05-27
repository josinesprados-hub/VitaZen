// ═══════════════════════════════════════════
// NOTIFICATIONS INDEX — VitaZen
// Public API for the notification module
// ═══════════════════════════════════════════

export { sendNotification, deferNotification, getTodayNotificationCount } from './service';
export { canSendNotification, isInQuietHours, isDuplicateNotification, getUserTodayStart } from './scheduler';
export { getTemplate } from './templates';
export {
  checkReflectionEligibility,
  sendReflectionReminder,
  processReflectionBatch,
} from './reminders/reflection';
export * from './types';
