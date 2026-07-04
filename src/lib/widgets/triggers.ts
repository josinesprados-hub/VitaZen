// ═══════════════════════════════════════════
// WIDGET TRIGGER HOOKS — VitaZen
// Connects user data changes to widget snapshot invalidation
// ═══════════════════════════════════════════
//
// These functions are called from existing API routes when
// user data changes. They trigger targeted snapshot recomputation.
//
// Design principle:
//   - Only invalidate widgets that depend on the changed data
//   - Compute in background (non-blocking)
//   - No duplicate invalidations for the same action
//
// Widget data dependencies:
//   reflection:   independent of user actions (daily rotation)
//   momentum:     depends on checkins, habits, meditation, journal, challenges
//   checkin:      depends on daily check-in
//   daily_focus:  independent of user actions (daily rotation)
//   calm_quote:   independent of user actions (daily rotation)
//
// This means trigger hooks are only needed for:
//   - Check-in creation → invalidate checkin + momentum
//   - Habit completion → invalidate momentum
//   - Meditation session → invalidate momentum
//   - Journal entry → invalidate momentum
//   - Challenge completion → invalidate momentum

import { WidgetType } from './types';
import { triggerWidgetRefresh } from './refresh';

// ─── Trigger Functions ───────────────────────
//
// These are the ONLY functions that should be called from API routes.
// They encapsulate which widgets to refresh for each action type.

/**
 * Call when a user creates or updates a check-in.
 * Affects: checkin widget, momentum widget
 */
export function onCheckinChange(userId: string, plan: string): void {
  // Fire and forget — non-blocking
  triggerWidgetRefresh(userId, ['checkin', 'momentum'], plan).catch(() => {
    // Non-critical: widget will show slightly stale data until next read
  });
}

/**
 * Call when a user completes a habit.
 * Affects: momentum widget
 */
export function onHabitChange(userId: string, plan: string): void {
  triggerWidgetRefresh(userId, ['momentum'], plan).catch(() => {});
}

/**
 * Call when a user completes a meditation session.
 * Affects: momentum widget
 */
export function onMeditationChange(userId: string, plan: string): void {
  triggerWidgetRefresh(userId, ['momentum'], plan).catch(() => {});
}

/**
 * Call when a user creates a journal entry.
 * Affects: momentum widget
 */
export function onJournalChange(userId: string, plan: string): void {
  triggerWidgetRefresh(userId, ['momentum'], plan).catch(() => {});
}

/**
 * Call when a user completes a challenge.
 * Affects: momentum widget
 */
export function onChallengeChange(userId: string, plan: string): void {
  triggerWidgetRefresh(userId, ['momentum'], plan).catch(() => {});
}

/**
 * Call when a user's plan changes (FREE → PREMIUM or vice versa).
 * Affects: all widgets (premium features may change payload content)
 */
export function onPlanChange(userId: string, plan: string): void {
  triggerWidgetRefresh(userId, ['reflection', 'momentum', 'checkin', 'daily_focus', 'calm_quote'], plan).catch(() => {});
}
