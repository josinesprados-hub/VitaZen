// ═════════════════════════════════════════════════════════════════════
// VITAZEN — UNIFIED DATE/TIME UTILITY
// ═════════════════════════════════════════════════════════════════════
//
// Single source of truth for ALL temporal logic in VitaZen.
//
// Every module (Dashboard, Insights, Observaciones, Memoria de Vida,
// Cierre Mensual, Mentor IA, Check-in, Hábitos, Estados Emocionales,
// Notificaciones, Patrones, Widgets, Cron Jobs, Analytics) MUST
// consume these functions. No ad-hoc date arithmetic. No raw new Date()
// for business logic. No duplicated timezone offset calculations.
//
// TIMEZONE: Europe/Madrid (VitaZen's primary market)
// - Correctly handles CET (UTC+1) and CEST (UTC+2) transitions
// - Uses Intl.DateTimeFormat with timeZone option (no manual offsets)
// - The `sv-SE` locale natively produces YYYY-MM-DD format
//
// DESIGN PRINCIPLES:
// - All boundaries are computed as UTC Date objects representing
//   the exact instant a Madrid calendar period begins/ends.
// - This makes them directly usable in Prisma `gte`/`lt` queries.
// - No `date-fns` dependency — uses only built-in Intl API.
// ═════════════════════════════════════════════════════════════════════

// ─── Constants ─────────────────────────────────────────────────

const MADRID_TZ = 'Europe/Madrid' as const;
const MS_PER_DAY = 86400000;

// ─── Core: Date Key Conversion ────────────────────────────────

/**
 * Format any Date as YYYY-MM-DD in Europe/Madrid timezone.
 * Works in both Node.js (server) and modern browsers (client).
 */
export function getMadridDateKey(date: Date): string {
  const madridStr = date.toLocaleString('sv-SE', { timeZone: MADRID_TZ });
  return madridStr.split(' ')[0];
}

/**
 * Format current instant as YYYY-MM-DD in Europe/Madrid timezone.
 * This is the user's perceived "today".
 */
export function getTodayDateKey(): string {
  return getMadridDateKey(new Date());
}

// ─── Core: Madrid Day Boundaries as UTC Instants ──────────────

/**
 * Compute the UTC instant of midnight (00:00:00) in Madrid
 * for a given Madrid date key (YYYY-MM-DD).
 *
 * Algorithm (no noon-UTC reference):
 * Madrid has exactly two possible UTC offsets:
 *   CET  = UTC+1 → midnight Madrid = 23:00 UTC (previous day)
 *   CEST = UTC+2 → midnight Madrid = 22:00 UTC (previous day)
 * We compute both candidates and verify which one(s) map back
 * to the target dateKey using getMadridDateKey.
 * On normal days only one verifies; on the October DST transition
 * (25-hour day) both verify — we pick the earlier (22:00 UTC),
 * which is the true midnight. On the March DST transition (23-hour
 * day), only CET (23:00 UTC) verifies.
 */
export function startOfMadridDay(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);

  // Two candidates for midnight Madrid in UTC:
  //   CEST (UTC+2): midnight = 22:00 UTC previous day
  //   CET  (UTC+1): midnight = 23:00 UTC previous day
  // Date.UTC normalizes negative hours across day/month/year boundaries.
  const utcCest = Date.UTC(year, month - 1, day, -2, 0, 0);
  const utcCet  = Date.UTC(year, month - 1, day, -1, 0, 0);

  // Verify: which candidate, when formatted in Madrid, gives dateKey?
  // On October DST day both verify; we pick CEST (earlier = true midnight).
  // On normal days only the correct offset verifies.
  if (getMadridDateKey(new Date(utcCest)) === dateKey) return new Date(utcCest);
  return new Date(utcCet);
}

/**
 * Compute the UTC instant of midnight in Madrid for the start
 * and end of a given Madrid calendar day.
 */
export function madridDayBoundaries(dateKey: string): { start: Date; end: Date } {
  const start = startOfMadridDay(dateKey);
  return { start, end: new Date(start.getTime() + MS_PER_DAY) };
}

/**
 * Compute the UTC instant of midnight in Madrid for TODAY.
 */
export function startOfTodayMadrid(): Date {
  return startOfMadridDay(getTodayDateKey());
}

/**
 * Compute the UTC instant of midnight in Madrid for TOMORROW.
 * Used for daily limit resets (e.g., AI usage).
 */
export function startOfNextDayMadrid(): Date {
  const todayKey = getTodayDateKey();
  const [y, m, d] = todayKey.split('-').map(Number);
  // Build tomorrow's date key (handles month/year rollover via Date arithmetic)
  const tomorrowDate = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  const tomorrowKey = getMadridDateKey(tomorrowDate);
  return startOfMadridDay(tomorrowKey);
}

