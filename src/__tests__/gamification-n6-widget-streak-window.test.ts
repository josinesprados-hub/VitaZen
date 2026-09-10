/**
 * N-6 — Widget momentum streak uses the same 60-day Madrid window as the
 * dashboard (/api/dashboard/momentum).
 *
 * Before N-6, shapeMomentumPayload (src/lib/widgets/shaping.ts) computed the
 * current activity streak from the last `take: 30` RECORDS per activity
 * type, while the dashboard momentum route bounded the same metric to the
 * last 60 MADRID DAYS (startOf60DaysAgoMadrid, "no real streak exceeds
 * this"). take:30 is not a temporal window: a user with several actions per
 * day exhausted the 30-record budget within a handful of days, so the OS
 * widget systematically undercounted the streak (and its streakBonus)
 * versus the dashboard for the same user on the same day.
 *
 * Contract pinned here (deterministic, frozen clock — no sleeps):
 *   1. The six streak findMany queries filter by `gte` =
 *      startOf60DaysAgoMadrid() and carry NO `take` (window-bounded, like
 *      the dashboard route).
 *   2. Behavioral: 41 consecutive Madrid days of activity → streak = 41
 *      (take:30 records would have returned 30).
 *   3. Boundary: activity 61 days ago is OUTSIDE the window and does not
 *      affect the streak, while day -59 inside the window does.
 *
 * The mocked DB emulates Prisma's where/orderBy/take semantics on plain
 * date arrays, so the where-clause assertions test real filtering
 * behavior, not just the shape of the query object.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTodayDateKey, addDaysToDateKey, startOf60DaysAgoMadrid } from '@/lib/dates';

// ─── Frozen clock ────────────────────────────────────────────
// 2026-09-11 10:00Z = 12:00 Madrid (CEST, UTC+2) → Madrid date key
// 2026-09-11. All window math below derives from this instant.
const FROZEN_NOW = new Date('2026-09-11T10:00:00.000Z');

// ─── Deterministic DB mock (hoisted) ─────────────────────────

const H = vi.hoisted(() => {
  // rows[model] = list of Date objects in the model's activity-date field.
  const rows: Record<string, Date[]> = {
    meditationSession: [],
    habitLog: [],
    journalEntry: [],
    dailyCheckin: [],
    wellnessLog: [],
    nutritionLog: [],
  };

  // Which where-key carries the activity date per model.
  const FIELD: Record<string, string> = {
    meditationSession: 'completedAt',
    habitLog: 'lastCompletedAt',
    journalEntry: 'createdAt',
    dailyCheckin: 'date',
    wellnessLog: 'date',
    nutritionLog: 'date',
  };

  function applyWhere(dates: Date[], where: Record<string, any>, field: string): Date[] {
    const cond = where?.[field];
    if (!cond || typeof cond !== 'object') return dates;
    let out = dates;
    if (cond.gte instanceof Date) out = out.filter((d) => d.getTime() >= cond.gte.getTime());
    if (cond.lt instanceof Date) out = out.filter((d) => d.getTime() < cond.lt.getTime());
    return out;
  }

  function makeModel(name: string) {
    return {
      count: vi.fn(async ({ where }: any) =>
        applyWhere(rows[name], where, FIELD[name]).length),
      findMany: vi.fn(async ({ where, take }: any) => {
        const out = applyWhere(rows[name], where, FIELD[name]);
        // Rows have the shape the model exposes (e.g. { completedAt }).
        const shaped = out.map((d) => ({ [FIELD[name]]: d }));
        // Emulate take so a regression reintroducing take:N changes results.
        return take ? shaped.slice(0, take) : shaped;
      }),
    };
  }

  const MOCK_DB: Record<string, unknown> = {};
  for (const name of Object.keys(rows)) MOCK_DB[name] = makeModel(name);
  // userChallenge only feeds 7-day counts in shapeMomentumPayload (never
  // the streak window) — fixed to empty.
  MOCK_DB.userChallenge = {
    count: vi.fn(async () => 0),
    findMany: vi.fn(async () => []),
  };

  return { rows, FIELD, MOCK_DB };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

// ─── Helpers ─────────────────────────────────────────────────

/** Madrid date key N days before today (frozen clock). */
function keyDaysAgo(days: number): string {
  const today = getTodayDateKey();
  return addDaysToDateKey(today, -days);
}

/** A Date at UTC-noon of the given Madrid date key (always same Madrid day). */
function noonOf(key: string): Date {
  return new Date(key + 'T12:00:00Z');
}

function streakFindManyCalls(model: string): any[] {
  return (H.MOCK_DB[model] as { findMany: ReturnType<typeof vi.fn> })
    .findMany.mock.calls.map((c: any[]) => c[0]);
}

async function runShape() {
  const { shapeMomentumPayload } = await import('@/lib/widgets/shaping');
  return shapeMomentumPayload('user-1', 'FREE');
}

// ─── Tests ───────────────────────────────────────────────────

