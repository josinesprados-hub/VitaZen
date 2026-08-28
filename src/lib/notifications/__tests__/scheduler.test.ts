// ═══════════════════════════════════════════════════════════════
// PROD-02 — computeQuietHoursExit() unit tests
// VitaZen FASE 12-P1-A
//
// Self-contained: copies the pure functions under test so that
// no @prisma/client import is needed (prisma client not generated
// in this environment).
//
// All tests use deterministic `now` values.
// No reliance on the system clock.
// ═══════════════════════════════════════════════════════════════

import { describe, test, expect } from 'bun:test';

// ── Functions under test (copied from scheduler.ts) ─────────
// These MUST stay in sync with the production implementation.

function isInQuietHours(
  now: Date,
  startStr: string,
  endStr: string,
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
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
}

function resolveLocalToUTC(
  dateStr: string,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const candidate = new Date(`${dateStr}T${pad2(hour)}:${pad2(minute)}:00Z`);
  const tzFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: 'numeric', hour12: false,
  });
  const parts = tzFmt.formatToParts(candidate);
  const pYear   = parseInt(parts.find(p => p.type === 'year')!.value, 10);
  const pMonth  = parseInt(parts.find(p => p.type === 'month')!.value, 10);
  const pDay    = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  const pHour   = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const pMinute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const wantedMs = new Date(
    parseInt(dateStr.slice(0, 4), 10),
    parseInt(dateStr.slice(5, 7), 10) - 1,
    parseInt(dateStr.slice(8, 10), 10),
    hour, minute, 0, 0,
  ).getTime();
  const actualMs = new Date(pYear, pMonth - 1, pDay, pHour, pMinute, 0, 0).getTime();
  const correction = wantedMs - actualMs;
  return new Date(candidate.getTime() + correction);
}

function computeQuietHoursExit(
  now: Date,
  endStr: string,
  timezone: string,
): Date {
  try {
    const [endH, endM] = endStr.split(':').map(Number);
    const endMinutes = endH * 60 + endM;
    const timeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric', minute: 'numeric', hour12: false,
    });
    const timeParts = timeFmt.formatToParts(now);
    const curH = parseInt(timeParts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const curM = parseInt(timeParts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const curMinutes = curH * 60 + curM;
    const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    const todayStr = dateFmt.format(now);
    const needTomorrow = curMinutes >= endMinutes;
    let targetDateStr: string;
    if (needTomorrow) {
      const [ty, tm, td] = todayStr.split('-').map(Number);
      const nextDay = new Date(ty, tm - 1, td + 1);
      const ny = nextDay.getFullYear();
      const nm = String(nextDay.getMonth() + 1).padStart(2, '0');
      const nd = String(nextDay.getDate()).padStart(2, '0');
      targetDateStr = `${ny}-${nm}-${nd}`;
    } else {
      targetDateStr = todayStr;
    }
    return resolveLocalToUTC(targetDateStr, endH, endM, timezone);
  } catch {
    const [endH, endM] = endStr.split(':').map(Number);
    return new Date(now.getTime() + ((endH + 1) * 60 + endM) * 60 * 1000);
  }
}

// ── Helpers ────────────────────────────────────────────────

function utcDate(iso: string): Date {
  return new Date(iso);
}

function expectLocalTime(
  result: Date,
  timezone: string,
  expectedHour: number,
  expectedMinute: number,
  expectedDateStr?: string,
): void {
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric', minute: 'numeric', hour12: false,
  });
  const localDate = dateFmt.format(result);
  const parts = timeFmt.formatToParts(result);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  expect(h).toBe(expectedHour);
  expect(m).toBe(expectedMinute);
  if (expectedDateStr) {
    expect(localDate).toBe(expectedDateStr);
  }
}

// ── Test suite ─────────────────────────────────────────────

