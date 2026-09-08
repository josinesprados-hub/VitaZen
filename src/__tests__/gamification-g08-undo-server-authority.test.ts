/**
 * FASE 14 — G-08: the server no longer trusts "previousLastCompletedAt".
 *
 * The G-08 forensic audit over f89e2d9 confirmed: POST /api/habits/undo wrote
 * a client-supplied date straight into HabitLog.lastCompletedAt (any past/
 * future/contradictory date was accepted, and an invalid one caused an
 * uncontrolled 500 via new Date(...) → Prisma → catch).
 *
 * Fix: HabitLog keeps NO per-day completion history, so the previous anchor
 * cannot be reconstructed from the DB — and unknown data is never invented
 * (neither from the client nor derived from the streak). The only safe
 * representation of the pre-undo state is lastCompletedAt = null. The body
 * field is accepted-and-ignored (legacy client compatibility) and the body
 * parsing is defensive: malformed input yields controlled 400s, never 500.
 * Streak (stored−1, floor 0), the XP mirror and the empire-streak mirror
 * (G-04) are unchanged: they were always derived from REAL DB state.
 *
 * Tests (deterministic):
 *   1. normal undo (paying): streak−1, anchor null, XP + empire mirrors, 200
 *   2. previousLastCompletedAt omitted → works, client not needed
 *   3. previousLastCompletedAt = null → no 500, state unaffected
 *   4. future date → ignored: never becomes lastCompletedAt
 *   5. very old date → ignored
 *   6. contradictory (valid but incompatible) date → ignored; state = server only
 *   7. invalid string → never 500, no partial writes
 *   8. number → ignored
 *   9. object/wrong type → ignored; non-JSON body → controlled 400
 *  10. two-day history (streak 2) → undo keeps streak 1, anchor null — day 7
 *      is NOT invented
 *  11. multi-day history: every manipulated date yields the IDENTICAL
 *      server-derived state — the client cannot choose the prior state
 *  12. double undo → second rejected (not_completed), no double decrement
 *  13. complete + undo (modeled serialization) → SAME advisory lock family,
 *      mirrors stay consistent (G-04/G-07 preserved)
 *  14. habitId missing / non-string → controlled 400, transaction never starts
 *
 * Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and side
 * effects. getTodayDateKey is mocked at both specifier paths; Madrid
 * conversions stay real (September = CEST).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const DAY_1 = '2026-09-07'; // Monday (fixed "today")

function noonUTC(offsetFromDay1: number): Date {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1, 10, 0, 0));
}

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    habitLog: {
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    habitLog: {
      findFirst: vi.fn().mockResolvedValue(null),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return { state, MOCK_DB, MOCK_TX, empireProgressUpsert, getAuthUserBasicMock, rateLimitMock };
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

vi.mock('@/lib/analytics-server', () => ({ trackEvent: vi.fn() }));

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onHabitChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dates')>();
  return { ...actual, getTodayDateKey: () => H.state.todayKey };
});

vi.mock('@/lib/deterministic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deterministic')>();
  return { ...actual, getTodayDateKey: () => H.state.todayKey };
});

// ─── Helpers ─────────────────────────────────────────────────

function makeUndoRequest(body: unknown): Request {
  return new Request('http://localhost/api/habits/undo', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function habitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Leer 20 minutos',
    description: null,
    frequency: 'daily',
    streak: 1,
    lastCompletedAt: noonUTC(0),
    createdAt: noonUTC(-2), // paying habit
    updatedAt: noonUTC(-2),
    ...overrides,
  };
}

async function callUndo(body: unknown) {
  const { POST } = await import('@/app/api/habits/undo/route');
  return POST(makeUndoRequest(body) as any);
}

/** Queue one undo: SELECT … FOR UPDATE returns `habit`. */
function mockHabitForUndo(habit: Record<string, unknown>) {
  H.MOCK_TX.$queryRaw.mockResolvedValueOnce([habit]);
  H.MOCK_TX.habitLog.update.mockResolvedValueOnce({ ...habit });
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

// ─── G-08 tests ──────────────────────────────────────────────

describe('G-08 — undo derives its state from the server/BD only (no client dates)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. TEST 1 — normal undo (paying): streak−1, anchor null, XP + empire mirrors, 200', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: noonUTC(-1).toISOString() });
    expect(res.status).toBe(200);

    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null }, // anchor is null — never the client date
    });
    expect(empireSqlCalls().some((s) => s.includes('"xp" = GREATEST(0, "xp" - 10)'))).toBe(true);
    expect(empireSqlCalls().some((s) => s.includes('"streak" = GREATEST(0, "streak" - 1)'))).toBe(true);
  });

  it('2. TEST 2 — previousLastCompletedAt omitted → works, the client is not needed', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1' });
    expect(res.status).toBe(200);
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null },
    });
  });

  it('3. TEST 3 — previousLastCompletedAt = null → no 500, state unaffected', async () => {
    H.MOCK_TX.$queryRaw.mockResolvedValueOnce([habitRow({ streak: 2, lastCompletedAt: noonUTC(0) })]);
    // Prisma returns the POST-update row: streak decremented, anchor null.
    H.MOCK_TX.habitLog.update.mockResolvedValueOnce({ ...habitRow({ streak: 2, lastCompletedAt: null }) });
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: null });
    expect(res.status).toBe(200);

    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 1, lastCompletedAt: null },
    });
    // The response carries the G-06 gated value: with a null anchor the
    // chain is not alive → the UI-visible streak is 0 (conservative, honest).
    const data = await res.json();
    expect(data.habit.streak).toBe(0);
  });

  it('4. TEST 4 — future date → ignored: never becomes lastCompletedAt, streak/XP untouched by it', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: '2030-01-01T00:00:00.000Z' });
    expect(res.status).toBe(200);

    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null }, // NOT the future date
    });
    // XP mirror still runs exactly once based on REAL BD state.
    expect(empireSqlCalls().filter((s) => s.includes('"xp"'))).toHaveLength(1);
  });

  it('5. TEST 5 — arbitrarily old date → ignored', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: '2020-01-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null },
    });
  });

  it('6. TEST 6 — contradictory valid date (yesterday when the real anchor is today) → ignored', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: noonUTC(-1).toISOString() });
    expect(res.status).toBe(200);
    // The final state depends ONLY on the server/BD: anchor null, streak stored−1.
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null },
    });
  });

  it('7. TEST 7 — invalid string → never 500, no partial writes', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: 'esto-no-es-una-fecha' });
    expect(res.status).toBe(200); // accepted & ignored — the field is never processed
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledTimes(1);
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null },
    });
  });

  it('8. TEST 8 — number → ignored, cannot become a historical date', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: 12345 });
    expect(res.status).toBe(200);
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null },
    });
  });

  it('9. TEST 9 — object/wrong type → ignored; non-JSON body → controlled 400 (never 500)', async () => {
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    const resObj = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: { when: 'now' } });
    expect(resObj.status).toBe(200);
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 2, lastCompletedAt: null },
    });

    // A non-JSON body is user input, not an internal error.
    const resBad = await callUndo('esto no es json');
    expect(resBad.status).toBe(400);
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledTimes(1); // no additional writes
  });

  it('10. TEST 10 — two-day history: undo keeps streak 1 and does NOT invent day 7', async () => {
    // Real state: completed D-1 (day 7) and today (day 8) → stored streak 2.
    // The DB cannot prove the day-7 completion date after the undo (no
    // per-day history), so the anchor must be null — never a fabricated date.
    mockHabitForUndo(habitRow({ streak: 2, lastCompletedAt: noonUTC(0) }));
    const res = await callUndo({ habitId: 'habit-1', previousLastCompletedAt: noonUTC(-1).toISOString() });
    expect(res.status).toBe(200);

    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: { streak: 1, lastCompletedAt: null }, // NOT noonUTC(-1) — nothing invented
    });
  });

  it('11. TEST 11 — multi-day history: every manipulated date yields the IDENTICAL server state', async () => {
    const manipulations = [
      undefined,                                  // omitted
      null,
      noonUTC(-1).toISOString(),                  // the "correct" legacy value
      '2030-01-01T00:00:00.000Z',                 // future
      '2019-05-05T05:05:05.050Z',                 // ancient
      'not-a-date',                               // garbage
      999999999,                                  // number
    ];

    let lastUpdate: any = null;
    for (const previousLastCompletedAt of manipulations) {
      vi.clearAllMocks();
      H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
      H.rateLimitMock.mockResolvedValue({ limited: false });
      mockHabitForUndo(habitRow({ streak: 5, lastCompletedAt: noonUTC(0) }));
      const body: Record<string, unknown> = { habitId: 'habit-1' };
      if (previousLastCompletedAt !== undefined) body.previousLastCompletedAt = previousLastCompletedAt;
      const res = await callUndo(body);
      expect(res.status).toBe(200);
      lastUpdate = H.MOCK_TX.habitLog.update.mock.calls[0][0];
      expect(lastUpdate).toEqual({
        where: { id: 'habit-1' },
        data: { streak: 4, lastCompletedAt: null }, // identical for ALL manipulations
      });
    }
    expect(lastUpdate).toBeTruthy();
  });

  it('12. TEST 12 — double undo: second is rejected, no double decrement, no double XP', async () => {
    // First undo: completes fine.
    mockHabitForUndo(habitRow({ streak: 3, lastCompletedAt: noonUTC(0) }));
    H.MOCK_TX.habitLog.findFirst.mockResolvedValueOnce(null); // sole completion today
    const r1 = await callUndo({ habitId: 'habit-1' });
    expect(r1.status).toBe(200);

    // Second undo: the anchor is now null in the DB → not_completed.
    H.MOCK_TX.$queryRaw.mockResolvedValueOnce([habitRow({ streak: 2, lastCompletedAt: null })]);
    const r2 = await callUndo({ habitId: 'habit-1' });
    expect(r2.status).toBe(400);

    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledTimes(1); // single decrement
    expect(empireSqlCalls().filter((s) => s.includes('GREATEST(0, "streak" - 1)'))).toHaveLength(1);
    expect(empireSqlCalls().filter((s) => s.includes('"xp"'))).toHaveLength(1);
  });

  it('13. TEST 13 — complete + undo (modeled serialization): same advisory lock family, mirrors consistent', async () => {
    // Request A — PATCH completes the habit (first of the day, yesterday active).
    H.MOCK_TX.$queryRaw.mockResolvedValueOnce([
      habitRow({ streak: 6, lastCompletedAt: noonUTC(-1) }),
    ]);
    H.MOCK_TX.habitLog.update.mockResolvedValueOnce({});
    H.MOCK_TX.habitLog.findFirst
      .mockResolvedValueOnce(null)              // PATCH: otherCompletedToday
      .mockResolvedValueOnce([{ id: 'other' }]); // PATCH: yesterday continuity → increment
    const { PATCH } = await import('@/app/api/habits/route');
    const patchRes = await PATCH(new Request('http://localhost/api/habits', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ habitId: 'habit-1' }),
    }) as any);
    expect(patchRes.status).toBe(200);

    // Request B — UNDO runs afterwards, serialized by the same lock.
    mockHabitForUndo(habitRow({ streak: 7, lastCompletedAt: noonUTC(0) }));
    H.MOCK_TX.habitLog.findFirst.mockResolvedValueOnce(null); // sole completion today
    const undoRes = await callUndo({ habitId: 'habit-1' });
    expect(undoRes.status).toBe(200);

    // Both requests took the SAME advisory lock (user|disciplina|day).
    expect(lockSeeds()).toEqual(['user-1|disciplina|2026-09-07', 'user-1|disciplina|2026-09-07']);
    // PATCH: streak { increment: 1 } (continuation). UNDO: atomic −1. Net 0 — coherent.
    expect((H.empireProgressUpsert.mock.calls[0][0].update as any).streak).toEqual({ increment: 1 });
    expect(empireSqlCalls().filter((s) => s.includes('GREATEST(0, "streak" - 1)'))).toHaveLength(1);
  });

  it('14. habitId missing / non-string → controlled 400, transaction never starts', async () => {
    const r1 = await callUndo({});
    expect(r1.status).toBe(400);
    const r2 = await callUndo({ habitId: 123 });
    expect(r2.status).toBe(400);
    const r3 = await callUndo({ habitId: null });
    expect(r3.status).toBe(400);

    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    expect(H.MOCK_TX.$queryRaw).not.toHaveBeenCalled();
    expect(H.MOCK_TX.$executeRaw).not.toHaveBeenCalled();
  });
});