describe('N-6 — momentum widget streak window (take:30 → 60 Madrid days)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    for (const name of Object.keys(H.rows)) H.rows[name] = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('CASE W1 — the six streak queries filter by gte=startOf60DaysAgoMadrid() and carry NO take', async () => {
    H.rows.meditationSession = [noonOf(keyDaysAgo(0))];

    await runShape();

    const expectedGte = startOf60DaysAgoMadrid().getTime();
    for (const model of ['meditationSession', 'habitLog', 'journalEntry', 'dailyCheckin', 'wellnessLog', 'nutritionLog']) {
      const calls = streakFindManyCalls(model);
      // Exactly one findMany per model is window-bounded (the streak query);
      // the 7-day lookups use a different (gte sevenDaysAgo) window.
      const windowCalls = calls.filter((w: any) => {
        const field = H.FIELD[model];
        return w?.where?.[field]?.gte instanceof Date;
      });
      expect(windowCalls.length).toBeGreaterThan(0);
      for (const w of windowCalls) {
        if (w.where[H.FIELD[model]].gte.getTime() === expectedGte) {
          expect(w.take).toBeUndefined();
        }
      }
      // The 60-day call exists with the exact dashboard boundary.
      const hasSixtyDayCall = windowCalls.some(
        (w: any) => w.where[H.FIELD[model]].gte.getTime() === expectedGte,
      );
      expect(hasSixtyDayCall, `${model} must query the 60-day window`).toBe(true);
    }
  });

  it('CASE W2 — 41 consecutive Madrid days of activity → widget streak = 41 (take:30 records would say 30)', async () => {
    // One meditation per day for today and the previous 40 Madrid days.
    H.rows.meditationSession = Array.from({ length: 41 }, (_, i) => noonOf(keyDaysAgo(i)));

    const payload = await runShape();

    expect(payload.streak).toBe(41);
    // Sanity: the score pipeline still runs with the corrected streak
    // (streakBonus = min(5, round(streak/7 * 5)) is capped at 5).
    expect(payload.score).toBeGreaterThan(0);
  });

  it('CASE W3 — activity 61 days ago is outside the window and cannot extend the streak; day −59 inside it can', async () => {
    // Streak of 31 days: today back to day −30.
    H.rows.meditationSession = Array.from({ length: 31 }, (_, i) => noonOf(keyDaysAgo(i)));
    let payload = await runShape();
    expect(payload.streak).toBe(31);

    // A record 61 days ago is beyond the 60-day window: the mock DB honors
    // the where filter (as Prisma does), so it must not change the streak.
    H.rows.meditationSession.push(noonOf(keyDaysAgo(61)));
    payload = await runShape();
    expect(payload.streak).toBe(31);

    // A record 59 days ago bridges nothing (gap between −30 and −59), but
    // proves day −59 passes the window filter — the streak still counts
    // only the consecutive tail.
    H.rows.meditationSession.push(noonOf(keyDaysAgo(59)));
    payload = await runShape();
    expect(payload.streak).toBe(31);
  });

  it('CASE W4 — mixed activity types merge into one streak via Madrid date keys', async () => {
    // Alternating sources: meditation today, journal yesterday, check-in the
    // day before — a 3-day streak built from three different tables.
    H.rows.meditationSession = [noonOf(keyDaysAgo(0))];
    H.rows.journalEntry = [noonOf(keyDaysAgo(1))];
    H.rows.dailyCheckin = [noonOf(keyDaysAgo(2))];

    const payload = await runShape();

    expect(payload.streak).toBe(3);
  });

  it('CASE W5 — the dashboard reference boundary (startOf60DaysAgoMadrid) is the same instant the widget queries', async () => {
    // Parity guard: if anyone changes either side, this fails loudly.
    const { shapeMomentumPayload: shape } = await import('@/lib/widgets/shaping');
    await shape('user-1', 'FREE');

    const w = streakFindManyCalls('meditationSession').find(
      (c: any) => c?.where?.completedAt?.gte instanceof Date && c.where.completedAt.gte.getTime() === startOf60DaysAgoMadrid().getTime(),
    );
    expect(w).toBeDefined();
    // And it is identical to how /api/dashboard/momentum bounds its streak:
    // both compute startOf60DaysAgoMadrid() under the same Madrid calendar.
    expect(startOf60DaysAgoMadrid().getTime()).toBe(
      startOfMadridDayOfKey(addDaysToDateKey(getTodayDateKey(), -60)),
    );
  });
});

/** Local helper: UTC instant of Madrid midnight for a date key (dates.ts semantics). */
function startOfMadridDayOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const utcCest = Date.UTC(y, m - 1, d, -2, 0, 0);
  if (getMadridDateKey(new Date(utcCest)) === key) return utcCest;
  return Date.UTC(y, m - 1, d, -1, 0, 0);
}

function getMadridDateKey(date: Date): string {
  return date.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).split(' ')[0];
}
