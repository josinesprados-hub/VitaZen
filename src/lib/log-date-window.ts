// ═════════════════════════════════════════════════════════════════════
// VITAZEN — Log Date Window Policy (G-02 FIX, FASE 14)
// ═════════════════════════════════════════════════════════════════════
//
// Approved backdating policy for NEW wellness/nutrition writes:
//   - Today                → allowed
//   - Yesterday            → allowed
//   - Day before yesterday → allowed
//   - More than 2 days back → rejected
//   - Any future date       → rejected
//
// Previously the client could send arbitrary dates, which allowed
// farming historical XP, historical activity and artificial streaks.
//
// Scope: this check gates NEW creates only (POST). It never deletes,
// modifies or recalculates historical records, XP or streaks, and it
// does not affect reads (GET) or content updates (PUT).
//
// Timezone: all inputs are Europe/Madrid date keys (YYYY-MM-DD) as
// produced by getMadridDateKey()/getTodayDateKey() — the single source
// of truth for temporal logic (src/lib/dates.ts). No second timezone
// source is introduced: day arithmetic uses daysBetweenDateKeys(),
// which is DST-safe (noon-UTC technique).
// ═════════════════════════════════════════════════════════════════════

import { daysBetweenDateKeys } from './dates';

/** Maximum number of days a NEW log may be backdated (inclusive). */
export const MAX_LOG_DATE_DAYS_BACK = 2;

export type LogDateWindowResult =
  | { ok: true }
  | { ok: false; reason: 'future' | 'too_old' };

/**
 * Check whether a client-provided log date is inside the approved
 * window for NEW writes.
 *
 * @param logDateKey  Madrid date key (YYYY-MM-DD) of the log date.
 * @param todayKey    Madrid date key (YYYY-MM-DD) of "now".
 */
export function checkLogDateWindow(
  logDateKey: string,
  todayKey: string,
): LogDateWindowResult {
  // ISO YYYY-MM-DD keys compare lexicographically = chronologically.
  if (logDateKey > todayKey) {
    return { ok: false, reason: 'future' };
  }
  if (daysBetweenDateKeys(logDateKey, todayKey) > MAX_LOG_DATE_DAYS_BACK) {
    return { ok: false, reason: 'too_old' };
  }
  return { ok: true };
}
