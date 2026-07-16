// ═══════════════════════════════════════════
// REFLECTION REMINDER — VitaZen
// Calm, premium, mindfulness-inspired evening reminders
//
// When to send:
//  ✓ User has push enabled + reflection toggle on
//  ✓ It's evening in the user's timezone (18:00–21:00 reflection window)
//  ✓ No check-in today (user hasn't already reflected)
//  ✓ User is NOT currently active (no recent analytics events)
//  ✓ All existing gates pass (quiet hours, cooldowns, caps, dedup)
//
// When NOT to send:
//  ✗ User already checked in today (they've reflected)
//  ✗ User was active in the last 30 minutes (don't interrupt)
//  ✗ Outside the reflection window (morning/midnight = wrong context)
//  ✗ Quiet hours active
//  ✗ Already sent a reflection recently (cooldown)
//  ✗ Daily or weekly cap reached
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { sendNotification } from '../service';
import { canSendNotification, isInQuietHours } from '../scheduler';
import { startOfTodayMadrid } from '@/lib/dates';

// ─── Configuration ──────────────────────────

/** The local-time window when reflection reminders are appropriate.
 *  Evening = wind-down time, not morning productivity. */
const REFLECTION_WINDOW_START = 18; // 18:00 local
const REFLECTION_WINDOW_END   = 21; // 21:00 local (before quiet hours default 22:00)

/** If the user had ANY analytics event this recently, they're "active" — don't interrupt. */
const ACTIVE_USER_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/** After a check-in, wait at least this long before considering a reflection. */
const POST_CHECKIN_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Maximum users to process in a single cron run. Prevents DB overload. */
const BATCH_SIZE = 100;

/** Minimum time between cron runs for the same user (prevents race conditions). */
const MIN_CRON_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23 hours

// ─── Types ──────────────────────────────────

export interface ReflectionEligibility {
  eligible: boolean;
  reason?: string;
}

export interface ReflectionBatchResult {
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
 * Is it currently within the reflection window in the user's timezone?
 * Reflections are evening-only: 18:00–21:00 local time.
 * This prevents morning/night reminders that feel out of context.
 */
function isInReflectionWindow(timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);

    return hour >= REFLECTION_WINDOW_START && hour < REFLECTION_WINDOW_END;
  } catch {
    // If timezone is invalid, fail closed — don't send at random times
    console.warn('[ReflectionReminder] Invalid timezone, skipping:', timezone);
    return false;
  }
}

/**
 * Did the user already check in today?
 * A check-in IS a form of reflection — no need to nudge again.
 *
 * Uses timezone-aware midnight to match the user's perceived "today".
 */
export async function hasCheckedInToday(userId: string, timezone: string): Promise<boolean> {
  // M-16 FIX: Use the `date` field (Madrid-based logical date) instead of
  // `createdAt`. Near midnight, createdAt could be tomorrow's UTC timestamp
  // while `date` correctly reflects the user's perceived check-in day.
  // Uses the unique index (userId, date) for exact, efficient lookup.
  const today = startOfTodayMadrid();

  const checkin = await db.dailyCheckin.findUnique({
    where: { userId_date: { userId, date: today } },
    select: { id: true },
  });

  if (!checkin) return false;

  // If they checked in today, they've reflected — no need to nudge.
  return true;
}

/**
 * Is the user currently active in the app?
 * Checks the AnalyticsEvent table for recent events.
 * If ANY event was logged within the threshold, the user is likely
 * looking at the app right now — don't interrupt with a push.
 */
export async function isUserCurrentlyActive(userId: string): Promise<boolean> {
  const threshold = new Date(Date.now() - ACTIVE_USER_THRESHOLD_MS);

  const recentEvent = await db.analyticsEvent.findFirst({
    where: {
      userId,
      createdAt: { gte: threshold },
    },
    select: { id: true },
  });

  return !!recentEvent;
}

/**
 * Did this user already get a reflection reminder processed
 * in a recent cron run? Prevents duplicate cron processing.
 */
async function wasRecentlyProcessedByCron(userId: string): Promise<boolean> {
  const threshold = new Date(Date.now() - MIN_CRON_INTERVAL_MS);

  const recentReflection = await db.notificationLog.findFirst({
    where: {
      userId,
      type: 'reflection',
      sentAt: { gte: threshold },
    },
    select: { id: true },
  });

  return !!recentReflection;
}

/**
 * Full eligibility check for a reflection reminder.
 * Runs ALL gates before attempting to send.
 *
 * Order matters: cheapest checks first, expensive ones last.
 */
export async function checkReflectionEligibility(
  userId: string,
): Promise<ReflectionEligibility> {
  // ── 1. Load preferences (needed for multiple checks) ──
  const prefs = await db.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs || !prefs.pushEnabled) {
    return { eligible: false, reason: 'push_not_enabled' };
  }

  if (!prefs.reflectionReminders) {
    return { eligible: false, reason: 'reflection_disabled' };
  }

  // ── 2. Reflection window check (cheap timezone calc) ──
  if (!isInReflectionWindow(prefs.timezone)) {
    return { eligible: false, reason: 'outside_reflection_window' };
  }

  // ── 3. Quiet hours (redundant with canSendNotification but saves a DB query) ──
  if (prefs.quietHoursEnabled) {
    const now = new Date();
    if (isInQuietHours(now, prefs.quietHoursStart, prefs.quietHoursEnd, prefs.timezone)) {
      return { eligible: false, reason: 'quiet_hours' };
    }
  }

  // ── 4. Already checked in today? (semantic check — they reflected) ──
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
  const gate = await canSendNotification(userId, 'reflection');
  if (!gate.allowed) {
    return { eligible: false, reason: gate.reason || 'gate_blocked' };
  }

  return { eligible: true };
}

// ─── Send a single reflection reminder ──────

/**
 * Attempt to send a reflection reminder to a single user.
 * Runs all eligibility checks first, then delegates to the
 * existing sendNotification (which runs its own gates as a safety net).
 */
export async function sendReflectionReminder(
  userId: string,
): Promise<{ sent: boolean; reason?: string }> {
  const eligibility = await checkReflectionEligibility(userId);

  if (!eligibility.eligible) {
    return { sent: false, reason: eligibility.reason };
  }

  const result = await sendNotification(userId, 'reflection');

  return {
    sent: result.success,
    reason: result.success ? undefined : result.reason,
  };
}

// ─── Batch processing (for cron) ────────────

/**
 * Process reflection reminders for all eligible users.
 * Called by the cron endpoint.
 *
 * Flow:
 *  1. Find all users with push + reflection enabled
 *  2. Filter by active push tokens
 *  3. Run eligibility check per user
 *  4. Send if eligible
 *  5. Return batch summary
 */
export async function processReflectionBatch(): Promise<ReflectionBatchResult> {
  const result: ReflectionBatchResult = {
    total: 0,
    sent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // ── 1. Find candidates: users with push + reflection enabled ──
  const candidates = await db.notificationPreference.findMany({
    where: {
      pushEnabled: true,
      reflectionReminders: true,
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
    // This saves DB queries for users in wrong timezones
    if (!isInReflectionWindow(candidate.timezone)) {
      result.skipped++;
      result.details.push({
        userId: candidate.userId,
        sent: false,
        reason: 'outside_reflection_window',
      });
      continue;
    }

    try {
      const sendResult = await sendReflectionReminder(candidate.userId);

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
      console.error('[ReflectionReminder] Error for user:', candidate.userId, error);
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
