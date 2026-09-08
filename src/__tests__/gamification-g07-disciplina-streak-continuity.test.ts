/**
 * FASE 14 — G-07: close the GLOBAL disciplina streak definitively.
 *
 * The G-07 forensic audit over c5c3321 confirmed:
 *   🟢 The original race between DIFFERENT habits is closed — the shared
 *      advisory lock family `pg_advisory_xact_lock(user|disciplina|day)`
 *      serializes PATCH/DELETE/undo, the otherCompletedToday decision is
 *      re-evaluated inside the transaction, and all streak writes are atomic.
 *   🟠 Residual defect: the stored EmpireProgress.streak was increment-only.
 *      After a gap day (D+1 with no activity), the next first-completion-
 *      of-day (D+2) blindly did stored+1, so a user with streak N read N+1
 *      instead of 1 — while the per-habit streak correctly reset to 1 (H-8).
 *
 * The fix (PATCH /api/habits, inside the SAME advisory-locked transaction):
 * when isFirstCompletionToday, the continuity of the chain is decided from
 * REAL habit activity — never from the stored counter:
 *   - any habit (including this one) has a completion inside
 *     [start of yesterday, start of today) in Europe/Madrid → stored + 1
 *     (atomic increment);
 *   - yesterday had NO completion → the streak is explicitly SET to 1.
 * Yesterday's window is built with startOfMadridDay + addDaysToDateKey
 * (DST-safe; never start+24h) and reuses todayStart from
 * madridDayBoundaries(todayDateKey).
 *
 * Tests (deterministic):
 *   1. continuation: yesterday active → streak = N + 1 (atomic increment)
 *   2. one-day gap: stored 14 → streak set to 1 (NOT 15)
 *   3. two habits concurrent after a gap → exactly one streak op, final 1
 *   4. two habits concurrent with activity yesterday → one increment, N + 1
 *   5. third habit of the same day → global streak untouched (once per day)
 *   6. regression G-07: both requests take the SAME advisory lock
 *      (user|disciplina|day) BEFORE the row lock — serialization preserved
 *   7. DST/midnight: yesterday's window spans the 25h autumn day and the
 *     23h spring day exactly (Europe/Madrid)
 *   8. reset-then-undo the same day → atomic GREATEST decrement (floor 0)
 *   9. XP fully decoupled from the streak branch (10/0 by the G-04 gate)
 *
 * Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 * fire-and-forget side effects. getTodayDateKey is mocked (mutable) at both
 * specifier paths; ALL Madrid conversions stay REAL (September = CEST).
 * NOTE on mocks: with the fix, an isFirstCompletionToday PATCH performs TWO
 * findFirst calls inside the tx — call #1 is otherCompletedToday (today's
 * window), call #2 is the yesterday continuity check.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_1 = '2026-09-07'; // Monday (fixed "today" for most tests)

function dayKey(offsetFromDay1: number): string {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1)).toISOString().slice(0, 10);
}

// Instants whose Madrid day is unambiguous (September = CEST, UTC+2):
// 10:00Z → 12:00 Madrid of the same calendar day.
function noonUTC(offsetFromDay1: number): Date {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1, 10, 0, 0));
}

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    habitLog: {
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    habitLog: {
      findFirst: vi.fn().mockResolvedValue(null), // DELETE ownership pre-check
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
    getAuthUserBasicMock,
    rateLimitMock,
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

vi.mock('@/lib/analytics-server', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onHabitChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: vi.fn().mockResolvedValue([]),
}));

// Mock ONLY "today"; keep the real Madrid conversions (startOfMadridDay,
// madridDayBoundaries, addDaysToDateKey — DST-safe).
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

function makeRequest(path: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function habitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Leer 20 minutos',
    description: null,
    frequency: 'daily',
    streak: 0,
    lastCompletedAt: null,
    createdAt: noonUTC(-2), // created before today → paying completion
    updatedAt: noonUTC(-2),
    ...overrides,
  };
}

/** Simulate one PATCH whose SELECT … FOR UPDATE returns `habit`. */
async function completeHabit(habit: Record<string, unknown>) {
  H.MOCK_TX.$queryRaw.mockResolvedValueOnce([habit]);
  H.MOCK_TX.habitLog.update.mockResolvedValueOnce({ ...habit });
  const { PATCH } = await import('@/app/api/habits/route');
  return PATCH(makeRequest('/api/habits', 'PATCH', { habitId: habit.id }) as any);
}

/** Configure the two findFirst outcomes of one first-completion-of-day PATCH. */
function mockFirstCompletionOfDay({ otherToday, yesterday }: { otherToday: unknown; yesterday: unknown }) {
  H.MOCK_TX.habitLog.findFirst
    .mockResolvedValueOnce(otherToday)   // call #1: otherCompletedToday
    .mockResolvedValueOnce(yesterday);   // call #2: yesterday continuity check
}

function streakOps(): Array<Record<string, unknown>> {
  return H.empireProgressUpsert.mock.calls
    .map((c: any[]) => (c[0]?.update as Record<string, unknown>)?.streak as Record<string, unknown>)
    .filter((s) => s !== undefined);
}