// ─── Week Boundaries ──────────────────────────────────────────

/**
 * Get the Madrid date key for N days ago from today.
 * Uses Madrid calendar, not UTC rolling subtraction.
 */
export function madridDaysAgo(days: number): string {
  const todayNoon = new Date(getTodayDateKey() + 'T12:00:00Z');
  return getMadridDateKey(new Date(todayNoon.getTime() - days * MS_PER_DAY));
}

/**
 * Get the UTC instant of midnight in Madrid for N days ago.
 * Useful as a Prisma query boundary.
 */
export function startOfMadridDaysAgo(days: number): Date {
  return startOfMadridDay(madridDaysAgo(days));
}

/**
 * Get the UTC instant of midnight in Madrid for exactly 7 days ago.
 */
export function startOf7DaysAgoMadrid(): Date {
  return startOfMadridDaysAgo(7);
}

/**
 * Get the UTC instant of midnight in Madrid for exactly 14 days ago.
 */
export function startOf14DaysAgoMadrid(): Date {
  return startOfMadridDaysAgo(14);
}

/**
 * Get the UTC instant of midnight in Madrid for exactly 30 days ago.
 */
export function startOf30DaysAgoMadrid(): Date {
  return startOfMadridDaysAgo(30);
}

/**
 * Get the UTC instant of midnight in Madrid for exactly 60 days ago.
 */
export function startOf60DaysAgoMadrid(): Date {
  return startOfMadridDaysAgo(60);
}

/**
 * Get the UTC instant of midnight in Madrid for exactly 90 days ago.
 */
export function startOf90DaysAgoMadrid(): Date {
  return startOfMadridDaysAgo(90);
}

// ─── Month Boundaries ─────────────────────────────────────────

/**
 * Compute the UTC instant of midnight in Madrid on the first
 * day of the given month.
 *
 * @param year  Full year (e.g., 2025)
 * @param month 1-based month (1 = January, 12 = December)
 */
export function startOfMadridMonth(year: number, month: number): Date {
  const noonUtc = Date.UTC(year, month - 1, 1, 12, 0, 0);
  const madridStr = new Date(noonUtc).toLocaleString('sv-SE', { timeZone: MADRID_TZ });
  const timePart = madridStr.split(' ')[1];
  const [hours, minutes, seconds] = timePart.split(':').map(Number);
  const msSinceMadridMidnight = (hours * 3600 + minutes * 60 + seconds) * 1000;
  return new Date(noonUtc - msSinceMadridMidnight);
}

/**
 * Get the start and end (exclusive) UTC instants for a given
 * month in Madrid timezone.
 *
 * @param yyyyMM Month string in "YYYY-MM" format
 */
export function getMadridMonthRange(yyyyMM: string): { start: Date; end: Date } {
  const [year, month] = yyyyMM.split('-').map(Number);
  const start = startOfMadridMonth(year, month);
  const end = startOfMadridMonth(year, month + 1);
  return { start, end };
}

/**
 * Get the current month key in Madrid timezone (e.g., "2025-07").
 */
export function getCurrentMonthKey(): string {
  return getTodayDateKey().slice(0, 7);
}

/**
 * Get the previous month key relative to today in Madrid timezone.
 */
export function getPreviousMonthKey(): string {
  const todayKey = getTodayDateKey();
  const [yearStr, monthStr] = todayKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Get the day of month from today's Madrid date key.
 */
export function getMadridDayOfMonth(): number {
  return parseInt(getTodayDateKey().split('-')[2], 10);
}

// ─── Week Key (ISO 8601) ──────────────────────────────────────

/**
 * Compute the ISO 8601 week key for a date in Madrid timezone.
 * Format: "2025-W22"
 *
 * Uses Madrid calendar date (not UTC) to determine the week,
 * so week boundaries align with the user's perceived day.
 */
export function getMadridWeekKey(date?: Date): string {
  const d = date || new Date();
  const madridDateStr = getMadridDateKey(d); // "YYYY-MM-DD"
  const utcDate = new Date(madridDateStr + 'T12:00:00Z'); // noon UTC avoids boundary issues

  // ISO 8601 week number calculation
  const dayOfWeek = utcDate.getUTCDay() || 7; // Sunday = 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayOfWeek);
  const isoYear = utcDate.getUTCFullYear();

  const jan1 = new Date(Date.UTC(isoYear, 0, 1));
  const dayOfYear = Math.floor((utcDate.getTime() - jan1.getTime()) / MS_PER_DAY) + 1;
  const weekNo = Math.ceil(dayOfYear / 7);

  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── Year ─────────────────────────────────────────────────────

/**
 * Get the current year in Madrid timezone.
 */
export function getMadridYear(): number {
  return parseInt(getTodayDateKey().split('-')[0], 10);
}

// ─── Formatting ───────────────────────────────────────────────

/**
 * Safely parse a date string and format it.
 * Returns the fallback string if the input is null, undefined, or invalid.
 *
 * ROOT CAUSE of "Invalid Date" UI bug: Multiple pages call
 * `new Date(dateStr).toLocaleDateString(...)` without guarding against
 * null/undefined/invalid strings. If the API returns a null field or
 * a corrupted date string, JavaScript renders "Invalid Date" literally.
 *
 * Usage: replace raw `new Date(x).toLocaleDateString(...)` calls with
 *   safeFormatDate(x) or safeFormatTime(x).
 */
function isValidDate(d: Date): boolean {
  return d instanceof Date && !isNaN(d.getTime());
}

export function safeFormatDate(
  dateStr: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  fallback: string = '—',
): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (!isValidDate(d)) return fallback;
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  });
}

