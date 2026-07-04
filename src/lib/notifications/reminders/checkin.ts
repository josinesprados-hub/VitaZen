// ═══════════════════════════════════════════
// CHECK-IN REMINDER — VitaZen
// Calm, morning check-in nudges
//
// When to send:
//  ✓ User has push enabled + checkinReminders toggle on
//  ✓ It's morning in the user's timezone (07:00–10:00)
//  ✓ User hasn't checked in today
//  ✓ User is NOT currently active (don't interrupt)
//  ✓ All existing gates pass (quiet hours, cooldowns, caps, dedup)
//
// When NOT to send:
//  ✗ User already checked in today (they did it already)
//  ✗ User was active in the last 30 minutes (don't interrupt)
//  ✗ Outside the morning window (evening/night = wrong context)
//  ✗ Quiet hours active
//  ✗ Already sent a check-in nudge recently (cooldown 8h)
//  ✗ Daily or weekly cap reached
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '../service';
import { canSendNotification, isInQuietHours, getUserTodayStart } from '../scheduler';
import { hasCheckedInToday, isUserCurrentlyActive } from './reflection';

// ─── Configuration ──────────────────────────

/** The local-time window when check-in reminders are appropriate.
 *  Morning = start-of-day, when check-in feels natural. */
const CHECKIN_WINDOW_START = 7;  // 07:00 local
const CHECKIN_WINDOW_END   = 10; // 10:00 local

/** Maximum users to process in a single cron run. */
const BATCH_SIZE = 100;

// ─── Types ──────────────────────────────────

export interface CheckinEligibility {
  eligible: boolean;
  reason?: string;
}

export interface CheckinBatchResult {
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
 * Is it currently within the check-in window in the user's timezone?
 * Check-ins are morning-only: 07:00–10:00 local time.
 * This prevents evening/night nudges that feel out of context.
 */
function isInCheckinWindow(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);

    return hour >= CHECKIN_WINDOW_START && hour < CHECKIN_WINDOW_END;
  } catch {
    // If timezone is invalid, fail closed — don't send at random times
    console.warn('[CheckinReminder] Invalid timezone, skipping:', timezone);
    return false;
  }
}

/**
 * Full eligibility check for a check-in reminder.
 * Runs ALL gates before attempting to send.
 *
 * Order matters: cheapest checks first, expensive ones last.
 */
export async function checkCheckinEligibility(
  userId: string,
): Promise<CheckinEligibility> {
  // ── 1. Load preferences ──
  const prefs = await db.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs || !prefs.pushEnabled) {
    return { eligible: false, reason: 'push_not_enabled' };
  }

  if (!prefs.checkinReminders) {
    return { eligible: false, reason: 'checkin_disabled' };
  }

  // ── 2. Morning window check ──
  if (!isInCheckinWindow(prefs.timezone)) {
    return { eligible: false, reason: 'outside_checkin_window' };
  }

  // ── 3. Quiet hours (saves a DB query if blocked) ──
  if (prefs.quietHoursEnabled) {
    const now = new Date();
    if (isInQuietHours(now, prefs.quietHoursStart, prefs.quietHoursEnd, prefs.timezone)) {
      return { eligible: false, reason: 'quiet_hours' };
    }
  }

  // ── 4. Already checked in today? ──
  const checkedIn = await hasCheckedInToday(userId, prefs.timezone);
  if (checkedIn) {
    return { eligible: false, reason: 'already_checked_in_today' };
  }

  // ── 5. User currently active? (don't interrupt) ──
  const active = await isUserCurrentlyActive(userId);
  if (active) {
    return { eligible: false, reason: 'user_currently_active' };
  }

  // ── 6. Existing scheduler gates (cooldown, caps, dedup) ──
  const gate = await canSendNotification(userId, 'checkin');
  if (!gate.allowed) {
    return { eligible: false, reason: gate.reason || 'gate_blocked' };
  }

  return { eligible: true };
}

// ─── Send a single check-in reminder ────────

/**
 * Attempt to send a check-in reminder to a single user.
 * Runs all eligibility checks first, then delegates to the
 * existing sendNotification (which runs its own gates as a safety net).
 */
export async function sendCheckinReminder(
  userId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const eligibility = await checkCheckinEligibility(userId);

  if (!eligibility.eligible) {
    return { sent: false, reason: eligibility.reason };
  }

  const result = await sendNotification(userId, 'checkin');

  return {
    sent: result.success,
    reason: result.success ? undefined : result.reason,
  };
}

// ─── Batch processing (for cron) ────────────

/**
 * Process check-in reminders for all eligible users.
 * Called by the cron endpoint at 07:00 UTC.
 *
 * Flow:
 *  1. Find all users with push + checkinReminders enabled
 *  2. Filter by active push tokens
 *  3. Run eligibility check per user
 *  4. Send if eligible
 *  5. Return batch summary
 */
export async function processCheckinBatch(): Promise<CheckinBatchResult> {
  const result: CheckinBatchResult = {
    total: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // ── 1. Find candidates: users with push + checkin enabled ──
  const candidates = await db.notificationPreference.findMany({
    where: {
      pushEnabled: true,
      checkinReminders: true,
    },
    select: {
      userId: true,
      timezone: true,
    },
    take: BATCH_SIZE,
  });

  result.total = candidates.length;

  if (candidates.length === 0) {
    return result;
  }

  // ── 2. Filter: must have at least one active push token ──
  const candidateIds = candidates.map(c => c.userId);

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
  for (const candidate of candidates) {
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
    if (!isInCheckinWindow(candidate.timezone)) {
      result.skipped++;
      result.details.push({
        userId: candidate.userId,
        sent: false,
        reason: 'outside_checkin_window',
      });
      continue;
    }

    try {
      const sendResult = await sendCheckinReminder(candidate.userId);

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
      console.error('[CheckinReminder] Error for user:', candidate.userId, error);
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
