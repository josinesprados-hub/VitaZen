// ═══════════════════════════════════════════════════════════
// VITAZEN ANALYTICS — Server-side utility
// ═══════════════════════════════════════════════════════════
// Privacy-first: only tracks explicit events listed below.
// No fingerprinting, no cookies, no PII in properties.
// Events are fire-and-forget; errors never block the caller.
// ═══════════════════════════════════════════════════════════

import { db } from '@/lib/db';
import { startOfTodayMadrid, startOfNextDayMadrid } from '@/lib/dates';

// ─── Valid event names (whitelist) ─────────────────────────

export type AnalyticsEventType =
  | 'user_registered'
  | 'onboarding_completed'
  | 'daily_session'
  | 'checkin_created'
  | 'habit_completed'
  | 'mentor_used'
  | 'premium_upgrade_clicked'
  | 'premium_upgrade_completed'
  | 'recap_opened'
  | 'email_verified';

const VALID_EVENTS = new Set<string>([
  'user_registered',
  'onboarding_completed',
  'daily_session',
  'checkin_created',
  'habit_completed',
  'mentor_used',
  'premium_upgrade_clicked',
  'premium_upgrade_completed',
  'recap_opened',
  'email_verified',
]);

// ─── Track (server-side, direct DB write) ──────────────────

interface TrackOptions {
  event: string;
  userId?: string;
  properties?: Record<string, string | number | boolean>;
}

/**
 * Track an analytics event server-side.
 * Non-blocking: errors are logged but never thrown.
 * Deduplicates `daily_session` — only one per user per day.
 */
export async function trackEvent({ event, userId, properties }: TrackOptions): Promise<void> {
  // Validate event name against whitelist
  if (!VALID_EVENTS.has(event)) {
    console.warn(`[Analytics] Unknown event: ${event}`);
    return;
  }

  try {
    // Deduplicate daily_session: only one per user per calendar day
    if (event === 'daily_session' && userId) {
      const today = startOfTodayMadrid();
      const tomorrow = startOfNextDayMadrid();

      const existing = await db.analyticsEvent.findFirst({
        where: {
          event: 'daily_session',
          userId,
          createdAt: { gte: today, lt: tomorrow },
        },
        select: { id: true },
      });

      if (existing) return; // Already tracked today
    }

    await db.analyticsEvent.create({
      data: {
        event,
        userId: userId || null,
        properties: properties ? JSON.stringify(properties) : null,
      },
    });
  } catch (error) {
    // Never block the caller — analytics are best-effort
    console.error('[Analytics] Failed to track event:', event, error);
  }
}
