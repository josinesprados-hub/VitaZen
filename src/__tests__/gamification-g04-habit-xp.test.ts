/**
 * FASE 14 — G-04: close habit XP farming WITHOUT removing legitimate
 * historical XP.
 *
 * Farming vectors closed:
 *   1. create → delete → create → delete …  (the old +5 creation reward,
 *      refunded −5 on delete, could be recycled forever because HabitLog is
 *      hard-deleted and no record of a creation survives).
 *   2. create → complete → delete → recreate → complete …  (deleting the
 *      habit erases its lastCompletedAt, so a recreated copy passed the
 *      per-period guard and the +10 completion was re-farmable the same day).
 *
 * Solution implemented (and asserted here):
 *   - POST /api/habits awards 0 XP (creation reward removed — the only
 *     delete-proof policy, since deletion erases all habit history and the
 *     project has no reward ledger).
 *   - PATCH /api/habits awards +10 XP ONLY when the habit was created BEFORE
 *     the completion's Madrid day ("fresh habit" gate). The gate uses ONLY
 *     the completed row's own server-set createdAt, so it cannot be bypassed
 *     by deleting the habit: a habit that pays had to exist before the day
 *     it was completed. Repeat completions within one period remain blocked
 *     by the H-07 guard.
 *   - DELETE /api/habits NEVER writes XP (neither the removed creation
 *     reward nor legitimate completion XP). It only decrements the empire
 *     streak when the deleted habit was the sole completion of today (H-12
 *     semantics kept), via an atomic GREATEST(0, streak-1) update, behind
 *     the same advisory-lock family as PATCH/undo. deleteMany+count makes a
 *     losing duplicate DELETE an idempotent success.
 *   - POST /api/habits/undo mirrors the award condition exactly: it reverts
 *     −10 XP only if the undone completion actually paid (fresh-habit
 *     completions paid 0, so their undo must not remove XP).
 *
 * Test strategy (same as gamification-g03-daily-xp-cap.test.ts):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   fire-and-forget side effects (analytics, challenges, widgets).
 * - getTodayDateKey is mocked (mutable state) at BOTH specifier paths
 *   (@/lib/dates and @/lib/deterministic); getMadridDateKey and
 *   madridDayBoundaries / startOfMadridDay remain REAL (Europe/Madrid).
 * - XP is verified on the REAL EmpireProgress payloads: the exact
 *   empireProgress.upsert update objects and the raw SQL sent to
 *   EmpireProgress (which must never contain an "xp" write on DELETE).
 * - "Concurrency" tests model the serialized outcome the advisory lock
 *   guarantees at DB level, and assert the lock invocation per request.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Fixed "today" (Madrid) for deterministic route tests ────

const DAY_1 = '2026-09-07'; // Monday
const DAY_2 = '2026-09-08';

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
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    habitLog: {
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(0), // H-05 creation quota check
      findFirst: vi.fn(), // DELETE pre-transaction ownership check
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

function makeRequest(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const HABIT_BODY = { name: 'Leer 20 minutos', frequency: 'daily' };

// A habit created BEFORE today (Madrid): completing it today PAYS.
const OLD_CREATED_AT = noonUTC(-2); // Madrid day 2026-09-05
// A habit created TODAY (Madrid, 10:00 local): completing it today pays +0.
const FRESH_CREATED_AT = new Date('2026-09-07T08:00:00Z'); // Madrid 2026-09-07 10:00

function habitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Leer 20 minutos',
    description: null,
    frequency: 'daily',
    streak: 0,
    lastCompletedAt: null,
    createdAt: OLD_CREATED_AT,
    updatedAt: OLD_CREATED_AT,
    ...overrides,
  };
}

function xpIncrements(): number[] {
  return H.empireProgressUpsert.mock.calls.map(
    (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
  );
}

function rawSqlCalls(): string[] {
  return H.MOCK_TX.$executeRaw.mock.calls.map((c: any[]) => (c[0] as string[]).join(' '));
}
function empireSqlCalls(): string[] {
  return rawSqlCalls().filter((sql) => sql.includes('EmpireProgress'));
}
function lockCalls(): any[][] {
  return H.MOCK_TX.$executeRaw.mock.calls.filter((c: any[]) =>
    (c[0] as string[]).join(' ').includes('pg_advisory_xact_lock'),
  );
}

async function completeHabit(habit: Record<string, unknown>) {
  H.MOCK_TX.$queryRaw.mockResolvedValue([habit]);
  H.MOCK_TX.habitLog.update.mockResolvedValue({ ...habit, streak: habit.streak ?? 0 });
  const { PATCH } = await import('@/app/api/habits/route');
  return PATCH(makeRequest('/api/habits', 'PATCH', { habitId: habit.id }) as any);
}

async function deleteHabit(row: Record<string, unknown> | null, deleteCount = 1) {
  H.MOCK_DB.habitLog.findFirst.mockResolvedValue(row);
  H.MOCK_TX.habitLog.deleteMany.mockResolvedValue({ count: deleteCount });
  const { DELETE } = await import('@/app/api/habits/route');
  return DELETE(makeRequest('/api/habits', 'DELETE', { habitId: 'habit-1' }) as any);
}

// ─── G-04 — POST /api/habits: creation awards 0 XP ───────────

describe('G-04 — POST /api/habits no longer awards the +5 creation XP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.habitLog.count.mockResolvedValue(0);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_DB.habitLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'habit-new',
      ...data,
      streak: 0,
      lastCompletedAt: null,
      createdAt: FRESH_CREATED_AT,
    }));
  });

  it('1. creating a habit succeeds and touches EmpireProgress ZERO times', async () => {
    const { POST } = await import('@/app/api/habits/route');
    const res = await POST(makeRequest('/api/habits', 'POST', HABIT_BODY) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.habit.id).toBe('habit-new');

    // The habit is persisted normally…
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(1);
    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', name: 'Leer 20 minutos', description: undefined, frequency: 'daily' },
    });

    // …but NO XP is granted for creating it (no upsert, no raw EmpireProgress SQL).
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
    expect(empireSqlCalls()).toEqual([]);
  });

  it('2. create → delete → create → delete loop (6×) yields exactly 0 XP (CASE 5)', async () => {
    const { POST } = await import('@/app/api/habits/route');
    for (let i = 0; i < 6; i++) {
      const created = await POST(makeRequest('/api/habits', 'POST', HABIT_BODY) as any);
      expect(created.status).toBe(200);
      // Quota is NOT relevant to XP anymore: deleting frees the row count,
      // but creation simply does not pay, so the loop cannot farm.
      const deleted = await deleteHabit({ id: 'habit-new', lastCompletedAt: null });
      expect(deleted.status).toBe(200);
    }

    expect(H.MOCK_DB.habitLog.create).toHaveBeenCalledTimes(6);
    // No XP anywhere in the whole loop.
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
    expect(empireSqlCalls()).toEqual([]);
  });
});

// ─── G-04 — PATCH /api/habits: fresh-habit XP gate ───────────

describe('G-04 — PATCH /api/habits pays +10 XP only for habits created before today (Madrid)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null); // first completion of the day
  });

  it('3. old habit (created 2 days ago), first completion → +10 XP and streak +1 (legitimate economy unchanged)', async () => {
    const res = await completeHabit(habitRow());
    expect(res.status).toBe(200);

    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_empire: { userId: 'user-1', empire: 'disciplina' } },
        update: { xp: { increment: 10 }, streak: { increment: 1 } },
      }),
    );
  });

  it('4. fresh habit (created today) → completion is saved with +0 XP, streak logic intact', async () => {
    const res = await completeHabit(habitRow({ createdAt: FRESH_CREATED_AT }));
    expect(res.status).toBe(200);

    // The completion is FULLY valid: the habit row is updated (streak +1)…
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith({
      where: { id: 'habit-1' },
      data: expect.objectContaining({ streak: 1 }),
    });
    // …and the empire upsert still runs with +0 XP (no streak loss either).
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    const call = H.empireProgressUpsert.mock.calls[0][0];
    expect(call.update.xp).toEqual({ increment: 0 });
    expect(call.update).toEqual({ xp: { increment: 0 }, streak: { increment: 1 } });
  });

  it('5. completions on 5 different days → +10 each (+50 total), and deleting the habit keeps all of it (CASE 3, mandate 3)', async () => {
    const { DELETE } = await import('@/app/api/habits/route');

    for (let i = 0; i < 5; i++) {
      H.state.todayKey = dayKey(i);
      const habit = habitRow({
        createdAt: OLD_CREATED_AT,
        lastCompletedAt: i === 0 ? null : noonUTC(i - 1),
        streak: i,
      });
      const res = await completeHabit(habit);
      expect(res.status).toBe(200);
    }
    expect(xpIncrements()).toEqual([10, 10, 10, 10, 10]);
    expect(xpIncrements().reduce((a, b) => a + b, 0)).toBe(50);

    // Deleting the habit afterwards must NOT remove any of the +50.
    H.MOCK_DB.habitLog.findFirst.mockResolvedValue(habitRow({ lastCompletedAt: noonUTC(4) }));
    H.MOCK_TX.habitLog.deleteMany.mockResolvedValue({ count: 1 });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue({ id: 'other' }); // another habit completed today
    const del = await DELETE(makeRequest('/api/habits', 'DELETE', { habitId: 'habit-1' }) as any);
    expect(del.status).toBe(200);

    // No EmpireProgress SQL carries an "xp" write on the delete path.
    for (const sql of empireSqlCalls()) {
      expect(sql).not.toContain('"xp"');
    }
    // Final XP for the period: exactly the +50 granted by completions.
    expect(xpIncrements().reduce((a, b) => a + b, 0)).toBe(50);
  });

  it('6. 100 completions on 100 different days → +1000, kept intact after delete (CASE 3, mandate 4)', async () => {
    for (let i = 0; i < 100; i++) {
      H.state.todayKey = dayKey(i);
      const habit = habitRow({
        createdAt: OLD_CREATED_AT,
        lastCompletedAt: i === 0 ? null : noonUTC(i - 1),
        streak: i,
      });
      const res = await completeHabit(habit);
      expect(res.status).toBe(200);
    }
    expect(xpIncrements()).toHaveLength(100);
    expect(xpIncrements().every((x) => x === 10)).toBe(true);
    expect(xpIncrements().reduce((a, b) => a + b, 0)).toBe(1000);

    // Delete → zero XP writes.
    await deleteHabit(habitRow({ lastCompletedAt: noonUTC(99) }));
    for (const sql of empireSqlCalls()) {
      expect(sql).not.toContain('"xp"');
    }
    expect(xpIncrements().reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('7. same day: fresh habit + old habit → [0, 10] — legitimate multi-habit users keep their rewards', async () => {
    await completeHabit(habitRow({ id: 'habit-fresh', createdAt: FRESH_CREATED_AT }));
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue({ id: 'habit-fresh' }); // one completion already today
    await completeHabit(habitRow({ id: 'habit-old', createdAt: OLD_CREATED_AT }));

    expect(xpIncrements()).toEqual([0, 10]);
  });

  it('8. retry of the same completion within the period → 400 already_completed, XP granted exactly once (mandate 11)', async () => {
    // First completion pays.
    const first = await completeHabit(habitRow());
    expect(first.status).toBe(200);

    // Retry (double click / retry after timeout): the guard sees
    // lastCompletedAt = today → blocked BEFORE any XP write.
    H.MOCK_TX.$queryRaw.mockResolvedValue([
      habitRow({ lastCompletedAt: noonUTC(0), streak: 1 }),
    ]);
    const retry = await completeHabit(habitRow({ lastCompletedAt: noonUTC(0), streak: 1 }));
    expect(retry.status).toBe(400);

    expect(xpIncrements()).toEqual([10]);
  });
});

// ─── G-04 — Europe/Madrid day boundary for the fresh-habit gate ──

describe('G-04 — the fresh-habit gate uses Europe/Madrid, not UTC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1; // Madrid today = 2026-09-07 (starts 2026-09-06T22:00Z)
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
  });

  it('9. created 2026-09-06 23:30 Madrid (= 21:30Z) → "before today" → completion PAYS +10', async () => {
    const res = await completeHabit(habitRow({ createdAt: new Date('2026-09-06T21:30:00Z') }));
    expect(res.status).toBe(200);
    expect(xpIncrements()).toEqual([10]);
  });

  it('10. created 2026-09-07 00:30 Madrid (= 2026-09-06T22:30Z, "yesterday" in UTC) → FRESH → +0', async () => {
    const res = await completeHabit(habitRow({ createdAt: new Date('2026-09-06T22:30:00Z') }));
    expect(res.status).toBe(200);
    expect(xpIncrements()).toEqual([0]);
  });
});

// ─── G-04 — DELETE /api/habits: XP histórico intocable ───────

describe('G-04 — DELETE /api/habits never removes XP (historical integrity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('11. delete a habit that was never completed → no XP, no streak write at all (CASE 1)', async () => {
    const res = await deleteHabit(habitRow({ lastCompletedAt: null }));
    expect(res.status).toBe(200);

    expect(empireSqlCalls()).toEqual([]);
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('12. delete an OLD habit completed on a PAST day → XP untouched, streak untouched (CASES 2/3/4)', async () => {
    const res = await deleteHabit(habitRow({ lastCompletedAt: noonUTC(-1) })); // completed yesterday
    expect(res.status).toBe(200);

    // Only the advisory lock ran against the DB; no EmpireProgress write.
    expect(empireSqlCalls()).toEqual([]);
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('13. delete the sole habit completed TODAY → empire streak −1 (atomic) but XP never touched (H-12 kept, G-04 XP removed)', async () => {
    const res = await deleteHabit(habitRow({ lastCompletedAt: noonUTC(0) }));
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null); // no other habit completed today
    expect(res.status).toBe(200);

    const sql = empireSqlCalls();
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain('"streak" = GREATEST(0, "streak" - 1)');
    expect(sql[0]).not.toContain('"xp"');
  });

  it('14. DELETE repeated (retry) → idempotent success, NO double revert (mandate 8)', async () => {
    // First delete succeeds…
    const first = await deleteHabit(habitRow({ lastCompletedAt: noonUTC(0) }));
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    expect(first.status).toBe(200);
    expect(empireSqlCalls()).toHaveLength(1); // one streak decrement

    // …a second DELETE of the same habit (row already gone) finds 0 rows and
    // returns success WITHOUT re-running the streak decision.
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    const second = await deleteHabit(habitRow({ lastCompletedAt: noonUTC(0) }), 0);
    expect(second.status).toBe(200);
    expect(empireSqlCalls()).toEqual([]); // no second decrement, no XP write
  });

  it('15. two simultaneous DELETEs (modeled serialization via the advisory lock) → exactly one streak effect, zero XP writes (mandate 9)', async () => {
    // Request A and B both pass the pre-transaction check (the row still
    // exists for both), then the advisory lock serializes them: A deletes
    // (count 1) and owns the streak decision; B finds 0 rows and stops.
    const resA = await deleteHabit(habitRow({ lastCompletedAt: noonUTC(0) }), 1);
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    const resB = await deleteHabit(habitRow({ lastCompletedAt: noonUTC(0) }), 0);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const streakWrites = empireSqlCalls().filter((sql) => sql.includes('"streak"'));
    expect(streakWrites).toHaveLength(1);
    expect(empireSqlCalls().some((sql) => sql.includes('"xp"'))).toBe(false);
  });

  it('16. COMPLETE + DELETE concurrent (serialized) → consistent state: +10 XP KEPT, streak net 0 (mandate 10)', async () => {
    // Request A (PATCH) completes the old habit first: +10 XP, empire streak +1.
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    const patchRes = await completeHabit(habitRow({ lastCompletedAt: null, streak: 0 }));
    expect(patchRes.status).toBe(200);

    // Request B (DELETE) runs afterwards: the habit was completed today and
    // no other habit completed today → empire streak −1; XP NOT touched.
    await deleteHabit(habitRow({ lastCompletedAt: noonUTC(0), streak: 1 }), 1);
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);

    // XP: exactly the +10 granted by the completion — the delete removed nothing.
    expect(xpIncrements()).toEqual([10]);
    expect(empireSqlCalls().some((sql) => sql.includes('"xp"'))).toBe(false);
    // Streak: +1 (complete) and −1 (delete of the sole completion today) = consistent.
    const streakWrites = empireSqlCalls().filter((sql) => sql.includes('"streak"'));
    expect(streakWrites).toHaveLength(1);
  });
});

// ─── G-04 — farming cycles end-to-end ────────────────────────

describe('G-04 — farming cycles (create/complete/delete loops)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.habitLog.count.mockResolvedValue(0);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.habitLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `habit-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      streak: 0,
      lastCompletedAt: null,
      createdAt: FRESH_CREATED_AT,
    }));
  });

  it('17. create → complete → delete → recreate → complete, ALL same day → 0 XP total (CASE 6, mandate 7)', async () => {
    const { POST } = await import('@/app/api/habits/route');

    // Cycle 1
    await POST(makeRequest('/api/habits', 'POST', HABIT_BODY) as any);
    await completeHabit(habitRow({ createdAt: FRESH_CREATED_AT })); // fresh → +0
    await deleteHabit(habitRow({ createdAt: FRESH_CREATED_AT, lastCompletedAt: noonUTC(0) }), 1);
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);

    // Cycle 2 (recreated habit, still the same Madrid day)
    await POST(makeRequest('/api/habits', 'POST', HABIT_BODY) as any);
    await completeHabit(habitRow({ createdAt: FRESH_CREATED_AT })); // fresh → +0
    await deleteHabit(habitRow({ createdAt: FRESH_CREATED_AT, lastCompletedAt: noonUTC(0) }), 1);

    // Both completions valid but fresh: zero XP for the whole farming day.
    expect(xpIncrements()).toEqual([0, 0]);
    expect(empireSqlCalls().some((sql) => sql.includes('"xp"'))).toBe(false);
  });

  it('18. cross-day cycle cannot beat the legitimate rate: one habit completed once per day = +10/day, recreation adds nothing', async () => {
    const { POST } = await import('@/app/api/habits/route');

    // Day 1: create; Day 2: complete (+10, habit now 1 day old), delete, recreate.
    H.state.todayKey = dayKey(0);
    await POST(makeRequest('/api/habits', 'POST', HABIT_BODY) as any);

    H.state.todayKey = dayKey(1);
    await completeHabit(habitRow({ createdAt: noonUTC(0) })); // created DAY 1 < DAY 2 → pays
    await deleteHabit(habitRow({ createdAt: noonUTC(0), lastCompletedAt: noonUTC(1) }), 1);
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    await POST(makeRequest('/api/habits', 'POST', HABIT_BODY) as any); // recreated on DAY 2

    // Day 3: complete the recreated habit (+10 — it existed before DAY 3),
    // delete, recreate. The cycle now yields exactly what a user who simply
    // KEEPS one habit and completes it daily would earn: +10 per day.
    H.state.todayKey = dayKey(2);
    await completeHabit(habitRow({ createdAt: noonUTC(1) }));
    await deleteHabit(habitRow({ createdAt: noonUTC(1), lastCompletedAt: noonUTC(2) }), 1);

    expect(xpIncrements()).toEqual([10, 10]);
    expect(xpIncrements().reduce((a, b) => a + b, 0)).toBe(20); // 2 days × 10 = legitimate rate
  });
});

// ─── G-04 — undo mirrors the award condition exactly ─────────

describe('G-04 — POST /api/habits/undo reverts XP only for paying completions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null); // sole completion today
    H.MOCK_TX.habitLog.update.mockResolvedValue({});
  });

  async function undo(habit: Record<string, unknown>) {
    H.MOCK_TX.$queryRaw.mockResolvedValue([habit]);
    const { POST } = await import('@/app/api/habits/undo/route');
    return POST(makeRequest('/api/habits/undo', 'POST', { habitId: habit.id }) as any);
  }

  it('19. undo of a PAYING completion → atomic −10 XP + empire streak −1 (mirror of the grant)', async () => {
    const res = await undo(
      habitRow({ createdAt: OLD_CREATED_AT, lastCompletedAt: noonUTC(0), streak: 1 }),
    );
    expect(res.status).toBe(200);

    const sql = empireSqlCalls();
    expect(sql.some((s) => s.includes('"xp" = GREATEST(0, "xp" - 10)'))).toBe(true);
    expect(sql.some((s) => s.includes('"streak" = GREATEST(0, "streak" - 1)'))).toBe(true);
  });

  it('20. undo of a FRESH completion (paid +0) → NO XP removed, streak mirror kept', async () => {
    const res = await undo(
      habitRow({ createdAt: FRESH_CREATED_AT, lastCompletedAt: noonUTC(0), streak: 1 }),
    );
    expect(res.status).toBe(200);

    const sql = empireSqlCalls();
    expect(sql.some((s) => s.includes('"xp"'))).toBe(false);
    expect(sql.some((s) => s.includes('"streak" = GREATEST(0, "streak" - 1)'))).toBe(true);
  });
});

// ─── G-04 — concurrency machinery ────────────────────────────

describe('G-04 — advisory locks serialize PATCH/DELETE/undo (mandate 7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('21. PATCH acquires exactly one advisory lock on (user|disciplina|day) BEFORE the row lock', async () => {
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    await completeHabit(habitRow());

    const locks = lockCalls();
    expect(locks).toHaveLength(1);
    expect(locks[0][1]).toBe('user-1|disciplina|2026-09-07');

    // The $queryRaw (SELECT … FOR UPDATE) ran after the lock in the same tx.
    expect(H.MOCK_TX.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('22. DELETE and undo acquire the SAME lock family as PATCH', async () => {
    await deleteHabit(habitRow({ lastCompletedAt: noonUTC(0) }), 1);
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    expect(lockCalls()[0][1]).toBe('user-1|disciplina|2026-09-07');

    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.habitLog.update.mockResolvedValue({});

    H.MOCK_TX.$queryRaw.mockResolvedValue([
      habitRow({ createdAt: OLD_CREATED_AT, lastCompletedAt: noonUTC(0), streak: 1 }),
    ]);
    const { POST: UNDO } = await import('@/app/api/habits/undo/route');
    await UNDO(makeRequest('/api/habits/undo', 'POST', { habitId: 'habit-1' }) as any);

    expect(lockCalls()).toHaveLength(1);
    expect(lockCalls()[0][1]).toBe('user-1|disciplina|2026-09-07');
  });

  it('23. POST /api/habits takes NO advisory lock (it writes no empire state anymore)', async () => {
    const { POST } = await import('@/app/api/habits/route');
    await POST(makeRequest('/api/habits', 'POST', HABIT_BODY) as any);
    expect(lockCalls()).toHaveLength(0);
    expect(H.MOCK_TX.$executeRaw).not.toHaveBeenCalled();
  });

  it('24. day rollover: the lock seed follows the Madrid day (user-1|disciplina|2026-09-08)', async () => {
    H.state.todayKey = DAY_2;
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null);
    await completeHabit(habitRow());
    expect(lockCalls()[0][1]).toBe('user-1|disciplina|2026-09-08');
  });
});
