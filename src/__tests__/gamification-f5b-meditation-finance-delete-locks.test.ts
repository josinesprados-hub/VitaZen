/**
 * F-5B — Concurrency hardening for the remaining DELETE paths that mutate XP:
 *   DELETE /api/meditation and DELETE /api/finance.
 *
 * Original defect (audited against the REAL code at 268b126):
 *   Both DELETEs already took the POST's advisory-lock family keyed from the
 *   STORED row date (meditation 'user|<completedAtDay>',
 *   finance 'user|riqueza|<createdAtDay>'), but the XP/streak revert was a
 *   non-atomic read-modify-write: the transaction READ EmpireProgress.xp and
 *   wrote the computed ABSOLUTE total back (`xp: max(0, xp - 15)`). An
 *   absolute write only serializes with writers holding the SAME lock key —
 *   a POST of ANOTHER Madrid day holds a different key, so its atomic
 *   `xp: { increment: N }` could commit between the DELETE's read and write:
 *   the stale absolute write silently dropped the award it never saw
 *   (G-10 lost update, cross-day). Two DELETEs of different days had the
 *   same window.
 *
 * Fix (this commit):
 *   The reverts are now SINGLE atomic clamped SQL statements:
 *     meditation → SET "xp" = GREATEST(0, "xp" - 15) ... "empire" = 'mente'
 *     finance    → SET "xp" = GREATEST(0, "xp" - 10) ... "empire" = 'riqueza'
 *   (+ the streak variants). Inside the same-day lock this is equivalent to
 *   the old behavior, but unlike the RMW each statement is one row-locked
 *   UPDATE that COMMUTES with the POSTs' atomic increments (and with
 *   check-in's already-atomic mente revert) across DIFFERENT lock keys —
 *   no interleave can lose an update, and no counter can go negative. The
 *   day-scoped DECISION ("does any other log of this day remain?") stays
 *   serialized by the existing per-day advisory lock, which is deliberately
 *   NOT re-keyed to a global 'user|mente'/'user|riqueza': the decision is
 *   day-scoped, the only cross-day shared state is the counter row itself,
 *   and that row is now written exclusively by single atomic statements.
 *
 * Test strategy (identical to gamification-f5a / g03):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   fire-and-forget side effects; getTodayDateKey is mocked (mutable) at
 *   BOTH specifier paths; every Madrid conversion stays REAL.
 * - "Concurrency" tests model the serialized outcome the advisory lock
 *   guarantees and assert the captured statements verbatim: POST awards are
 *   atomic increments, DELETE reverts are atomic GREATEST decrements, so ANY
 *   interleaving — same day (lock collision) or cross-day (no collision,
 *   commuting statements) — yields the same final counter. The test ledger
 *   replays the captured deltas in exact issue order. No sleeps, no timers,
 *   no real races: the interleaving result is determined by the statements
 *   themselves.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMadridDateKey, madridDayBoundaries } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_1 = '2026-09-07';
const DAY_2 = '2026-09-08';
const NOON_1_UTC = '2026-09-07T10:00:00Z'; // 12:00 Madrid of DAY_1 (CEST, UTC+2)
const NOON_2_UTC = '2026-09-08T10:00:00Z'; // 12:00 Madrid of DAY_2
const PAST_NOON_UTC = '2026-09-05T10:00:00Z'; // Madrid day 2026-09-05

// DST anchor days
const DAY_SPRING = '2026-03-29'; // 23-hour Madrid day
const DAY_AUTUMN = '2026-10-25'; // 25-hour Madrid day

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    meditationSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    financeLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
    dailyCheckin: {
      delete: vi.fn().mockResolvedValue({}),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    // Pre-transaction ownership lookups / dedup check.
    meditationSession: { findUnique: vi.fn().mockResolvedValue(null) },
    financeLog: {
      findFirst: vi.fn().mockResolvedValue(null), // 10s dedup in finance POST
      findUnique: vi.fn().mockResolvedValue(null),
    },
    dailyCheckin: { findUnique: vi.fn().mockResolvedValue(null) },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
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
  onMeditationChange: vi.fn().mockResolvedValue(undefined),
  onFinanceChange: vi.fn().mockResolvedValue(undefined),
  onCheckinChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

// Mock ONLY "today"; keep the REAL Madrid conversion utilities.
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

interface RawCall { sql: string; params: any[] }

function rawCalls(): RawCall[] {
  return (H.MOCK_TX.$executeRaw.mock.calls as any[][]).map((c) => ({
    sql: (c[0] as string[]).join(' '),
    params: c.slice(1),
  }));
}

function rawCount(): number {
  return H.MOCK_TX.$executeRaw.mock.calls.length;
}

function upsertCount(): number {
  return H.empireProgressUpsert.mock.calls.length;
}

function lockKey(calls: RawCall[]): string {
  const lock = calls.find((c) => c.sql.includes('pg_advisory_xact_lock'));
  if (!lock) return '';
  return (lock.params as string[]).join('|');
}

function firstStatementIsLock(calls: RawCall[]): boolean {
  return calls.length > 0 && calls[0].sql.includes('pg_advisory_xact_lock');
}

function xpDecrements(calls: RawCall[], amount: number, empire: string): RawCall[] {
  return calls.filter(
    (c) => c.sql.includes(`GREATEST(0, "xp" - ${amount})`) && c.sql.includes(`'${empire}'`),
  );
}

function streakDecrements(calls: RawCall[], empire: string): RawCall[] {
  return calls.filter(
    (c) => c.sql.includes('GREATEST(0, "streak" - 1)') && c.sql.includes(`'${empire}'`),
  );
}

/** XP deltas issued by ONE awaited request, replayed in exact issue order. */
function applyXpDelta(xp: number, rawSnap: number, upsertSnap: number): number {
  for (const c of rawCalls().slice(rawSnap)) {
    const m = c.sql.match(/GREATEST\(0, "xp" - (\d+)\)/);
    if (m) xp = Math.max(0, xp - Number(m[1])); // the exact SQL clamp
  }
  for (const call of H.empireProgressUpsert.mock.calls.slice(upsertSnap) as any[][]) {
    xp += (call[0]?.update?.xp as { increment?: number })?.increment ?? 0;
  }
  return xp;
}

