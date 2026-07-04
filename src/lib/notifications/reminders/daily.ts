// ═══════════════════════════════════════════
// DAILY REMINDER — VitaZen
// Calm, emotional, presence-oriented midday reminders
//
// This is NOT a check-in nudge.
// It's a gentle "you're here, that's enough" nudge
// in the middle of the day — a pause, not a task.
//
// When to send:
//  ✓ User has User.dailyReminders = true
//  ✓ User has push enabled (NotificationPreference.pushEnabled)
//  ✓ It's midday in the user's timezone (12:00–15:00)
//  ✓ User is NOT currently active (don't interrupt)
//  ✓ All existing gates pass (quiet hours, cooldowns, caps, dedup)
//
// When NOT to send:
//  ✗ User was active in the last 30 minutes (don't interrupt)
//  ✗ Outside the midday window (morning/evening = wrong context)
//  ✗ Quiet hours active
//  ✗ Already sent a daily reminder recently (cooldown 24h)
//  ✗ Daily or weekly cap reached
//
// NOTE: The toggle for daily reminders lives on the User model
// (User.dailyReminders), not NotificationPreference.
// This is because it's displayed in the "Email" section of Ajustes,
// but it triggers a push notification through the existing
// sendNotification() infrastructure. The batch processor checks
// User.dailyReminders as a pre-filter before calling sendNotification().
// The scheduler gate (canSendNotification) passes 'daily' type through
// since there's no corresponding toggle in NotificationPreference.
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '../service';
import { canSendNotification, isInQuietHours } from '../scheduler';
import { isUserCurrentlyActive } from './reflection';

// ─── Configuration ──────────────────────────

/** The local-time window when daily presence reminders feel right.
 *  Midday = the day is happening, a pause feels natural. */
const DAILY_WINDOW_START = 12; // 12:00 local
const DAILY_WINDOW_END   = 15; // 15:00 local

/** Maximum users to process in a single cron run. */
const BATCH_SIZE = 100;

// ─── Types ──────────────────────────────────

export interface DailyEligibility {
  eligible: boolean;
  reason?: string;
}

export interface DailyBatchResult {
  total: number;
  sent: number;
  skipped: number;
  errors: number;
  details: Array<{
    userId: string;
    sent: boolean;
    reason?: string;
  }>;
}

// ─── Core eligibility checks ────────────────

/**
 * Is it currently within the daily reminder window in the user's timezone?
 * Midday: 12:00–15:00 local time.
 */
function isInDailyWindow(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);

    return hour >= DAILY_WINDOW_START && hour < DAILY_WINDOW_END;
  } catch {
    console.warn('[DailyReminder] Invalid timezone, skipping:', timezone);
    return false;
  }
}

/**
 * Full eligibility check for a daily presence reminder.
 * Runs ALL gates before attempting to send.
 */
export async function checkDailyEligibility(
  userId: string,
): Promise<DailyEligibility> {
  // ── 1. Load preferences ──
  const prefs = await db.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs || !prefs.pushEnabled) {
    return { eligible: false, reason: 'push_not_enabled' };
  }

  // ── 2. Midday window check ──
  if (!isInDailyWindow(prefs.timezone)) {
    return { eligible: false, reason: 'outside_daily_window' };
  }

  // ── 3. Quiet hours ──
  if (prefs.quietHoursEnabled) {
    const now = new Date();
    if (isInQuietHours(now, prefs.quietHoursStart, prefs.quietHoursEnd, prefs.timezone)) {
      return { eligible: false, reason: 'quiet_hours' };
    }
  }

  // ── 4. User currently active? (don't interrupt) ──
  const active = await isUserCurrentlyActive(userId);
  if (active) {
    return { eligible: false, reason: 'user_currently_active' };
  }

  // ── 5. Existing scheduler gates (cooldown, caps, dedup) ──
  const gate = await canSendNotification(userId, 'daily');
  if (!gate.allowed) {
    return { eligible: false, reason: gate.reason || 'gate_blocked' };
  }

  return { eligible: true };
}

// ─── Send a single daily reminder ───────────

/**
 * Attempt to send a daily presence reminder to a single user.
 */
export async function sendDailyReminder(
  userId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const eligibility = await checkDailyEligibility(userId);

  if (!eligibility.eligible) {
    return { sent: false, reason: eligibility.reason };
  }

  const result = await sendNotification(userId, 'daily');

  return {
    sent: result.success,
    reason: result.success ? undefined : result.reason,
  };
}

// ─── Batch processing (for cron) ────────────

/**
 * Process daily presence reminders for all eligible users.
 * Called by the cron endpoint at 11:00 UTC.
 *
 * NOTE: Unlike reflection/checkin, this reads User.dailyReminders
 * instead of NotificationPreference, because the toggle lives on
 * the User model (displayed in the "Email" section of Ajustes).
 *
 * Flow:
 *  1. Find all users with dailyReminders=true AND push enabled
 *  2. Filter by active push tokens
 *  3. Run eligibility check per user
 *  4. Send if eligible
 *  5. Return batch summary
 */
export async function processDailyBatch(): Promise<DailyBatchResult> {
  const result: DailyBatchResult = {
    total: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // ── 1. Find candidates: users with dailyReminders=true AND pushEnabled=true ──
  // Two-step query: first find users with dailyReminders on,
  // then join with their notification preference.
  const usersWithDailyOn = await db.user.findMany({
    where: { dailyReminders: true },
    select: { id: true },
    take: BATCH_SIZE,
  });

  if (usersWithDailyOn.length === 0) {
    return result;
  }

  const userIds = usersWithDailyOn.map(u => u.id);

  // Now find which of those users have push enabled
  const pushEnabledPrefs = await db.notificationPreference.findMany({
    where: {
      userId: { in: userIds },
      pushEnabled: true,
    },
    select: {
      userId: true,
      timezone: true,
    },
  });

  result.total = pushEnabledPrefs.length;

  if (pushEnabledPrefs.length === 0) {
    return result;
  }

  // ── 2. Filter: must have at least one active push token ──
  const candidateIds = pushEnabledPrefs.map(p => p.userId);

  const usersWithTokens = await db.pushToken.groupBy({
    by: ['userId'],
    where: {
      userId: { in: candidateIds },
      active: true,
    },
    _count: { id: true },
  });

  const usersWithActiveTokens = new Set(usersWithTokens.map(u => u.userId));

  // ── 3. Process each eligible user ──
  for (const candidate of pushEnabledPrefs) {
    // Skip users without active tokens
    if (!usersWithActiveTokens.has(candidate.userId)) {
      result.skipped++;
      result.details.push({
        userId: candidate.userId,
        sent: false,
        reason: 'no_active_tokens',
      });
      continue;
    }

    // Quick pre-check: is it even the right time of day?
    if (!isInDailyWindow(candidate.timezone)) {
      result.skipped++;
      result.details.push({
        userId: candidate.userId,
        sent: false,
        reason: 'outside_daily_window',
      });
      continue;
    }

    try {
      const sendResult = await sendDailyReminder(candidate.userId);

      if (sendResult.sent) {
        result.sent++;
      } else {
        result.skipped++;
      }

      result.details.push({
        userId: candidate.userId,
        sent: sendResult.sent,
        reason: sendResult.reason,
      });
    } catch (error) {
      console.error('[DailyReminder] Error for user:', candidate.userId, error);
      result.errors++;
      result.details.push({
        userId: candidate.userId,
        sent: false,
        reason: 'internal_error',
      });
    }

    // Small delay between sends to avoid FCM rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return result;
}