describe('computeQuietHoursExit', () => {

  // ─── 1. Midnight crossing: 22:00 → 08:00, Europe/Madrid ───

  test('22→08 Madrid: 23:00 local → exit 08:00 next day', () => {
    // 2025-01-15 22:00 UTC = 23:00 Madrid (CET, UTC+1)
    const now = utcDate('2025-01-15T22:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 8, 0, '2025-01-16');
    // Verify it is NOT 10 hours after now
    const tenHoursLater = new Date(now.getTime() + 10 * 60 * 60 * 1000);
    expect(Math.abs(result.getTime() - tenHoursLater.getTime())).toBeGreaterThan(30 * 60 * 1000);
  });

  test('22→08 Madrid: 07:00 local → exit 08:00 same day', () => {
    // 2025-01-16 06:00 UTC = 07:00 Madrid (CET, UTC+1)
    const now = utcDate('2025-01-16T06:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 8, 0, '2025-01-16');
  });

  test('22→08 Madrid: 00:30 local → exit 08:00 same day', () => {
    // 2025-01-16 00:30 CET = 2025-01-15T23:30:00Z
    const now = utcDate('2025-01-15T23:30:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 8, 0, '2025-01-16');
  });

  // ─── 2. 23:00 → 07:00 midnight crossing ───

  test('23→07 Madrid: 23:30 local → exit 07:00 next day', () => {
    // 2025-01-15 22:30 UTC = 23:30 CET
    const now = utcDate('2025-01-15T22:30:00Z');
    const result = computeQuietHoursExit(now, '07:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 7, 0, '2025-01-16');
  });

  test('23→07 Madrid: 06:45 local → exit 07:00 same day', () => {
    // 2025-01-16 05:45 UTC = 06:45 CET
    const now = utcDate('2025-01-16T05:45:00Z');
    const result = computeQuietHoursExit(now, '07:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 7, 0, '2025-01-16');
  });

  // ─── 3. Same-day window: 14:00 → 15:00 (NOT 10 hours!) ───

  test('14→15 Madrid: 14:30 local → exit 15:00 same day (NOT 10h later)', () => {
    // 2025-01-16 13:30 UTC = 14:30 CET
    const now = utcDate('2025-01-16T13:30:00Z');
    const result = computeQuietHoursExit(now, '15:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 15, 0, '2025-01-16');

    // CRITICAL: verify it is NOT 10 hours later
    const tenHoursLater = new Date(now.getTime() + 10 * 60 * 60 * 1000);
    const diffMs = Math.abs(result.getTime() - tenHoursLater.getTime());
    expect(diffMs).toBeGreaterThan(8 * 60 * 60 * 1000);

    // Verify it's approximately 30 minutes after now, not 10 hours
    const expectedDeltaMs = 30 * 60 * 1000;
    const actualDeltaMs = result.getTime() - now.getTime();
    expect(Math.abs(actualDeltaMs - expectedDeltaMs)).toBeLessThan(60 * 1000);
  });

  // ─── 4. UTC timezone ───

  test('22→08 UTC: 23:00 UTC → exit 08:00 next day', () => {
    const now = utcDate('2025-06-01T23:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'UTC');
    expectLocalTime(result, 'UTC', 8, 0, '2025-06-02');
  });

  test('22→08 UTC: 07:00 UTC → exit 08:00 same day', () => {
    const now = utcDate('2025-06-01T07:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'UTC');
    expectLocalTime(result, 'UTC', 8, 0, '2025-06-01');
  });

  // ─── 5. America/New_York (DST) ───

  test('22→08 NewYork winter (EST UTC-5): 23:00 local → exit 08:00 next day', () => {
    // 2025-01-15 23:00 EST = 2025-01-16T04:00:00Z
    const now = utcDate('2025-01-16T04:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'America/New_York');
    expectLocalTime(result, 'America/New_York', 8, 0, '2025-01-16');
  });

  test('22→08 NewYork summer (EDT UTC-4): 23:00 local → exit 08:00 next day', () => {
    // 2025-07-15 23:00 EDT = 2025-07-16T03:00:00Z
    const now = utcDate('2025-07-16T03:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'America/New_York');
    expectLocalTime(result, 'America/New_York', 8, 0, '2025-07-16');
  });

  // ─── 6. DST spring-forward: Europe/Madrid ───

  test('DST spring-forward Madrid: quiet hours end 08:00 on DST change day', () => {
    // 2025-03-30 00:00 CET = 2025-03-29T23:00:00Z (before DST change)
    const now = utcDate('2025-03-29T23:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 8, 0, '2025-03-30');
  });

  test('DST spring-forward Madrid: quiet hours end 08:00 AFTER the change', () => {
    // 2025-03-30 04:00 CEST = 2025-03-30T02:00:00Z
    const now = utcDate('2025-03-30T02:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 8, 0, '2025-03-30');
  });

  // ─── 7. DST fall-back: America/New_York ───

  test('DST fall-back NewYork: quiet hours end 08:00 on fall-back day', () => {
    // 2025-11-02 03:00 EST = 2025-11-02T08:00:00Z
    const now = utcDate('2025-11-02T08:00:00Z');
    const result = computeQuietHoursExit(now, '08:00', 'America/New_York');
    expectLocalTime(result, 'America/New_York', 8, 0, '2025-11-02');
  });

  // ─── 8. `now` is the authoritative time reference ───

  test('uses now parameter, not Date.now()', () => {
    const now = utcDate('2020-03-15T22:30:00Z'); // 23:30 CET
    const result = computeQuietHoursExit(now, '08:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 8, 0, '2020-03-16');
    expect(result.getFullYear()).toBe(2020);
  });

  // ─── 9. Edge: end time at 00:00 (midnight) ───

  test('endStr 00:00: before midnight → tomorrow 00:00', () => {
    const now = utcDate('2025-06-01T23:30:00Z');
    const result = computeQuietHoursExit(now, '00:00', 'UTC');
    expectLocalTime(result, 'UTC', 0, 0, '2025-06-02');
  });

  // ─── 10. Consistency with isInQuietHours ───

  test('is consistent with isInQuietHours for 22→08', () => {
    const now = utcDate('2025-01-16T03:00:00Z'); // 04:00 CET
    expect(isInQuietHours(now, '22:00', '08:00', 'Europe/Madrid')).toBe(true);
    const exit = computeQuietHoursExit(now, '08:00', 'Europe/Madrid');
    expectLocalTime(exit, 'Europe/Madrid', 8, 0);
    expect(exit.getTime()).toBeGreaterThan(now.getTime());
  });

  test('is consistent with isInQuietHours for 14→15', () => {
    const now = utcDate('2025-01-16T13:30:00Z'); // 14:30 CET
    expect(isInQuietHours(now, '14:00', '15:00', 'Europe/Madrid')).toBe(true);
    const exit = computeQuietHoursExit(now, '15:00', 'Europe/Madrid');
    expectLocalTime(exit, 'Europe/Madrid', 15, 0);
    expect(exit.getTime()).toBeGreaterThan(now.getTime());
  });

  // ─── 11. 23→07 produces next day correctly ───

  test('23→07: 23:00 local produces exit on the NEXT day', () => {
    const now = utcDate('2025-02-10T22:00:00Z'); // 23:00 CET
    const result = computeQuietHoursExit(now, '07:00', 'Europe/Madrid');
    expectLocalTime(result, 'Europe/Madrid', 7, 0, '2025-02-11');
    const todayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });
    const todayStr = todayFmt.format(now);
    const resultDateStr = todayFmt.format(result);
    expect(resultDateStr).not.toBe(todayStr);
  });

  // ─── 12. Asia/Tokyo (UTC+9, no DST) ───

  test('22→08 Tokyo: 23:00 JST → exit 08:00 next day', () => {
    const now = utcDate('2025-06-01T14:00:00Z'); // 23:00 JST
    const result = computeQuietHoursExit(now, '08:00', 'Asia/Tokyo');
    expectLocalTime(result, 'Asia/Tokyo', 8, 0, '2025-06-02');
  });

  test('22→08 Tokyo: 07:00 JST → exit 08:00 same day', () => {
    const now = utcDate('2025-05-31T22:00:00Z'); // 07:00 JST
    const result = computeQuietHoursExit(now, '08:00', 'Asia/Tokyo');
    expectLocalTime(result, 'Asia/Tokyo', 8, 0, '2025-06-01');
  });
});