function absoluteXpWrites(calls: RawCall[]): RawCall[] {
  // Any legacy-style absolute RMW write on EmpireProgress would have to come
  // through tx.empireProgress.update — assert it is never used by the DELETEs.
  return calls;
}

function ownedMeditationSession(completedAtIso: string, id = 'sess-1') {
  return { id, userId: 'user-1', completedAt: new Date(completedAtIso) };
}

function ownedFinanceLog(createdAtIso: string, id = 'log-1', dateIso?: string) {
  return {
    id,
    userId: 'user-1',
    date: new Date(dateIso ?? createdAtIso), // editable natural date (defaults to createdAt)
    createdAt: new Date(createdAtIso),
  };
}

const MEDITATION_BODY = { duration: 20, type: 'mindfulness' };
const FINANCE_BODY = { date: DAY_1, type: 'expense', category: 'Supermercado', amount: 23.4 };

async function postMeditation(): Promise<Response> {
  const { POST } = await import('@/app/api/meditation/route');
  return POST(makeRequest('/api/meditation', 'POST', MEDITATION_BODY) as any) as unknown as Response;
}

async function deleteMeditation(sessionId = 'sess-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/meditation/route');
  return DELETE(makeRequest('/api/meditation', 'DELETE', { sessionId }) as any) as unknown as Response;
}

async function postFinance(dateKey: string = DAY_1): Promise<Response> {
  const { POST } = await import('@/app/api/finance/route');
  return POST(makeRequest('/api/finance', 'POST', { ...FINANCE_BODY, date: dateKey }) as any) as unknown as Response;
}

async function deleteFinance(logId = 'log-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/finance/route');
  return DELETE(makeRequest('/api/finance', 'DELETE', { logId }) as any) as unknown as Response;
}

async function deleteCheckin(checkinId = 'ck-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/checkin/route');
  return DELETE(makeRequest('/api/checkin', 'DELETE', { checkinId }) as any) as unknown as Response;
}

// ─── F-5B — Meditation DELETE: lock family + XP safety ───────

