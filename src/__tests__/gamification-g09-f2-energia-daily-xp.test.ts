/**
 * G-09 — F-2: Energía XP is capped at +10 per user and Madrid natural day
 * across WellnessLog AND NutritionLog (cross-module), even when a manipulated
 * client sends different timestamps of the SAME Europe/Madrid day.
 *
 * Original defect (found by the G-09 temporal audit at 1266e69):
 *   `@@unique([userId, date])` on WellnessLog/NutritionLog is an INSTANT-based
 *   key. The POST routes awarded +10 XP to `energia` on every create path, so
 *   two instants of the same Madrid day (e.g. 10:00Z and 11:00Z in September,
 *   both → the same natural day) created two rows and paid +10 XP each.
 *
 * Fix (this commit): the XP payout is gated by the SAME cross-module
 * `isFirstEnergiaLogToday` flag that already drove the streak — computed
 * inside the advisory-locked transaction `user|energia|<logDateKey>`:
 *     first energia log of the Madrid day  → +10 XP
 *     every later log of the same day      →  +0 XP (row still saved)
 * DELETE reverts become day-coherent: the day's +10 is only reverted when the
 * log's Madrid day is left with NO other energia log (mirrors G-03 finance).
 *
 * Test strategy (identical to gamification-g03/gamification-xp-farming):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   fire-and-forget side effects.
 * - getTodayDateKey is mocked (mutable state) at BOTH specifier paths
 *   (@/lib/dates and @/lib/deterministic) — the relative re-export inside
 *   deterministic.ts must not bypass the mock. getMadridDateKey and
 *   madridDayBoundaries remain REAL (Europe/Madrid via Intl).
 * - "Concurrency" tests model the serialized outcome the advisory lock
 *   guarantees at DB level: the second transaction observes the first log
 *   and therefore awards +0 XP. The advisory-lock invocation is asserted
 *   per request, including the shared `user|energia|<day>` key across the
 *   Wellness↔Nutrition pair.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMadridDateKey, madridDayBoundaries } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic route tests ────

const DAY_1 = '2026-09-07';
const DAY_2 = '2026-09-08';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});
  const empireProgressFindUnique = vi.fn().mockResolvedValue(null);
  const empireProgressUpdate = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    wellnessLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
    nutritionLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
      findUnique: empireProgressFindUnique,
      update: empireProgressUpdate,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    wellnessLog: {
      // DELETE ownership lookup happens before the transaction.
      findUnique: vi.fn().mockResolvedValue(null),
    },
    nutritionLog: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
    empireProgressFindUnique,
    empireProgressUpdate,
    getAuthUserBasicMock,
    rateLimitMock,
    evaluateAchievementsMock,
  };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
  getAuthUserBasic: H.getAuthUserBasicMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: H.rateLimitMock,
  RATE_LIMITS: {},
  rateLimitedResponse: vi.fn(),
}));

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

// Mock ONLY "today" (mutable so day-change tests can advance the clock);
// keep the real Madrid conversion utilities.
vi.mock('@/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dates')>();
  return {
    ...actual,
    getTodayDateKey: () => H.state.todayKey,
  };
});

vi.mock('@/lib/deterministic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deterministic')>();
  return {
    ...actual,
    getTodayDateKey: () => H.state.todayKey,
  };
});

// ─── Helpers ─────────────────────────────────────────────────

function makeRequest(path: string, method: 'POST' | 'DELETE', body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const WELLNESS_BODY_BASE = { mood: 4, energy: 3, sleep: 4, stress: 2 };
const NUTRITION_BODY_BASE = { water: 6, calories: 2100, meals: 'Comida' };

// Instants whose Madrid day is unambiguous (September = CEST, UTC+2):
// 10:00Z → 12:00 Madrid, 11:00Z → 13:00 Madrid — SAME Madrid day.
const NOON_A_UTC = '2026-09-07T10:00:00Z';
const NOON_B_UTC = '2026-09-07T11:00:00Z';

function wellnessBody(date: string) {
  return { ...WELLNESS_BODY_BASE, date };
}
function nutritionBody(date: string) {
  return { ...NUTRITION_BODY_BASE, date };
}

// Models the advisory-locked DB for a sequence of same-day POSTs: the first
// request of the scenario sees an empty day; every later request observes the
// row created by the first one (the lock serializes the transactions).
function simulateSerializedFirstOfDay() {
  let wellnessCalls = 0;
  let nutritionCalls = 0;
  H.MOCK_TX.wellnessLog.findFirst.mockImplementation(async () => {
    return ++wellnessCalls === 1 ? null : { id: 'wl-earlier' };
  });
  H.MOCK_TX.nutritionLog.findFirst.mockImplementation(async () => {
    return ++nutritionCalls === 1 ? null : { id: 'nl-earlier' };
  });
}

function xpIncrements(): number[] {
  return H.empireProgressUpsert.mock.calls.map(
    (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
  );
}

function lockKeys(): string[] {
  // Routes interpolate (user.id, logDateKey) around the literal '|energia|'.
  return H.MOCK_TX.$executeRaw.mock.calls.map(
    (c: any[]) => `${c[1]}|energia|${c[2]}`,
  );
}

// ─── F-2 — Wellness POST ─────────────────────────────────────

describe('F-2 — POST /api/wellness pays +10 XP only on the first energia log of the Madrid day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    let counter = 0;
    H.MOCK_TX.wellnessLog.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: `wl-${++counter}`,
      ...create,
    }));
    H.MOCK_TX.nutritionLog.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: `nl-${++counter}`,
      ...create,
    }));
  });

  it('1. manipulated client — 10:00Z then 11:00Z, same Madrid day: +10 then +0, both rows saved', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    simulateSerializedFirstOfDay();

    const resA = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_A_UTC)) as any);
    expect(resA.status).toBe(200);
    const resB = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_B_UTC)) as any);
    expect(resB.status).toBe(200);

    // Both instants are the same Europe/Madrid natural day.
    expect(getMadridDateKey(new Date(NOON_A_UTC))).toBe(DAY_1);
    expect(getMadridDateKey(new Date(NOON_B_UTC))).toBe(DAY_1);

    // Both rows are saved (history, stats, achievements are untouched)…
    expect(H.MOCK_TX.wellnessLog.upsert).toHaveBeenCalledTimes(2);

    // …but XP is paid exactly once for the day.
    expect(xpIncrements()).toEqual([10, 0]);

    // Streak: exactly one increment for the single active day.
    const streakIncrements = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => c[0]?.update?.streak as { increment: number } | undefined)
      .filter(Boolean);
    expect(streakIncrements).toHaveLength(1);
  });

  it('2. five different timestamps of the same day → at most +10 XP total', async () => {
    let call = 0;
    H.MOCK_TX.wellnessLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'wl-earlier' };
    });

    const { POST } = await import('@/app/api/wellness/route');
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(`2026-09-07T0${i + 1}:00:00Z`)) as any);
      expect(res.status).toBe(200);
    }

    expect(H.MOCK_TX.wellnessLog.upsert).toHaveBeenCalledTimes(5);
    const increments = xpIncrements();
    expect(increments).toEqual([10, 0, 0, 0, 0]);
    expect(increments.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('3. two simultaneous first-of-day requests → exactly one +10, both succeed', async () => {
    // Models the advisory-lock outcome: the second transaction runs strictly
    // after the first committed, so it observes the first log.
    let call = 0;
    H.MOCK_TX.wellnessLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'wl-earlier' };
    });

    const { POST } = await import('@/app/api/wellness/route');
    const [resA, resB] = await Promise.all([
      POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_A_UTC)) as any),
      POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_B_UTC)) as any),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(H.MOCK_TX.wellnessLog.upsert).toHaveBeenCalledTimes(2);
    expect([...xpIncrements()].sort((a: number, b: number) => b - a)).toEqual([10, 0]);

    // Both requests locked the SAME (user, energia, day) key.
    expect(lockKeys()).toEqual([`user-1|energia|${DAY_1}`, `user-1|energia|${DAY_1}`]);
  });

  it('4. cross-module: a nutrition log of the same Madrid day makes wellness pay +0', async () => {
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue({ id: 'nl-1' });

    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_A_UTC)) as any);
    expect(res.status).toBe(200);

    // Row still saved, XP not paid, streak not incremented.
    expect(H.MOCK_TX.wellnessLog.upsert).toHaveBeenCalledTimes(1);
    expect(xpIncrements()).toEqual([0]);
    const streakIncrements = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => c[0]?.update?.streak as { increment: number } | undefined)
      .filter(Boolean);
    expect(streakIncrements).toHaveLength(0);
  });

  it('5. day boundary is Europe/Madrid, not UTC: instants around 22:00Z belong to different days and each day pays once', async () => {
    H.state.todayKey = DAY_2; // '2026-09-08' — yesterday (21:59Z) is still in the G-02 window
    const { POST } = await import('@/app/api/wellness/route');

    const resA = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-09-07T21:59:00Z')) as any);
    const resB = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-09-07T22:01:00Z')) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    expect(getMadridDateKey(new Date('2026-09-07T21:59:00Z'))).toBe(DAY_1);
    expect(getMadridDateKey(new Date('2026-09-07T22:01:00Z'))).toBe(DAY_2);

    // Different Madrid days → each pays its own daily reward.
    expect(xpIncrements()).toEqual([10, 10]);

    // Different lock keys and different day windows. E-0.1: each first-of-day
    // POST issues TWO wellnessLog.findFirst calls — [DAY_1 today-check,
    // DAY_1 continuity-check (previous day), DAY_2 today-check, DAY_2
    // continuity-check]. All four must use the correct REAL Madrid window.
    expect(lockKeys()).toEqual([`user-1|energia|${DAY_1}`, `user-1|energia|${DAY_2}`]);
    const windows = H.MOCK_TX.wellnessLog.findFirst.mock.calls.map(
      (c: any[]) => c[0].where.date,
    );
    expect(windows[0].gte.getTime()).toBe(madridDayBoundaries(DAY_1).start.getTime());
    expect(windows[1].gte.getTime()).toBe(madridDayBoundaries('2026-09-06').start.getTime()); // continuity of DAY_1
    expect(windows[2].gte.getTime()).toBe(madridDayBoundaries(DAY_2).start.getTime());
    expect(windows[3].gte.getTime()).toBe(madridDayBoundaries(DAY_1).start.getTime()); // continuity of DAY_2
  });

  it('6. DST spring-forward (23-hour day 2026-03-29): two instants of the same Madrid day → +10 then +0', async () => {
    H.state.todayKey = '2026-03-29';
    const { POST } = await import('@/app/api/wellness/route');

    // 23:30Z of Mar 28 = 00:30 CET Mar 29; 01:30Z of Mar 29 = 03:30 CEST Mar 29.
    const instantA = '2026-03-28T23:30:00Z';
    const instantB = '2026-03-29T01:30:00Z';
    expect(getMadridDateKey(new Date(instantA))).toBe('2026-03-29');
    expect(getMadridDateKey(new Date(instantB))).toBe('2026-03-29');

    let call = 0;
    H.MOCK_TX.wellnessLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'wl-earlier' };
    });

    const resA = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(instantA)) as any);
    const resB = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(instantB)) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    expect(xpIncrements()).toEqual([10, 0]);

    // The queried window spans EXACTLY the 23-hour Madrid day.
    const window = H.MOCK_TX.wellnessLog.findFirst.mock.calls[0][0].where.date;
    const { start, end } = madridDayBoundaries('2026-03-29');
    expect(window.gte.getTime()).toBe(start.getTime());
    expect(window.lt.getTime()).toBe(end.getTime());
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);
    expect(lockKeys()).toEqual(['user-1|energia|2026-03-29', 'user-1|energia|2026-03-29']);
  });

  it('7. DST fall-back (25-hour day 2026-10-25): two instants of the same Madrid day → +10 then +0', async () => {
    H.state.todayKey = '2026-10-25';
    const { POST } = await import('@/app/api/wellness/route');

    // 22:30Z of Oct 24 = 00:30 CEST Oct 25; 01:30Z of Oct 25 = 02:30 CET Oct 25
    // (the repeated local hour) — BOTH belong to Madrid day 2026-10-25.
    const instantA = '2026-10-24T22:30:00Z';
    const instantB = '2026-10-25T01:30:00Z';
    expect(getMadridDateKey(new Date(instantA))).toBe('2026-10-25');
    expect(getMadridDateKey(new Date(instantB))).toBe('2026-10-25');

    let call = 0;
    H.MOCK_TX.wellnessLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'wl-earlier' };
    });

    const resA = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(instantA)) as any);
    const resB = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(instantB)) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    expect(xpIncrements()).toEqual([10, 0]);

    const window = H.MOCK_TX.wellnessLog.findFirst.mock.calls[0][0].where.date;
    const { start, end } = madridDayBoundaries('2026-10-25');
    expect(window.gte.getTime()).toBe(start.getTime());
    expect(window.lt.getTime()).toBe(end.getTime());
    expect((end.getTime() - start.getTime()) / 3600000).toBe(25);
  });

  it('8. defensive create path seeds +10/+1 only for a first-of-day log; repeat-of-day seeds +0/+0', async () => {
    const { POST } = await import('@/app/api/wellness/route');

    // First-of-day with a missing empire row → seed 10/1.
    await POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_A_UTC)) as any);
    expect(H.empireProgressUpsert.mock.calls[0][0].create).toEqual({
      userId: 'user-1',
      empire: 'energia',
      xp: 10,
      streak: 1,
    });

    // Repeat-of-day with a missing empire row → seed 0/0 (never re-rewards).
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue({ id: 'wl-earlier' });
    await POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_B_UTC)) as any);
    expect(H.empireProgressUpsert.mock.calls[1][0].create).toEqual({
      userId: 'user-1',
      empire: 'energia',
      xp: 0,
      streak: 0,
    });
  });

  it('9. exact-same-instant retry (update path) still pays nothing — G-02 window intact', async () => {
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue({ id: 'wl-1' });

    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_A_UTC)) as any);
    expect(res.status).toBe(200);

    // Content upsert happens, but the XP path is never reached.
    expect(H.MOCK_TX.wellnessLog.upsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
    expect(H.evaluateAchievementsMock).toHaveBeenCalledWith('user-1', ['wellness']);
  });
});

// ─── F-2 — Nutrition POST ────────────────────────────────────

describe('F-2 — POST /api/nutrition pays +10 XP only on the first energia log of the Madrid day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    let counter = 100;
    H.MOCK_TX.wellnessLog.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: `wl-${++counter}`,
      ...create,
    }));
    H.MOCK_TX.nutritionLog.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: `nl-${++counter}`,
      ...create,
    }));
  });

  it('10. manipulated client — 10:00Z then 11:00Z, same Madrid day: +10 then +0, both rows saved', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    simulateSerializedFirstOfDay();

    const resA = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody(NOON_A_UTC)) as any);
    const resB = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody(NOON_B_UTC)) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    expect(H.MOCK_TX.nutritionLog.upsert).toHaveBeenCalledTimes(2);
    expect(xpIncrements()).toEqual([10, 0]);
    const streakIncrements = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => c[0]?.update?.streak as { increment: number } | undefined)
      .filter(Boolean);
    expect(streakIncrements).toHaveLength(1);
  });

  it('11. cross-module: a wellness log of the same Madrid day makes nutrition pay +0', async () => {
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue({ id: 'wl-1' });

    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody(NOON_A_UTC)) as any);
    expect(res.status).toBe(200);

    expect(H.MOCK_TX.nutritionLog.upsert).toHaveBeenCalledTimes(1);
    expect(xpIncrements()).toEqual([0]);
  });

  it('12. Wellness A + Nutrition B racing on the same day, same lock → exactly one +10', async () => {
    // Serialized-lock model: the nutrition request runs after the wellness one
    // committed, so its cross-module check observes the wellness row.
    let wellnessCall = 0;
    H.MOCK_TX.wellnessLog.findFirst.mockImplementation(async () => {
      wellnessCall++;
      return wellnessCall === 1 ? null : { id: 'wl-A' };
    });
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);

    const [resWellness, resNutrition] = await Promise.all([
      import('@/app/api/wellness/route').then((m) =>
        m.POST(makeRequest('/api/wellness', 'POST', wellnessBody(NOON_A_UTC)) as any),
      ),
      import('@/app/api/nutrition/route').then((m) =>
        m.POST(makeRequest('/api/nutrition', 'POST', nutritionBody(NOON_B_UTC)) as any),
      ),
    ]);
    expect(resWellness.status).toBe(200);
    expect(resNutrition.status).toBe(200);

    const increments = xpIncrements().sort((a: number, b: number) => b - a);
    expect(increments).toEqual([10, 0]);

    // Both requests shared the SAME advisory lock key for the day.
    expect(lockKeys()).toEqual([`user-1|energia|${DAY_1}`, `user-1|energia|${DAY_1}`]);
  });

  it('13. DST spring-forward day (2026-03-29): backdated instants of the same 23h day → +10 then +0 (G-02 intact)', async () => {
    H.state.todayKey = '2026-03-30'; // the 23h day itself is "yesterday" — inside the G-02 window
    const { POST } = await import('@/app/api/nutrition/route');

    let call = 0;
    H.MOCK_TX.nutritionLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'nl-earlier' };
    });

    const resA = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody('2026-03-28T23:30:00Z')) as any);
    const resB = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody('2026-03-29T01:30:00Z')) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(xpIncrements()).toEqual([10, 0]);
    expect(lockKeys()).toEqual(['user-1|energia|2026-03-29', 'user-1|energia|2026-03-29']);
  });

  it('14. DST fall-back day (2026-10-25): the repeated local hour is ONE day → +10 then +0', async () => {
    H.state.todayKey = '2026-10-26';
    const { POST } = await import('@/app/api/nutrition/route');

    let call = 0;
    H.MOCK_TX.nutritionLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'nl-earlier' };
    });

    const resA = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody('2026-10-24T22:30:00Z')) as any);
    const resB = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody('2026-10-25T01:30:00Z')) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(xpIncrements()).toEqual([10, 0]);
    expect(lockKeys()).toEqual(['user-1|energia|2026-10-25', 'user-1|energia|2026-10-25']);
  });
});

// ─── F-2 — DELETE coherence (day-aware XP revert) ────────────
// F-5A NOTE: the DELETE XP/streak reverts are now single ATOMIC clamped SQL
// statements (GREATEST(0, value - 10)) executed via $executeRaw inside the
// advisory lock, instead of an empireProgress.update read-modify-write with
// absolute values. The semantics asserted here are unchanged: the day's +10
// is reverted only when the delete leaves the Madrid day empty; the streak
// only when that day is today. These helpers read the raw statements.

interface RawCall { sql: string; params: any[] }

function rawCalls(): RawCall[] {
  return (H.MOCK_TX.$executeRaw.mock.calls as any[][]).map((c) => ({
    sql: (c[0] as string[]).join(' '),
    params: c.slice(1),
  }));
}

function energiaLockCalls(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('pg_advisory_xact_lock'));
}

function energiaXpDecrementCalls(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "xp" - 10)') && c.sql.includes("'energia'"));
}

function energiaStreakDecrementCalls(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "streak" - 1)'));
}

describe('F-2 — DELETE /api/wellness reverts XP only when the Madrid day is left empty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.empireProgressFindUnique.mockResolvedValue({ xp: 40, streak: 3 });
  });

  function ownedLog(dateIso: string) {
    return { id: 'wl-1', userId: 'user-1', date: new Date(dateIso) };
  }

  it('15. deleting the ONLY log of today → XP -10 and streak -1', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedLog(NOON_A_UTC));

    const { DELETE } = await import('@/app/api/wellness/route');
    const res = await DELETE(makeRequest('/api/wellness', 'DELETE', { logId: 'wl-1' }) as any);
    expect(res.status).toBe(200);

    // F-5A: the DELETE runs under the SAME advisory lock family as the POST,
    // keyed by the log's STORED Madrid day.
    const locks = energiaLockCalls();
    expect(locks).toHaveLength(1);
    expect(`${locks[0].params[0]}|energia|${locks[0].params[1]}`).toBe('user-1|energia|2026-09-07');

    // Exactly one atomic clamped -10 for energia and one streak decrement.
    expect(energiaXpDecrementCalls()).toHaveLength(1);
    expect(energiaXpDecrementCalls()[0].params[0]).toBe('user-1');
    expect(energiaStreakDecrementCalls()).toHaveLength(1);
  });

  it('16. deleting a REPEAT log of today (another wellness exists) → XP and streak untouched', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedLog(NOON_B_UTC));
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue({ id: 'wl-earlier' });

    const { DELETE } = await import('@/app/api/wellness/route');
    const res = await DELETE(makeRequest('/api/wellness', 'DELETE', { logId: 'wl-1' }) as any);
    expect(res.status).toBe(200);

    // The repeat log never paid XP — its delete must not subtract any.
    expect(energiaXpDecrementCalls()).toHaveLength(0);
    expect(energiaStreakDecrementCalls()).toHaveLength(0);
    // The advisory lock is still taken (serialization with POSTs/DELETEs).
    expect(energiaLockCalls()).toHaveLength(1);
  });

  it('17. deleting today\u2019s wellness while a nutrition log of the same day exists → no revert (cross-module)', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedLog(NOON_A_UTC));
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue({ id: 'nl-1' });

    const { DELETE } = await import('@/app/api/wellness/route');
    const res = await DELETE(makeRequest('/api/wellness', 'DELETE', { logId: 'wl-1' }) as any);
    expect(res.status).toBe(200);

    expect(energiaXpDecrementCalls()).toHaveLength(0);
    expect(energiaStreakDecrementCalls()).toHaveLength(0);
  });

  it('18. deleting yesterday\u2019s only log → XP of that day reverted, today\u2019s streak untouched', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedLog('2026-09-06T10:00:00Z'));

    const { DELETE } = await import('@/app/api/wellness/route');
    const res = await DELETE(makeRequest('/api/wellness', 'DELETE', { logId: 'wl-1' }) as any);
    expect(res.status).toBe(200);

    // The day's +10 is reverted atomically…
    expect(energiaXpDecrementCalls()).toHaveLength(1);
    // …but the streak belongs to TODAY, not to the deleted log's day.
    expect(energiaStreakDecrementCalls()).toHaveLength(0);
    const locks = energiaLockCalls();
    expect(`${locks[0].params[0]}|energia|${locks[0].params[1]}`).toBe('user-1|energia|2026-09-06');
  });
});

describe('F-2 — DELETE /api/nutrition reverts XP only when the Madrid day is left empty', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.empireProgressFindUnique.mockResolvedValue({ xp: 40, streak: 3 });
  });

  function ownedLog(dateIso: string) {
    return { id: 'nl-1', userId: 'user-1', date: new Date(dateIso) };
  }

  it('19. deleting the ONLY log of today → XP -10 and streak -1', async () => {
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedLog(NOON_A_UTC));

    const { DELETE } = await import('@/app/api/nutrition/route');
    const res = await DELETE(makeRequest('/api/nutrition', 'DELETE', { logId: 'nl-1' }) as any);
    expect(res.status).toBe(200);

    // F-5A: the nutrition DELETE uses the SAME 'user|energia|<day>' family.
    const locks = energiaLockCalls();
    expect(locks).toHaveLength(1);
    expect(`${locks[0].params[0]}|energia|${locks[0].params[1]}`).toBe('user-1|energia|2026-09-07');
    expect(energiaXpDecrementCalls()).toHaveLength(1);
    expect(energiaStreakDecrementCalls()).toHaveLength(1);
  });

  it('20. deleting a REPEAT log of today (another nutrition exists) → XP and streak untouched', async () => {
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedLog(NOON_B_UTC));
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue({ id: 'nl-earlier' });

    const { DELETE } = await import('@/app/api/nutrition/route');
    const res = await DELETE(makeRequest('/api/nutrition', 'DELETE', { logId: 'nl-1' }) as any);
    expect(res.status).toBe(200);

    expect(energiaXpDecrementCalls()).toHaveLength(0);
    expect(energiaStreakDecrementCalls()).toHaveLength(0);
  });

  it('21. deleting today\u2019s nutrition while a wellness log of the same day exists → no revert (cross-module)', async () => {
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedLog(NOON_A_UTC));
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue({ id: 'wl-1' });

    const { DELETE } = await import('@/app/api/nutrition/route');
    const res = await DELETE(makeRequest('/api/nutrition', 'DELETE', { logId: 'nl-1' }) as any);
    expect(res.status).toBe(200);

    expect(energiaXpDecrementCalls()).toHaveLength(0);
    expect(energiaStreakDecrementCalls()).toHaveLength(0);
  });
});
