// ═══════════════════════════════════════════
// NOTIFICATIONS INDEX — VitaZen
// Public API for the notification module
// ═══════════════════════════════════════════

export { sendNotification, getTodayNotificationCount } from './service';
export { canSendNotification, isInQuietHours, isDuplicateNotification, getUserTodayStart } from './scheduler';
export { getTemplate } from './templates';
export {
  checkReflectionEligibility,
  sendReflectionReminder,
  processReflectionBatch,
  hasCheckedInToday,
  isUserCurrentlyActive,
} from './reminders/reflection';
export {
  checkCheckinEligibility,
  sendCheckinReminder,
  processCheckinBatch,
} from './reminders/checkin';
export {
  checkDailyEligibility,
  sendDailyReminder,
  processDailyBatch,
} from './reminders/daily';
export * from './types';