export function safeFormatTime(
  dateStr: string | null | undefined,
  fallback: string = '—',
): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (!isValidDate(d)) return fallback;
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function safeFormatDateShort(
  dateStr: string | null | undefined,
  fallback: string = '—',
): string {
  if (!dateStr) return fallback;
  const d = new Date(dateStr);
  if (!isValidDate(d)) return fallback;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/**
 * Format a date for display in Spanish, using Madrid timezone.
 */
export function formatMadridDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    timeZone: MADRID_TZ,
    ...options,
  };
  return date.toLocaleDateString('es-ES', defaultOptions);
}

/**
 * Get the month name in Spanish for a given month key.
 */
const MONTH_NAMES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
};

export function getMonthName(month: number): string {
  return MONTH_NAMES[month] || '';
}

export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number);
  return `${getMonthName(month)} ${year}`;
}

// ─── Date Key Arithmetic ──────────────────────────────────────

/**
 * Given a Madrid date key (YYYY-MM-DD), return the date key
 * for N days before or after.
 *
 * Uses the T12:00:00Z technique to avoid crossing a day boundary
 * due to timezone offset differences between the two dates.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const noonUtc = new Date(dateKey + 'T12:00:00Z');
  return getMadridDateKey(new Date(noonUtc.getTime() + days * MS_PER_DAY));
}

/**
 * Compute the number of calendar days between two Madrid date keys.
 * Always returns a non-negative integer.
 */
export function daysBetweenDateKeys(a: string, b: string): number {
  const msA = new Date(a + 'T12:00:00Z').getTime();
  const msB = new Date(b + 'T12:00:00Z').getTime();
  return Math.abs(Math.round((msA - msB) / MS_PER_DAY));
}

// ─── Streak Calculation ───────────────────────────────────────

/**
 * Calculate the current consecutive-day streak from a set of
 * Madrid date keys.
 *
 * Walks backwards from today (or yesterday if no activity today)
 * counting consecutive days that exist in the set.
 *
 * This replaces 4+ duplicate streak implementations across
 * the codebase.
 */
export function calcStreakFromKeys(activeDays: Set<string>): number {
  if (activeDays.size === 0) return 0;

  let checkDateStr = getTodayDateKey();
  if (!activeDays.has(checkDateStr)) {
    checkDateStr = addDaysToDateKey(checkDateStr, -1);
  }

  let streak = 0;
  while (activeDays.has(checkDateStr)) {
    streak++;
    checkDateStr = addDaysToDateKey(checkDateStr, -1);
  }

  return streak;
}

/**
 * Calculate the current consecutive-day streak from an array of Dates.
 * Normalizes to Madrid date keys first.
 */
export function calcStreak(dates: Date[]): number {
  const activeDays = new Set<string>();
  for (const d of dates) {
    activeDays.add(getMadridDateKey(new Date(d)));
  }
  return calcStreakFromKeys(activeDays);
}

// ─── Past Months ──────────────────────────────────────────────

/**
 * Get the last N months before the current month in Madrid timezone.
 * Returns them in chronological order (oldest first).
 */
export function getPastMonthKeys(count: number = 6): string[] {
  const months: string[] = [];
  const todayKey = getTodayDateKey();
  const [currentYear, currentMonth] = todayKey.split('-').map(Number);
  for (let i = 1; i <= count; i++) {
    const monthIndex = currentMonth - i;
    const year = currentYear + Math.floor((monthIndex - 1) / 12);
    const month = ((monthIndex - 1) % 12 + 12) % 12 + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months.reverse();
}

// ─── Re-exports for backward compatibility ─────────────────────
// These allow a gradual migration: files that import from
// deterministic.ts can continue to do so, and we update
// deterministic.ts to re-export from here.

export {
  deterministicHash,
  deterministicIndex,
  deterministicShuffle,
  deterministicWeightedSelect,
} from './deterministic';