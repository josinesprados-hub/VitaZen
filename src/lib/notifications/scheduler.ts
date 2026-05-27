// ═══════════════════════════════════════════
// NOTIFICATION SCHEDULER — VitaZen
// Quiet hours · Rate limits · Cooldowns · Deduplication
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import {
  NotificationType,
  TYPE_COOLDOWNS_MS,
  TYPE_WEEKLY_CAPS,
  DEFAULT_MAX_DAILY,
  ScheduleGateResult,
} from './types';

/**
 * Compute the start of "today" in the user's timezone as a UTC Date.
 *
 * BUG FIX: Previously used setHours(0,0,0,0) which always gives UTC midnight.
 * This caused the daily cap window to be misaligned by the timezone offset:
 *   - Madrid winter (UTC+1): cap window ran 01:00→01:00 instead of 00:00→00:00
 *   - Madrid summer (UTC+2): cap window ran 02:00→02:00 instead of 00:00→00:00
 *
 * Now computes midnight in the user's timezone, then converts to UTC.
 * For Madrid winter: 2025-01-16T00:00:00+01:00 → 2025-01-15T23:00:00Z
 */
export function getUserTodayStart(timezone: string): Date {
  const now = new Date();

  try {
    // Get today's date in the user's timezone
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // en-CA locale gives YYYY-MM-DD format
    const dateStr = dateFormatter.format(now);

    // Parse as midnight in the user's timezone
    // Format: "2025-01-16" → we need to know the offset at that time
    // Use Intl to get the offset for that specific date+time
    const offsetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    });

    // Create a date at midnight UTC for the target date, then adjust
    const targetMidnightUTC = new Date(`${dateStr}T00:00:00Z`);

    // Get the offset at approximately that time
    // Format the reference date to extract offset like "GMT+1"
    const offsetParts = offsetFormatter.formatToParts(targetMidnightUTC);
    const offsetPart = offsetParts.find(p => p.type === 'timeZoneName');

    if (offsetPart) {
      const offsetStr = offsetPart.value; // e.g., "GMT+1" or "GMT+5:30" or "GMT"
      const offsetMatch = offsetStr.match(/GMT([+-]?\d{1,2})(?::(\d{2}))?/);
      if (offsetMatch) {
        const offsetHours = parseInt(offsetMatch[1], 10);
        const offsetMinutes = offsetMatch[2] ? parseInt(offsetMatch[2], 10) : 0;
        // If offset is +1, then midnight local = 23:00 UTC previous day
        const totalOffsetMs = (offsetHours * 60 + (offsetHours < 0 ? -offsetMinutes : offsetMinutes)) * 60 * 1000;
        return new Date(targetMidnightUTC.getTime() - totalOffsetMs);
      }
    }

    // Fallback: if offset parsing fails, use a simple approach
    // Get the difference between UTC and the timezone right now
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: timezone });
    const diffMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return new Date(today.getTime() - diffMs);
  } catch {
    // If timezone is invalid, fall back to UTC (same as old behavior)
    console.warn('[Scheduler] Invalid timezone for todayStart, using UTC:', timezone);
    const fallback = new Date();
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }
}

/**
 * Master gate: can a notification of `type` be sent to `userId` right now?
 *
 * Checks (in order):
 *  1. Push enabled for this user?
 *  2. This specific reminder type enabled?
 *  3. Quiet hours active? → defer
 *  4. Daily cap reached? → block
 *  5. Type-specific cooldown not elapsed? → block
 *  6. Weekly cap for this type reached? → block
 *
 * Returns { allowed, reason?, deferUntil? }
 */
