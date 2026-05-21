// ═══════════════════════════════════════════
// NOTIFICATION TYPES — VitaZen
// Calm, human, premium notification architecture
//
// Streak notifications removed.
// "Llevas X días" is gamification disguised as gentleness.
// VitaZen doesn't reward consistency — it notices it,
// silently, through Silent Memories, not push notifications.
// ═══════════════════════════════════════════

/** All supported notification reminder types.
 *  Each type has its own cooldown, frequency cap, and template set.
 *  Adding a new type here automatically makes it available everywhere. */
export type NotificationType =
  | 'checkin'         // "Tu check-in te espera" — gentle daily nudge
  | 'weekly_recap'    // "Tu semana en VitaZen" — summary
  | 'comeback'        // "Sin prisa" — after inactivity
  | 'reflection';     // "Un momento para ti" — evening reflection

/** Full list for iteration — avoids magic arrays scattered in code */
export const NOTIFICATION_TYPES: NotificationType[] = [
  'checkin',
  'weekly_recap',
  'comeback',
  'reflection',
];

/** Cooldown per notification type (milliseconds).
 *  How long before the same type can fire again for the same user.
 *  This is the PRIMARY anti-spam mechanism. */
export const TYPE_COOLDOWNS_MS: Record<NotificationType, number> = {
  checkin:        8 * 60 * 60 * 1000,  // 8 hours — max 1 check-in nudge per half-day
  weekly_recap:   7 * 24 * 60 * 60 * 1000, // 7 days — once per week
  comeback:       72 * 60 * 60 * 1000,  // 72 hours — 3 days minimum between comeback
  reflection:     24 * 60 * 60 * 1000,  // 24 hours — once per day
};

/** Maximum times a given type can fire in a rolling 7-day window.
 *
 *  Reduced from original caps:
 *  - checkin: 5 → 3 (less noise, more meaning)
 *  - reflection: 4 → 2 (silence is part of the design)
 *  - streak: REMOVED (gamification, not observation)
 */
export const TYPE_WEEKLY_CAPS: Record<NotificationType, number> = {
  checkin:        3,   // at most 3 check-in nudges per week
  weekly_recap:   1,   // once per week (hard cap)
  comeback:       1,   // at most 1 comeback per week
  reflection:     2,   // at most 2 reflections per week
};

/** Default max daily notifications across ALL types.
 *  Overridable per-user in NotificationPreference. */
export const DEFAULT_MAX_DAILY = 2;

/** Quiet hours — default window.
 *  All times in user's local timezone. */
export const DEFAULT_QUIET_HOURS_START = '22:00';
export const DEFAULT_QUIET_HOURS_END   = '08:00';

/** Permission states reported by the browser */
export type PushPermissionState = 'granted' | 'denied' | 'default' | 'not_supported';

/** Payload sent from client when registering a push token */
export interface RegisterPushTokenPayload {
  token: string;
  platform?: 'web' | 'ios' | 'android';
  userAgent?: string;
}

/** Payload for updating notification preferences */
export interface UpdateNotificationPreferencesPayload {
  pushEnabled?: boolean;
  checkinReminders?: boolean;
  weeklyRecap?: boolean;
  comebackReminders?: boolean;
  reflectionReminders?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;  // HH:mm
  quietHoursEnd?: string;    // HH:mm
  timezone?: string;
  maxDailyNotifications?: number; // 1-5
}

/** Full notification preferences returned by the API */
export interface NotificationPreferencesResponse {
  pushEnabled: boolean;
  checkinReminders: boolean;
  weeklyRecap: boolean;
  comebackReminders: boolean;
  reflectionReminders: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
  maxDailyNotifications: number;
  permissionState: PushPermissionState;
}

/** Internal: result of a scheduling gate check */
export interface ScheduleGateResult {
  allowed: boolean;
  reason?: string;
  deferUntil?: Date; // If quiet hours block, when to reschedule
}

/** Notification message template */
export interface NotificationTemplate {
  title: string;
  body: string;
  icon?: string;
  url?: string; // deep link
}
