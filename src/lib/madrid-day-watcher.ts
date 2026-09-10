// ═══════════════════════════════════════════
// MADRID DAY WATCHER — VitaZen
// Fires a callback when the Madrid calendar day changes.
// ═══════════════════════════════════════════
//
// N-6: day-scoped UI (today's check-in, daily challenge, streaks,
// daily progress) fetched once on mount kept showing YESTERDAY's data
// indefinitely when the page stayed open across midnight Madrid.
//
// Design constraints (N-6 spec):
//   - Europe/Madrid canonical calendar, DST-exact — the next boundary is
//     computed with startOfNextDayMadrid() (Intl-based candidate
//     verification in dates.ts), NEVER as "now + 24h". On transition days
//     a Madrid day is 23 or 25 hours long.
//   - No polling: ONE timer scheduled to the next real Madrid midnight,
//     rescheduled after each fire. A single Madrid day is ≤ 25h, far below
//     setTimeout's ~24.8-day ceiling, so no timer-chaining hacks are needed.
//   - Also covers backgrounded tabs/PWA resumes: browsers throttle timers
//     in background tabs, so the day key is re-checked whenever the page
//     becomes visible (checkNow) — a cheap date-key comparison, not a fetch.
//
// Framework-free on purpose: the rollover logic is fully unit-testable in
// node (vitest runs without jsdom); src/hooks/useMadridDayRefresh.ts is a
// thin React wrapper around this module.

import { getTodayDateKey, startOfNextDayMadrid } from '@/lib/dates';

export interface MadridDayWatcher {
  /** Stop the watcher: clears the timer and the visibility listener. */
  stop: () => void;
  /**
   * Re-check the Madrid date key immediately (e.g. on tab visibility
   * change). Fires the callback only if the key actually changed since the
   * last fire/creation. Safe to call as often as needed — it is a string
   * comparison, not a fetch.
   */
  checkNow: () => void;
}

export function watchMadridDay(
  onDayChange: (newDateKey: string) => void,
): MadridDayWatcher {
  let stopped = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  // The Madrid day this watcher currently considers "today".
  let currentKey = getTodayDateKey();

  const fire = () => {
    if (stopped) return;
    const key = getTodayDateKey();
    if (key === currentKey) return; // no real day change — nothing to do
    currentKey = key;
    try {
      onDayChange(key);
    } catch {
      // A listener error must never kill the watcher: later day changes
      // (and later listeners on the same page) still need to work.
    }
  };

  const scheduleNext = () => {
    if (stopped) return;
    // Exact UTC instant of the next Madrid midnight (22:00 or 23:00 UTC
    // depending on CET/CEST — computed, never assumed).
    const delay = Math.max(0, startOfNextDayMadrid().getTime() - Date.now());
    // 2^31 - 1 is setTimeout's hard ceiling (~24.8 days). A Madrid day is
    // at most 25h, so the cap is unreachable in practice; it only guards
    // against pathological clock changes.
    timeoutId = setTimeout(() => {
      if (stopped) return;
      fire();
      scheduleNext();
    }, Math.min(delay, 2147483647));
  };

  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      fire();
    }
  };

  scheduleNext();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return {
    stop: () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    },
    checkNow: fire,
  };
}