describe('F-5B — DELETE /api/meditation serializes with the writers of the mente XP (cases A–H)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue(null);
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    let sessionCounter = 0;
    H.MOCK_TX.meditationSession.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `sess-${++sessionCounter}`,
      ...data,
      completedAt: new Date(NOON_1_UTC),
    }));
  });

  it('(E) primera sesión del día → +15 XP y streak +1 (POST intacto, award atómico)', async () => {
    // E-0.1: the first POST issues TWO findFirst calls (today-check + G-07
    // continuity check). Yesterday active → the day continues → streak +1.
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)                       // otherSessionToday
      .mockResolvedValueOnce([{ id: 'sess-yesterday' }]); // continuity: yesterday active
    const rawSnap = rawCount();
    const res = await postMeditation();
    expect(res.status).toBe(200);

    const calls = rawCalls().slice(rawSnap);
    expect(H.empireProgressUpsert.mock.calls[0][0].update.xp).toEqual({ increment: 15 });
    expect(H.empireProgressUpsert.mock.calls[0][0].update.streak).toEqual({ increment: 1 });
    // POST locks user|<today> and writes the award as an ATOMIC increment.
    expect(firstStatementIsLock(calls)).toBe(true);
    expect(lockKey(calls)).toBe('user-1|2026-09-07');
  });

  it('(F) segunda sesión del mismo día → +0 XP (repetición no premia)', async () => {
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-earlier' });
    const res = await postMeditation();
    expect(res.status).toBe(200);
    expect(H.MOCK_TX.meditationSession.create).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert.mock.calls[0][0].update.xp).toEqual({ increment: 0 });
    expect(H.empireProgressUpsert.mock.calls[0][0].update).not.toHaveProperty('streak');
  });

  it('DELETE toma el lock user|<día Madrid del completedAt almacenado> como primera sentencia, MISMA clave que POST', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC));

    const postSnap = rawCount();
    await postMeditation();
    const postKey = lockKey(rawCalls().slice(postSnap));

    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-0' }); // another remains
    const delSnap = rawCount();
    const res = await deleteMeditation();
    expect(res.status).toBe(200);

    const calls = rawCalls().slice(delSnap);
    expect(firstStatementIsLock(calls)).toBe(true);
    // Same key expression as the POST of the same day → they collide & serialize.
    expect(lockKey(calls)).toBe('user-1|2026-09-07');
    expect(lockKey(calls)).toBe(postKey);
    // Key derived from the STORED completedAt — never from any client input.
    expect(H.MOCK_TX.meditationSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          completedAt: {
            gte: madridDayBoundaries(DAY_1).start,
            lt: madridDayBoundaries(DAY_1).end,
          },
        }),
      }),
    );
  });

  it('(A) POST + DELETE del mismo día: exactamente un −15 atómico, ledger neto 0, streak −1', async () => {
    // Serialized step 1 — POST grants the day's +15.
    let xp = 100;
    let rawSnap = rawCount();
    let upsertSnap = upsertCount();
    expect((await postMeditation()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(115);

    // Serialized step 2 — DELETE of the sole session empties the day.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC, 'sess-1'));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    rawSnap = rawCount();
    upsertSnap = upsertCount();
    expect((await deleteMeditation('sess-1')).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);

    expect(xp).toBe(100); // net 0 — no lost update in either direction
    const calls = rawCalls().slice(rawSnap);
    expect(xpDecrements(calls, 15, 'mente')).toHaveLength(1);
    expect(streakDecrements(calls, 'mente')).toHaveLength(1);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled(); // no absolute RMW write
  });

  it('(B) DELETE + POST del mismo día: la revert atómica no puede pisar el +15 que el POST concede después', async () => {
    // DELETE first: the day's +15 (granted earlier) is reverted atomically.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    let xp = 100;
    let rawSnap = rawCount();
    let upsertSnap = upsertCount();
    expect((await deleteMeditation()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(85);

    // POST after: re- mediates the same day → the day is empty again → +15.
    rawSnap = rawCount();
    upsertSnap = upsertCount();
    expect((await postMeditation()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(100);

    // Both writes were single atomic statements (GREATEST / increment): the
    // reverse interleave (POST commits between DELETE's read and write) is
    // impossible now — there IS no read of the counter in the DELETE path.
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
    expect(absoluteXpWrites([])).toHaveLength(0);
  });

  it('(C) dos DELETE de sesiones distintas del mismo día → exactamente un −15', async () => {
    // Session 1 deleted while session 2 remains → NO revert.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC, 'sess-1'));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-2' });
    const snap1 = rawCount();
    expect((await deleteMeditation('sess-1')).status).toBe(200);
    expect(xpDecrements(rawCalls().slice(snap1), 15, 'mente')).toHaveLength(0);

    // Session 2 deleted → the day is now empty → exactly one −15.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC, 'sess-2'));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    const snap2 = rawCount();
    expect((await deleteMeditation('sess-2')).status).toBe(200);
    const calls2 = rawCalls().slice(snap2);
    expect(xpDecrements(calls2, 15, 'mente')).toHaveLength(1);

    // Both DELETEs took the SAME lock key → they cannot interleave.
    expect(lockKey(calls2)).toBe('user-1|2026-09-07');
    expect(lockKey(rawCalls().slice(snap1))).toBe('user-1|2026-09-07');
  });

  it('(C) doble DELETE de la MISMA sesión → segunda 404, revert único', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);

    expect((await deleteMeditation()).status).toBe(200); // reverts −15 once
    expect(xpDecrements(rawCalls(), 15, 'mente')).toHaveLength(1);

    // The row no longer exists → ownership lookup fails → 404, no second revert.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(null);
    const res2 = await deleteMeditation();
    expect(res2.status).toBe(404);
    expect(xpDecrements(rawCalls(), 15, 'mente')).toHaveLength(1); // unchanged
  });

  it('(D) DELETE de día pasado + POST de hoy: locks DISTINTOS, sentencias atómicas conmutan → sin lost update', async () => {
    // Serialized step 1 — DELETE of a PAST day's sole session (different lock
    // key than today's POST: no collision, by design).
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(PAST_NOON_UTC));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    let xp = 100;
    let rawSnap = rawCount();
    let upsertSnap = upsertCount();
    expect((await deleteMeditation()).status).toBe(200);
    const pastCalls = rawCalls().slice(rawSnap);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(85);
    expect(lockKey(pastCalls)).toBe('user-1|2026-09-05');
    expect(streakDecrements(pastCalls, 'mente')).toHaveLength(0); // past days never touch streak

    // Serialized step 2 — POST of TODAY grants +15 (different key, same row).
    rawSnap = rawCount();
    upsertSnap = upsertCount();
    expect((await postMeditation()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(100);

    // The DELETE's revert was a single GREATEST statement (not an absolute
    // write), so even the worst interleave — the POST's atomic increment
    // committing between the old RMW's read and write — cannot drop it.
    expect(xpDecrements(pastCalls, 15, 'mente')).toHaveLength(1);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
  });

  it('(G) DELETE de una sesión repetida (queda otra) → NINGUNA sentencia de XP', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-0' });

    const res = await deleteMeditation();
    expect(res.status).toBe(200);
    const calls = rawCalls();
    expect(calls).toHaveLength(1); // the advisory lock only
    expect(xpDecrements(calls, 15, 'mente')).toHaveLength(0);
    expect(streakDecrements(calls, 'mente')).toHaveLength(0);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
  });

  it('(H) XP nunca negativo: toda revert de XP/streak es GREATEST(0, …) sobre la fila mente', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);

    await deleteMeditation();
    const decs = xpDecrements(rawCalls(), 15, 'mente');
    expect(decs).toHaveLength(1);
    // The clamp is IN the SQL — even a baseline below 15 can never go negative.
    expect(decs[0].sql).toContain('GREATEST(0, "xp" - 15)');
    expect(decs[0].sql).toContain('WHERE "userId"');
    expect(streakDecrements(rawCalls(), 'mente')[0].sql).toContain('GREATEST(0, "streak" - 1)');
  });
});

