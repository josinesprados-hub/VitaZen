// ═════════════════════════════════════════════════════════════════════
// VITAZEN — STREAK SOURCE OF TRUTH (G-06 FIX, FASE 14)
// ═════════════════════════════════════════════════════════════════════
//
// PROBLEM (G-06): two streak families coexisted and disagreed.
//
//   1. STORED counters — HabitLog.streak and EmpireProgress.streak —
//      are incremented on activity and never touched by inactivity.
//      Any consumer reading them naked presented a FROZEN value as the
//      "current streak" (dashboard "12d", disciplina "🔥 20", weekly
//      recap, Mentor prompt, achievements), even weeks after the last
//      real action.
//
//   2. CALCULATED streaks — calcStreak()/calcStreakFromKeys() in
//      dates.ts — derive the streak from real per-day activity
//      (Europe/Madrid) and are therefore always current, but they need
//      per-day history (meditation, finance, wellness, nutrition,
//      check-in, journal all have it).
//
// DECISION — what "current streak" means, for every consumer:
//
//   The current streak is derived from REAL ACTIVITY, never from a
//   naked stored counter:
//
//     current = isAlive(lastRealActivity) ? storedCount : 0
//
//   - Modules with per-day history keep the fully calculated form
//     (calcStreak over their event dates) — unchanged.
//
//   - Modules whose chain length only exists as a stored snapshot
//     (HabitLog keeps a single lastCompletedAt — there is NO per-day
//     completion history; EmpireProgress keeps the day-chain count)
//     expose that stored value as a CACHE of "consecutive periods
//     ending at the last completion". The cache is valid ONLY while
//     the activity chain is still alive, and aliveness is decided
//     from the last REAL activity instant — never from the counter
//     itself, never from the stored row alone.
//
//   With this gate a stale counter can never be presented as current:
//   if the user stops, the streak reads 0 exactly like
//   calcStreakFromKeys' semantics (a daily chain dies once a full
//   Madrid day passes without activity), even if no cron ever runs,
//   the server restarts, or the user does not open the app for weeks.
//   Nothing is written back at night — the truth is derived at read
//   time from activity that already happened.
//
// GRACE WINDOWS (Europe/Madrid date keys, daysBetweenDateKeys):
//
//   - daily habit    → alive while diffDays(last, today) < 2
//                     (completed today, or yesterday with the day
//                     still open — identical to calcStreakFromKeys'
//                     yesterday-grace and to PATCH's continuation rule
//                     diffDays < threshold*2 from H-7/H-8)
//   - weekly habit   → alive while diffDays < 14 (one missed full
//                     period breaks it — H-8 continuation window)
//   - monthly habit  → alive while diffDays < 60
//
//   - empire streaks → day-based (≥1 action that Madrid day), so they
//                     use the daily grace: alive while
//                     diffDays(lastActivity, today) < 2.
//
//   What the UI presents as "current" is always a streak the user can
//   still extend in the current period, and 0 the moment they no
//   longer can.
//
// PER-EMPIRE ACTIVITY SOURCES (must match each write path's day
// definition exactly):
//   - disciplina → HabitLog.lastCompletedAt of ANY habit (the empire
//     streak increments once per Madrid day with ≥1 completion,
//     regardless of habit frequency)
//   - mente      → MeditationSession.completedAt (server clock)
//   - riqueza    → FinanceLog.createdAt (server clock — NEVER the
//     user-supplied `date` field, which can be backdated; see the
//     F-4/G-03 notes in finance/route.ts)
//   - energia    → WellnessLog/NutritionLog `date` (Madrid-keyed,
//     G-02 window ≤ 2 days back — the same field the increment uses)
//   - crecimiento→ no streak write path exists (journal grants XP
//     only); its current streak is therefore always 0.
//
// DST: all day arithmetic uses Madrid date keys (getMadridDateKey,
// daysBetweenDateKeys, noon-UTC technique) — safe on the 23h/25h
// transition days. Europe/Madrid is the only timezone involved.
//
// HISTORICAL DATA: nothing is deleted, migrated or rewritten. The
// stored counters remain in the DB untouched; they simply stop being
// presented as current once activity says otherwise.
// ═════════════════════════════════════════════════════════════════════