function rawSqlCalls(): string[] {
  return H.MOCK_TX.$executeRaw.mock.calls.map((c: any[]) => (c[0] as string[]).join(' '));
}
function empireSqlCalls(): string[] {
  return rawSqlCalls().filter((sql) => sql.includes('EmpireProgress'));
}
function lockSeeds(): string[] {
  return H.MOCK_TX.$executeRaw.mock.calls
    .filter((c: any[]) => (c[0] as string[]).join(' ').includes('pg_advisory_xact_lock'))
    .map((c: any[]) => c[1] as string);
}

// ─── Mandatory G-07 tests ────────────────────────────────────

describe('G-07 — global disciplina streak continuity (PATCH /api/habits, under the advisory lock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. TEST 1 — continuation: yesterday had activity → streak = N + 1 (atomic increment, no reset)', async () => {
    // otherCompletedToday → none; yesterday continuity → a habit WAS completed yesterday.
    mockFirstCompletionOfDay({ otherToday: null, yesterday: [{ id: 'habit-other' }] });
    const res = await completeHabit(habitRow({ streak: 6, lastCompletedAt: noonUTC(-2) }));
    expect(res.status).toBe(200);

    expect(streakOps()).toEqual([{ increment: 1 }]); // stored 6 → 7, NOT reset
  });

  it('2. TEST 2 — one-day gap: stored 14, yesterday empty → streak explicitly SET to 1 (never 15)', async () => {
    mockFirstCompletionOfDay({ otherToday: null, yesterday: null });
    const res = await completeHabit(habitRow({ streak: 14, lastCompletedAt: noonUTC(-3) }));
    expect(res.status).toBe(200);

    expect(streakOps()).toEqual([1]); // explicit set, not { increment: 1 }
  });

  it('3. TEST 3 — two different habits concurrent after a gap → exactly ONE streak op, final 1', async () => {
    // Habit A wins the advisory lock: no other completion today, yesterday empty → SET 1.
    mockFirstCompletionOfDay({ otherToday: null, yesterday: null });
    const resA = await completeHabit(habitRow({ id: 'habit-A', streak: 14, lastCompletedAt: noonUTC(-3) }));
    expect(resA.status).toBe(200);

    // Habit B arrives after A committed: otherCompletedToday sees A → NO streak write,
    // and the yesterday continuity check is never even queried.
    H.MOCK_TX.habitLog.findFirst.mockResolvedValueOnce([{ id: 'habit-A' }]);
    const resB = await completeHabit(habitRow({ id: 'habit-B', streak: 9, lastCompletedAt: noonUTC(-3) }));
    expect(resB.status).toBe(200);

    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(2);
    expect(streakOps()).toEqual([1]); // exactly one op, and it is the SET to 1
    // The second upsert carried XP only — no streak key at all.
    const secondUpdate = H.empireProgressUpsert.mock.calls[1][0].update as Record<string, unknown>;
    expect(secondUpdate.streak).toBeUndefined();
  });

  it('4. TEST 4 — two different habits concurrent WITH activity yesterday → one increment, final N + 1', async () => {
    mockFirstCompletionOfDay({ otherToday: null, yesterday: [{ id: 'habit-yesterday' }] });
    const resA = await completeHabit(habitRow({ id: 'habit-A', streak: 6, lastCompletedAt: noonUTC(-2) }));
    expect(resA.status).toBe(200);

    H.MOCK_TX.habitLog.findFirst.mockResolvedValueOnce([{ id: 'habit-A' }]);
    const resB = await completeHabit(habitRow({ id: 'habit-B', streak: 4, lastCompletedAt: noonUTC(-2) }));
    expect(resB.status).toBe(200);

    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(2);
    expect(streakOps()).toEqual([{ increment: 1 }]); // exactly one increment: 6 → 7
  });

  it('5. TEST 5 — third habit of the same day → the global streak is modified exactly once that day', async () => {
    mockFirstCompletionOfDay({ otherToday: null, yesterday: [{ id: 'habit-yesterday' }] });
    await completeHabit(habitRow({ id: 'habit-A', streak: 2, lastCompletedAt: noonUTC(-1) })); // first → increment

    H.MOCK_TX.habitLog.findFirst.mockResolvedValue([{ id: 'habit-A' }]); // B and C both see A
    await completeHabit(habitRow({ id: 'habit-B', streak: 2, lastCompletedAt: noonUTC(-1) }));
    await completeHabit(habitRow({ id: 'habit-C', streak: 2, lastCompletedAt: noonUTC(-1) }));

    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(3);
    expect(streakOps()).toEqual([{ increment: 1 }]); // once per active day, regardless of habit count
  });

  it('6. regression G-07 (original race) — both habit requests take the SAME advisory lock (user|disciplina|day) BEFORE the row lock', async () => {
    mockFirstCompletionOfDay({ otherToday: null, yesterday: [{ id: 'habit-yesterday' }] });
    await completeHabit(habitRow({ id: 'habit-A', streak: 6, lastCompletedAt: noonUTC(-1) }));

    H.MOCK_TX.habitLog.findFirst.mockResolvedValueOnce([{ id: 'habit-A' }]);
    await completeHabit(habitRow({ id: 'habit-B', streak: 4, lastCompletedAt: noonUTC(-1) }));

    const seeds = lockSeeds();
    expect(seeds).toEqual(['user-1|disciplina|2026-09-07', 'user-1|disciplina|2026-09-07']);

    // The advisory lock is acquired BEFORE the SELECT … FOR UPDATE in each tx.
    expect(H.MOCK_TX.$executeRaw.mock.invocationCallOrder[0])
      .toBeLessThan(H.MOCK_TX.$queryRaw.mock.invocationCallOrder[0]);

    // And the outcome stays the serialized one: exactly one streak op for the day.
    expect(streakOps()).toEqual([{ increment: 1 }]);
  });

  it('7. DST/midnight — yesterday window is the true Madrid midnight pair (25h autumn day, 23h spring day)', async () => {
    // Autumn transition: today = 2026-10-26 → yesterday = 2026-10-25 (25-hour day).
    H.state.todayKey = '2026-10-26';
    H.MOCK_TX.habitLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await completeHabit(habitRow({ streak: 3, lastCompletedAt: new Date('2026-10-22T10:00:00Z') }));

    const autumnWhere = (H.MOCK_TX.habitLog.findFirst.mock.calls[1][0] as any).where.lastCompletedAt;
    expect(autumnWhere.gte.toISOString()).toBe('2026-10-24T22:00:00.000Z'); // true midnight (CEST side)
    expect(autumnWhere.lt.toISOString()).toBe('2026-10-25T23:00:00.000Z');  // true midnight (CET side)
    expect((autumnWhere.lt.getTime() - autumnWhere.gte.getTime()) / 3600000).toBe(25);

    // Spring transition: today = 2026-03-30 → yesterday = 2026-03-29 (23-hour day).
    vi.clearAllMocks();
    H.state.todayKey = '2026-03-30';
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_TX.habitLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await completeHabit(habitRow({ streak: 3, lastCompletedAt: new Date('2026-03-26T10:00:00Z') }));

    const springWhere = (H.MOCK_TX.habitLog.findFirst.mock.calls[1][0] as any).where.lastCompletedAt;
    expect(springWhere.gte.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(springWhere.lt.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect((springWhere.lt.getTime() - springWhere.gte.getTime()) / 3600000).toBe(23);
  });

  it('8. reset-then-undo the same day → the atomic GREATEST decrement keeps the floor (net 0, no negative)', async () => {
    mockFirstCompletionOfDay({ otherToday: null, yesterday: null });
    const patchRes = await completeHabit(habitRow({ id: 'habit-A', streak: 0, lastCompletedAt: null }));
    expect(patchRes.status).toBe(200);
    expect(streakOps()).toEqual([1]); // reset to 1 after the gap

    // Undo the sole completion of today → empire streak −1 (atomic, floored).
    H.MOCK_TX.$queryRaw.mockResolvedValueOnce([habitRow({ id: 'habit-A', streak: 1, lastCompletedAt: noonUTC(0) })]);
    H.MOCK_TX.habitLog.update.mockResolvedValueOnce({});
    H.MOCK_TX.habitLog.findFirst.mockResolvedValueOnce(null); // undo's own otherCompletedToday
    const { POST: UNDO } = await import('@/app/api/habits/undo/route');
    const undoRes = await UNDO(makeRequest('/api/habits/undo', 'POST', {
      habitId: 'habit-A',
      previousLastCompletedAt: null,
    }) as any);
    expect(undoRes.status).toBe(200);

    const decrement = empireSqlCalls().find((s) => s.includes('GREATEST(0, "streak" - 1)'));
    expect(decrement).toBeTruthy();
  });

  it('9. XP stays fully decoupled from the streak branch (paying → +10, fresh → +0, same streak semantics)', async () => {
    // Old habit (pays) after a gap → xp +10 AND streak set to 1, in the same upsert.
    mockFirstCompletionOfDay({ otherToday: null, yesterday: null });
    await completeHabit(habitRow({ id: 'habit-old', createdAt: noonUTC(-2), lastCompletedAt: noonUTC(-3) }));
    const oldUpdate = H.empireProgressUpsert.mock.calls[0][0].update as Record<string, unknown>;
    expect(oldUpdate).toEqual({ xp: { increment: 10 }, streak: 1 });

    // Fresh habit (created today, pays nothing) after a gap → xp +0 AND streak set to 1.
    vi.clearAllMocks();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    mockFirstCompletionOfDay({ otherToday: null, yesterday: null });
    await completeHabit(habitRow({ id: 'habit-fresh', createdAt: new Date('2026-09-07T08:00:00Z'), lastCompletedAt: noonUTC(-3) }));
    const freshUpdate = H.empireProgressUpsert.mock.calls[0][0].update as Record<string, unknown>;
    expect(freshUpdate).toEqual({ xp: { increment: 0 }, streak: 1 });
  });
});