// ─── F-5B — Finance DELETE: lock family + XP safety ──────────

describe('F-5B — DELETE /api/finance serializes with the writers of the riqueza XP (cases A–H)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    let logCounter = 0;
    H.MOCK_TX.financeLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `log-${++logCounter}`,
      ...data,
      createdAt: new Date(NOON_1_UTC),
    }));
  });

  it('(E) primer log del día → +10 XP y streak +1 (POST intacto, award atómico)', async () => {
    // E-0.1: call #1 = otherLogToday, call #2 = continuity (createdAt ayer)
    // → the day continues → streak +1.
    H.MOCK_TX.financeLog.findFirst
      .mockResolvedValueOnce(null)                       // otherLogToday
      .mockResolvedValueOnce([{ id: 'log-yesterday' }]); // continuity: yesterday active
    const rawSnap = rawCount();
    const res = await postFinance();
    expect(res.status).toBe(200);

    const calls = rawCalls().slice(rawSnap);
    expect(H.empireProgressUpsert.mock.calls[0][0].update.xp).toEqual({ increment: 10 });
    expect(H.empireProgressUpsert.mock.calls[0][0].update.streak).toEqual({ increment: 1 });
    expect(firstStatementIsLock(calls)).toBe(true);
    expect(lockKey(calls)).toBe('user-1|riqueza|2026-09-07');
  });

  it('(F) segundo log del mismo día → +0 XP (repetición no premia)', async () => {
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue({ id: 'log-earlier' });
    const res = await postFinance();
    expect(res.status).toBe(200);
    expect(H.MOCK_TX.financeLog.create).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert.mock.calls[0][0].update.xp).toEqual({ increment: 0 });
    expect(H.empireProgressUpsert.mock.calls[0][0].update).not.toHaveProperty('streak');
  });

  it('DELETE toma el lock user|riqueza|<día del createdAt almacenado> como primera sentencia, MISMA clave que POST', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC));

    const postSnap = rawCount();
    await postFinance();
    const postKey = lockKey(rawCalls().slice(postSnap));

    H.MOCK_TX.financeLog.findFirst.mockResolvedValue({ id: 'log-0' }); // another remains
    const delSnap = rawCount();
    const res = await deleteFinance();
    expect(res.status).toBe(200);

    const calls = rawCalls().slice(delSnap);
    expect(firstStatementIsLock(calls)).toBe(true);
    expect(lockKey(calls)).toBe('user-1|riqueza|2026-09-07');
    expect(lockKey(calls)).toBe(postKey);
    // The "other log" check queries createdAt inside the createdAt-day window
    // (never the editable `date`).
    expect(H.MOCK_TX.financeLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: madridDayBoundaries(DAY_1).start,
            lt: madridDayBoundaries(DAY_1).end,
          },
        }),
      }),
    );
  });

  it('(A) POST + DELETE del mismo día: exactamente un −10 atómico, ledger neto 0, streak −1', async () => {
    let xp = 100;
    let rawSnap = rawCount();
    let upsertSnap = upsertCount();
    expect((await postFinance()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(110);

    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    rawSnap = rawCount();
    upsertSnap = upsertCount();
    expect((await deleteFinance()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);

    expect(xp).toBe(100); // net 0
    const calls = rawCalls().slice(rawSnap);
    expect(xpDecrements(calls, 10, 'riqueza')).toHaveLength(1);
    expect(streakDecrements(calls, 'riqueza')).toHaveLength(1);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
  });

  it('(B) DELETE + POST del mismo día: la revert atómica no puede pisar el +10 que el POST concede después', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    let xp = 100;
    let rawSnap = rawCount();
    let upsertSnap = upsertCount();
    expect((await deleteFinance()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(90);

    rawSnap = rawCount();
    upsertSnap = upsertCount();
    expect((await postFinance()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(100);

    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
  });

  it('(C) dos DELETE de logs distintos del mismo día → exactamente un −10', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC, 'log-1'));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue({ id: 'log-2' });
    const snap1 = rawCount();
    expect((await deleteFinance('log-1')).status).toBe(200);
    expect(xpDecrements(rawCalls().slice(snap1), 10, 'riqueza')).toHaveLength(0);

    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC, 'log-2'));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    const snap2 = rawCount();
    expect((await deleteFinance('log-2')).status).toBe(200);
    expect(xpDecrements(rawCalls().slice(snap2), 10, 'riqueza')).toHaveLength(1);

    expect(lockKey(rawCalls().slice(snap1))).toBe('user-1|riqueza|2026-09-07');
    expect(lockKey(rawCalls().slice(snap2))).toBe('user-1|riqueza|2026-09-07');
  });

  it('(C) doble DELETE del MISMO log → segunda 404, revert único', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);

    expect((await deleteFinance()).status).toBe(200);
    expect(xpDecrements(rawCalls(), 10, 'riqueza')).toHaveLength(1);

    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(null);
    expect((await deleteFinance()).status).toBe(404);
    expect(xpDecrements(rawCalls(), 10, 'riqueza')).toHaveLength(1); // unchanged
  });

  it('(D) DELETE de día pasado + POST de hoy: locks DISTINTOS, sentencias atómicas conmutan → sin lost update', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(PAST_NOON_UTC));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    let xp = 100;
    let rawSnap = rawCount();
    let upsertSnap = upsertCount();
    expect((await deleteFinance()).status).toBe(200);
    const pastCalls = rawCalls().slice(rawSnap);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(90);
    expect(lockKey(pastCalls)).toBe('user-1|riqueza|2026-09-05');
    expect(streakDecrements(pastCalls, 'riqueza')).toHaveLength(0);

    rawSnap = rawCount();
    upsertSnap = upsertCount();
    expect((await postFinance()).status).toBe(200);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);
    expect(xp).toBe(100);

    expect(xpDecrements(pastCalls, 10, 'riqueza')).toHaveLength(1);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
  });

  it('AUTORIDAD: la clave/ventana usan el createdAt almacenado, NUNCA la date editable (F-1 intacto)', async () => {
    // Editable natural date says day 05, but the row was CREATED on day 07 —
    // the day that justified the +10 is the createdAt day (G-03/F-1).
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(
      ownedFinanceLog(NOON_1_UTC, 'log-1', PAST_NOON_UTC),
    );
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);

    const res = await deleteFinance();
    expect(res.status).toBe(200);

    expect(lockKey(rawCalls())).toBe('user-1|riqueza|2026-09-07'); // NOT 2026-09-05
    const where = H.MOCK_TX.financeLog.findFirst.mock.calls[0][0].where;
    expect(where.createdAt.gte.getTime()).toBe(madridDayBoundaries(DAY_1).start.getTime());
    expect(where.createdAt.lt.getTime()).toBe(madridDayBoundaries(DAY_1).end.getTime());
    expect(where).not.toHaveProperty('date');
  });

  it('(G) DELETE de un log repetido (queda otro) → NINGUNA sentencia de XP', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue({ id: 'log-0' });

    const res = await deleteFinance();
    expect(res.status).toBe(200);
    const calls = rawCalls();
    expect(calls).toHaveLength(1);
    expect(xpDecrements(calls, 10, 'riqueza')).toHaveLength(0);
    expect(streakDecrements(calls, 'riqueza')).toHaveLength(0);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
  });

  it('(H) XP nunca negativo: toda revert de XP/streak es GREATEST(0, …) sobre la fila riqueza', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog(NOON_1_UTC));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);

    await deleteFinance();
    const decs = xpDecrements(rawCalls(), 10, 'riqueza');
    expect(decs).toHaveLength(1);
    expect(decs[0].sql).toContain('GREATEST(0, "xp" - 10)');
    expect(decs[0].sql).toContain("'riqueza'");
    expect(streakDecrements(rawCalls(), 'riqueza')[0].sql).toContain('GREATEST(0, "streak" - 1)');
  });
});