import {
  daysBetweenDateKeys,
  getMadridDateKey,
  getTodayDateKey,
} from './dates';

// ─── Grace windows ─────────────────────────────────────────────

export type HabitFrequency = 'daily' | 'weekly' | 'monthly';

/**
 * Maximum diffDays (last completion → today) at which a habit streak
 * is still ALIVE (exclusive bound). Mirrors the continuation windows
 * enforced by the write path (habits PATCH H-7/H-8: a streak continues
 * while diffDays < threshold*2, resets otherwise).
 */
export const HABIT_STREAK_ALIVE_WINDOW: Record<HabitFrequency, number> = {
  daily: 2,    // completed today (0) or yesterday (1)
  weekly: 14,  // one missed full period breaks the chain
  monthly: 60, // idem
};

/**
 * Empire streaks count Madrid DAYS with ≥1 action, so they use the
 * same grace as a daily habit: alive while diffDays < 2.
 */
export const EMPIRE_STREAK_ALIVE_WINDOW = 2;

// ─── Habit streaks ─────────────────────────────────────────────

export interface HabitStreakSnapshot {
  streak: number;
  lastCompletedAt: Date | string | null;
  frequency: string;
}

/**
 * Whether a habit's stored streak is still alive: the last completion
 * must be recent enough that the user can still extend the chain in
 * the current period (today or yesterday for daily habits; inside the
 * continuation window for weekly/monthly ones).
 */
export function isHabitStreakAlive(
  lastCompletedAt: Date | string | null | undefined,
  frequency: string,
  todayKey: string = getTodayDateKey(),
): boolean {
  if (!lastCompletedAt) return false;
  const lastKey = getMadridDateKey(new Date(lastCompletedAt));
  const window =
    HABIT_STREAK_ALIVE_WINDOW[frequency as HabitFrequency] ??
    HABIT_STREAK_ALIVE_WINDOW.daily;
  return daysBetweenDateKeys(lastKey, todayKey) < window;
}

/**
 * The CURRENT streak of one habit: the stored counter while the chain
 * is alive, 0 the moment activity says otherwise. A stored value can
 * never survive its own inactivity — G-06 case "stored 20, last
 * completion 5 days ago → 0".
 */
export function currentHabitStreak(
  habit: HabitStreakSnapshot,
  todayKey: string = getTodayDateKey(),
): number {
  if (!isHabitStreakAlive(habit.lastCompletedAt, habit.frequency, todayKey)) {
    return 0;
  }
  return Math.max(0, habit.streak);
}

/**
 * Max CURRENT streak across a set of habits (the "best habit streak"
 * shown by dashboard/streaks, insights topStreak and the
 * habits_steady_14 / hidden_habit_steady_30 achievement metrics).
 */
export function currentMaxHabitStreak(
  habits: HabitStreakSnapshot[],
  todayKey: string = getTodayDateKey(),
): number {
  let max = 0;
  for (const h of habits) {
    const s = currentHabitStreak(h, todayKey);
    if (s > max) max = s;
  }
  return max;
}

// ─── Empire streaks ────────────────────────────────────────────

/**
 * The CURRENT streak of an empire, gated by the empire's last REAL
 * activity (see the per-empire source table in the header):
 *
 *   current = isAlive(lastActivity) ? storedStreak : 0
 *
 * The stored EmpireProgress.streak remains the cache of the chain
 * length (there is no better per-day record for disciplina, and it
 * avoids capping long chains to a query window); aliveness — the part
 * that used to go stale — always comes from real activity.
 */
export function gateEmpireStreak(
  storedStreak: number,
  lastActivityAt: Date | string | null | undefined,
  todayKey: string = getTodayDateKey(),
): number {
  if (!lastActivityAt) return 0;
  const lastKey = getMadridDateKey(new Date(lastActivityAt));
  if (daysBetweenDateKeys(lastKey, todayKey) >= EMPIRE_STREAK_ALIVE_WINDOW) {
    return 0;
  }
  return Math.max(0, storedStreak);
}