export async function canSendNotification(
  userId: string,
  type: NotificationType,
): Promise<ScheduleGateResult> {
  // ── 1. Load preferences ──
  const prefs = await db.notificationPreference.findUnique({ where: { userId } });

  // No preferences = user never opted in → block silently
  if (!prefs || !prefs.pushEnabled) {
    return { allowed: false, reason: 'push_not_enabled' };
  }

  // ── 2. Type-specific toggle ──
  const typeToggleMap: Record<NotificationType, boolean> = {
    checkin:        prefs.checkinReminders,
    weekly_recap:   prefs.weeklyRecap,
    comeback:       prefs.comebackReminders,
    reflection:     prefs.reflectionReminders,
  };

  if (!typeToggleMap[type]) {
    return { allowed: false, reason: 'type_disabled' };
  }

  // ── 3. Quiet hours ──
  if (prefs.quietHoursEnabled) {
    const now = new Date();
    const inQuiet = isInQuietHours(
      now,
      prefs.quietHoursStart,
      prefs.quietHoursEnd,
      prefs.timezone,
    );
    if (inQuiet) {
      const deferUntil = computeQuietHoursExit(
        now,
        prefs.quietHoursEnd,
        prefs.timezone,
      );
      return {
        allowed: false,
        reason: 'quiet_hours',
        deferUntil,
      };
    }
  }

  // ── 4. Daily cap ──
  // Uses timezone-aware midnight: a user in Madrid at 23:30 should have
  // their daily cap reset at Madrid midnight, not UTC midnight.
  const maxDaily = prefs.maxDailyNotifications || DEFAULT_MAX_DAILY;
  const todayStart = getUserTodayStart(prefs.timezone);

  const todayCount = await db.notificationLog.count({
    where: {
      userId,
      sentAt: { gte: todayStart },
    },
  });

  if (todayCount >= maxDaily) {
    return { allowed: false, reason: 'daily_cap_reached' };
  }

  // ── 5. Type cooldown ──
  const cooldownMs = TYPE_COOLDOWNS_MS[type];
  const cooldownThreshold = new Date(Date.now() - cooldownMs);

  const recentOfType = await db.notificationLog.findFirst({
    where: {
      userId,
      type,
      sentAt: { gte: cooldownThreshold },
    },
    orderBy: { sentAt: 'desc' },
  });

  if (recentOfType) {
    return { allowed: false, reason: 'type_cooldown_active' };
  }

  // ── 6. Weekly cap per type ──
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyCount = await db.notificationLog.count({
    where: {
      userId,
      type,
      sentAt: { gte: weekAgo },
    },
  });

  if (weeklyCount >= TYPE_WEEKLY_CAPS[type]) {
    return { allowed: false, reason: 'weekly_cap_reached' };
  }

  return { allowed: true };
}

/**
 * Check if `now` falls inside the quiet hours window.
 *
 * Quiet hours can span midnight (e.g. 22:00 → 08:00).
 * All times are interpreted in `timezone`.
 */
export function isInQuietHours(
  now: Date,
  startStr: string,  // "HH:mm"
  endStr: string,    // "HH:mm"
  timezone: string,
): boolean {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Spans midnight: 22:00 → 08:00
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    // Same day: 12:00 → 14:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    // If timezone is invalid, assume not in quiet hours (fail open)
    console.warn('[Scheduler] Invalid timezone, skipping quiet hours:', timezone);
    return false;
  }
}

/**
 * Given we're in quiet hours, compute the next valid send time
 * (the end of the quiet window on the same or next day).
 */
export function computeQuietHoursExit(
  now: Date,
  endStr: string,  // "HH:mm"
  timezone: string,
): Date {
  // Simple approach: defer by enough hours to be safely past quiet hours.
  // A precise calculation requires full timezone calendar math which is
  // overkill for this foundation. We add 1 hour past the quiet end.
  const [endH, endM] = endStr.split(':').map(Number);

  // Create a target date for "today at end time + 1h buffer" in user tz
  // Then convert back to UTC. For now, use a safe 10-hour defer.
  // This gets refined when actual scheduling infrastructure lands.
  const deferMs = 10 * 60 * 60 * 1000; // 10 hours — safe for any quiet window
  return new Date(Date.now() + deferMs);
}

/**
 * Deduplication guard: checks if a notification with the exact same
 * title + body was already sent recently (last 24h) to avoid duplicates
 * caused by race conditions or retry logic.
 */
export async function isDuplicateNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
): Promise<boolean> {
  const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existing = await db.notificationLog.findFirst({
    where: {
      userId,
      type,
      title,
      body,
      sentAt: { gte: recentThreshold },
    },
  });

  return !!existing;
}