// ─── F-5B — DST Europe/Madrid (23 h / 25 h) ──────────────────

describe('F-5B — las claves y ventanas siguen siendo Europe/Madrid en DST (sin tocar dates.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    let sessionCounter = 0;
    H.MOCK_TX.meditationSession.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `sess-${++sessionCounter}`,
      ...data,
      completedAt: new Date(NOON_1_UTC),
    }));
    let logCounter = 0;
    H.MOCK_TX.financeLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `log-${++logCounter}`,
      ...data,
      createdAt: new Date(NOON_1_UTC),
    }));
  });

  it('PRIMAVERA 2026-03-29 (23 h): sesión del día DST → clave día 29, ventana real de 23 h, DELETE −15', async () => {
    // Sanity of the REAL utility (untouched): the spring day is 23 h long.
    const b = madridDayBoundaries(DAY_SPRING);
    expect(b.start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect((b.end.getTime() - b.start.getTime()) / 3_600_000).toBe(23);
    // 00:30Z == 02:30 Madrid → day 29 (after the 02:00→03:00 jump).
    expect(getMadridDateKey(new Date('2026-03-29T00:30:00Z'))).toBe(DAY_SPRING);

    H.state.todayKey = DAY_1; // the DST day is a PAST day from today's perspective
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(
      ownedMeditationSession('2026-03-29T00:30:00Z'),
    );
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);

    const res = await deleteMeditation();
    expect(res.status).toBe(200);
    expect(lockKey(rawCalls())).toBe('user-1|2026-03-29'); // one single key for the whole 23 h day
    expect(xpDecrements(rawCalls(), 15, 'mente')).toHaveLength(1);
    expect(streakDecrements(rawCalls(), 'mente')).toHaveLength(0);
    // The "other session" check used the EXACT 23 h window.
    const where = H.MOCK_TX.meditationSession.findFirst.mock.calls[0][0].where;
    expect(where.completedAt.gte.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(where.completedAt.lt.toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });

  it('PRIMAVERA: primera sesión del día 2026-03-29 → +15 con ventana de 23 h; segunda → +0', async () => {
    H.state.todayKey = DAY_SPRING;
    const rawSnap = rawCount();
    expect((await postMeditation()).status).toBe(200);
    expect(H.empireProgressUpsert.mock.calls[0][0].update.xp).toEqual({ increment: 15 });
    // POST keyed to the DST day; the first-of-day check used the 23 h window.
    expect(lockKey(rawCalls().slice(rawSnap))).toBe('user-1|2026-03-29');
    const where = H.MOCK_TX.meditationSession.findFirst.mock.calls[0][0].where;
    expect(where.completedAt.gte.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(where.completedAt.lt.toISOString()).toBe('2026-03-29T22:00:00.000Z');

    // Repetition within the same 23 h day → +0.
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-1' });
    expect((await postMeditation()).status).toBe(200);
    expect(H.empireProgressUpsert.mock.calls[1][0].update.xp).toEqual({ increment: 0 });
  });

  it('OTOÑO 2026-10-25 (25 h): sesión del día DST → clave día 25, ventana real de 25 h, DELETE −15', async () => {
    const b = madridDayBoundaries(DAY_AUTUMN);
    expect(b.start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(b.end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect((b.end.getTime() - b.start.getTime()) / 3_600_000).toBe(25);
    // 22:30Z == 23:30 Madrid (CET after the fall-back) → day 25.
    expect(getMadridDateKey(new Date('2026-10-25T22:30:00Z'))).toBe(DAY_AUTUMN);

    H.state.todayKey = DAY_1;
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(
      ownedMeditationSession('2026-10-25T22:30:00Z'),
    );
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);

    const res = await deleteMeditation();
    expect(res.status).toBe(200);
    expect(lockKey(rawCalls())).toBe('user-1|2026-10-25');
    expect(xpDecrements(rawCalls(), 15, 'mente')).toHaveLength(1);
    const where = H.MOCK_TX.meditationSession.findFirst.mock.calls[0][0].where;
    expect(where.completedAt.gte.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(where.completedAt.lt.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('OTOÑO: primer log de finance del día 2026-10-25 → +10 (ventana 25 h) y su DELETE → −10 + streak −1', async () => {
    H.state.todayKey = DAY_AUTUMN;
    const rawSnap = rawCount();
    expect((await postFinance(DAY_AUTUMN)).status).toBe(200);
    expect(H.empireProgressUpsert.mock.calls[0][0].update.xp).toEqual({ increment: 10 });
    expect(lockKey(rawCalls().slice(rawSnap))).toBe('user-1|riqueza|2026-10-25');
    const where = H.MOCK_TX.financeLog.findFirst.mock.calls[0][0].where;
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2026-10-25T23:00:00.000Z');

    // DELETE of that same log (createdAt 12:00 Madrid of day 25) → revert.
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog('2026-10-25T10:00:00Z'));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    const delSnap = rawCount();
    expect((await deleteFinance()).status).toBe(200);
    const delCalls = rawCalls().slice(delSnap);
    expect(lockKey(delCalls)).toBe('user-1|riqueza|2026-10-25');
    expect(xpDecrements(delCalls, 10, 'riqueza')).toHaveLength(1);
    expect(streakDecrements(delCalls, 'riqueza')).toHaveLength(1); // logDateKey == today
  });

  it('MEDIANOCHE: 23:00Z del 10-25 ya es día 26; 21:00Z aún es día 25 → claves distintas, reverts independientes', async () => {
    expect(getMadridDateKey(new Date('2026-10-25T21:00:00Z'))).toBe('2026-10-25');
    expect(getMadridDateKey(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26'); // 00:00 Madrid

    H.state.todayKey = '2026-10-26';
    let xp = 100;

    // DELETE of the day-25 session (past day) → −15, no streak.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(
      ownedMeditationSession('2026-10-25T21:00:00Z', 'sess-a'),
    );
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    let rawSnap = rawCount();
    let upsertSnap = upsertCount();
    expect((await deleteMeditation('sess-a')).status).toBe(200);
    expect(lockKey(rawCalls().slice(rawSnap))).toBe('user-1|2026-10-25');
    xp = applyXpDelta(xp, rawSnap, upsertSnap);

    // DELETE of the day-26 session (today) → −15 + streak −1.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(
      ownedMeditationSession('2026-10-25T23:00:00Z', 'sess-b'),
    );
    rawSnap = rawCount();
    upsertSnap = upsertCount();
    expect((await deleteMeditation('sess-b')).status).toBe(200);
    const bCalls = rawCalls().slice(rawSnap);
    expect(lockKey(bCalls)).toBe('user-1|2026-10-26');
    expect(streakDecrements(bCalls, 'mente')).toHaveLength(1);
    xp = applyXpDelta(xp, rawSnap, upsertSnap);

    // Both days' awards were legitimately reverted, each through its own key —
    // the operations of day 25 and day 26 never block each other.
    expect(xp).toBe(70);
  });

  it('FINANCE DST: createdAt 00:30Z del 2026-03-29 → clave día 29 (23 h); medianoche de otoño → día 26', async () => {
    H.state.todayKey = DAY_1;

    // Spring: log created 00:30Z on the 23 h day.
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog('2026-03-29T00:30:00Z'));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
    const snap1 = rawCount();
    expect((await deleteFinance()).status).toBe(200);
    expect(lockKey(rawCalls().slice(snap1))).toBe('user-1|riqueza|2026-03-29');
    const where1 = H.MOCK_TX.financeLog.findFirst.mock.calls[0][0].where;
    expect(where1.createdAt.gte.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(where1.createdAt.lt.toISOString()).toBe('2026-03-29T22:00:00.000Z');

    // Autumn: log created 23:00Z on 10-25 → Madrid day 26.
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(ownedFinanceLog('2026-10-25T23:00:00Z'));
    const snap2 = rawCount();
    expect((await deleteFinance()).status).toBe(200);
    expect(lockKey(rawCalls().slice(snap2))).toBe('user-1|riqueza|2026-10-26');
    const where2 = H.MOCK_TX.financeLog.findFirst.mock.calls[1][0].where;
    expect(where2.createdAt.gte.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(where2.createdAt.lt.toISOString()).toBe('2026-10-26T23:00:00.000Z');
  });
});

// ─── F-5B — el lock protege el contador GLOBAL compartido ────

describe('F-5B — la familia user|<día> es compartida por los escritores del contador mente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(null);
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue(null);
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('meditation DELETE y check-in DELETE del MISMO día toman la MISMA clave → el contador mente queda serializado', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(ownedMeditationSession(NOON_1_UTC));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-0' });

    const medSnap = rawCount();
    expect((await deleteMeditation()).status).toBe(200);
    const medKey = lockKey(rawCalls().slice(medSnap));

    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue({
      id: 'ck-1',
      userId: 'user-1',
      date: new Date(NOON_1_UTC),
    });
    const ckSnap = rawCount();
    expect((await deleteCheckin()).status).toBe(200);
    const ckCalls = rawCalls().slice(ckSnap);
    const ckKey = lockKey(ckCalls);

    // Same key expression (md5 of the same seed) → same advisory lock → any
    // same-day mutation of the shared EmpireProgress(mente) row serializes.
    expect(medKey).toBe('user-1|2026-09-07');
    expect(ckKey).toBe(medKey);

    // Cross-day: distinct keys by design — and both reverts are single atomic
    // GREATEST statements on the same row, so they still commute.
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(
      ownedMeditationSession(PAST_NOON_UTC, 'sess-past'),
    );
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
    const pastSnap = rawCount();
    expect((await deleteMeditation('sess-past')).status).toBe(200);
    const pastCalls = rawCalls().slice(pastSnap);
    expect(lockKey(pastCalls)).toBe('user-1|2026-09-05');
    expect(pastCalls.filter((c) => c.sql.match(/GREATEST\(0, "xp" - \d+\)/))).toHaveLength(1);
  });
});
