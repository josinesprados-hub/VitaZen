/**
 * FASE 14 — G-03: daily XP gate for meditation and finance
 *
 * G-03 — POST /api/meditation and POST /api/finance:
 *   XP becomes a once-per-Madrid-day reward:
 *     - Meditation: the FIRST valid session of the day awards +15 XP (mente);
 *       every later session of the same day still creates normally but awards
 *       +0 XP.
 *     - Finance: the FIRST valid log of the day awards +10 XP (riqueza);
 *       every later log of the same day still creates normally but awards
 *       +0 XP.
 *
 *   The gate REUSES the existing concurrency-safe machinery:
 *     - isFirstSessionToday / isFirstLogToday are computed INSIDE a Prisma
 *       transaction that first acquires a transaction-scoped PostgreSQL
 *       advisory lock on (userId, madridDay) — the exact pattern introduced
 *       by CERT-1/F-4 and audited in FASE 14. Two concurrent POSTs therefore
 *       serialize: the second one sees the first session/log and awards +0.
 *   The DELETE paths are made coherent with the new award semantics: the
 *   day's XP is reverted only when the deleted row was the LAST one of its
 *   Madrid day (deleting a repeat row that never awarded XP must not remove
 *   XP). DELETEs now take the same advisory-lock family so POST↔DELETE
 *   decisions for the same day cannot interleave.
 *
 * Test strategy (same as gamification-xp-farming.test.ts):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   fire-and-forget side effects.
 * - getTodayDateKey is mocked (mutable state) at BOTH specifier paths
 *   (@/lib/dates and @/lib/deterministic) — the relative re-export inside
 *   deterministic.ts must not bypass the mock. getMadridDateKey and
 *   madridDayBoundaries remain REAL (Europe/Madrid via Intl).
 * - "Concurrency" tests model the serialized outcome the advisory lock
 *   guarantees at DB level: the second transaction observes the first
 *   session/log and therefore awards +0 XP. The advisory-lock invocation
 *   itself is asserted per request.
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
    empireProgress: {
      upsert: empireProgressUpsert,
      findUnique: empireProgressFindUnique,
      update: empireProgressUpdate,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    meditationSession: {
      findUnique: vi.fn(),
    },
    financeLog: {
      // Pre-transaction 10-second dedup check in finance POST.
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn(),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
    empireProgressFindUnique,
    empireProgressUpdate,
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

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onMeditationChange: vi.fn().mockResolvedValue(undefined),
  onFinanceChange: vi.fn().mockResolvedValue(undefined),
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

const MEDITATION_VALID_BODY = { duration: 20, type: 'mindfulness' };
const FINANCE_VALID_BODY = {
  date: DAY_1,
  type: 'expense',
  category: 'Supermercado',
  amount: 23.4,
  description: 'Compra semanal',
};

// Instants whose Madrid day is unambiguous (September = CEST, UTC+2):
// 10:00Z → 12:00 Madrid of the same calendar day.
const TODAY_NOON_UTC = new Date('2026-09-07T10:00:00Z'); // Madrid day 2026-09-07
const PAST_NOON_UTC = new Date('2026-09-05T10:00:00Z'); // Madrid day 2026-09-05

function xpIncrements(): number[] {
  return H.empireProgressUpsert.mock.calls.map(
    (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
  );
}

// ─── G-03 — Meditation POST ──────────────────────────────────

describe('G-03 — POST /api/meditation awards +15 XP only on the first session of the Madrid day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    let sessionCounter = 0;
    H.MOCK_TX.meditationSession.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `sess-${++sessionCounter}`,
      ...data,
      completedAt: TODAY_NOON_UTC,
    }));
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);
  });

  it('1. first session of the day → created, +15 XP and streak +1', async () => {
    const { POST } = await import('@/app/api/meditation/route');
    const res = await POST(makeRequest('/api/meditation', 'POST', MEDITATION_VALID_BODY) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.session.id).toBe('sess-1');

    // Session persisted normally.
    expect(H.MOCK_TX.meditationSession.create).toHaveBeenCalledTimes(1);
    expect(H.MOCK_TX.meditationSession.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', duration: 20, type: 'mindfulness' },
    });

    // XP reward: exactly +15 (same value as before), streak +1.
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_empire: { userId: 'user-1', empire: 'mente' } },
        update: { xp: { increment: 15 }, streak: { increment: 1 } },
      }),
    );
  });

  it('2. second session of the same day → created with +0 XP (no streak)', async () => {
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-earlier' });
    const { POST } = await import('@/app/api/meditation/route');
    const res = await POST(makeRequest('/api/meditation', 'POST', MEDITATION_VALID_BODY) as any);
    expect(res.status).toBe(200);

    // The session MUST still be saved (history, stats, achievements…).
    expect(H.MOCK_TX.meditationSession.create).toHaveBeenCalledTimes(1);

    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    const call = H.empireProgressUpsert.mock.calls[0][0];
    expect(call.update.xp).toEqual({ increment: 0 });
    expect(call.update).not.toHaveProperty('streak');
  });

  it('3. several sessions in one day → all created, exactly one +15 reward', async () => {
    let call = 0;
    H.MOCK_TX.meditationSession.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'sess-earlier' };
    });

    const { POST } = await import('@/app/api/meditation/route');
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest('/api/meditation', 'POST', MEDITATION_VALID_BODY) as any);
      expect(res.status).toBe(200);
    }

    expect(H.MOCK_TX.meditationSession.create).toHaveBeenCalledTimes(5);
    expect(xpIncrements()).toEqual([15, 0, 0, 0, 0]);
    // Total XP for the day: exactly 15.
    expect(xpIncrements().reduce((a, b) => a + b, 0)).toBe(15);
  });

  it('4. sessions on different days → one +15 reward per Madrid day', async () => {
    const { POST } = await import('@/app/api/meditation/route');

    // Day 1: first session → +15.
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValueOnce(null);
    await POST(makeRequest('/api/meditation', 'POST', MEDITATION_VALID_BODY) as any);

    // Advance the mocked clock to the next Madrid day.
    H.state.todayKey = DAY_2;
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValueOnce(null);
    await POST(makeRequest('/api/meditation', 'POST', MEDITATION_VALID_BODY) as any);

    expect(xpIncrements()).toEqual([15, 15]);

    // The "other session today?" check must query the correct Madrid window
    // for each day (real boundaries from the unified dates utility).
    const windows = H.MOCK_TX.meditationSession.findFirst.mock.calls.map(
      (c: any[]) => c[0].where.completedAt,
    );
    const day1 = madridDayBoundaries(DAY_1);
    const day2 = madridDayBoundaries(DAY_2);
    expect(windows[0].gte.getTime()).toBe(day1.start.getTime());
    expect(windows[0].lt.getTime()).toBe(day1.end.getTime());
    expect(windows[1].gte.getTime()).toBe(day2.start.getTime());
    expect(windows[1].lt.getTime()).toBe(day2.end.getTime());
  });

  it('5. two simultaneous first-of-day requests → exactly one +15, one +0, both succeed', async () => {
    // Models the advisory-lock outcome: the second transaction runs strictly
    // after the first committed, so it observes the first session.
    let call = 0;
    H.MOCK_TX.meditationSession.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'sess-earlier' };
    });

    const { POST } = await import('@/app/api/meditation/route');
    const [resA, resB] = await Promise.all([
      POST(makeRequest('/api/meditation', 'POST', MEDITATION_VALID_BODY) as any),
      POST(makeRequest('/api/meditation', 'POST', MEDITATION_VALID_BODY) as any),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // Both sessions were created (neither request failed).
    expect(H.MOCK_TX.meditationSession.create).toHaveBeenCalledTimes(2);

    // Exactly one daily reward.
    const increments = xpIncrements().sort((a: number, b: number) => b - a);
    expect(increments).toEqual([15, 0]);

    // The streak may only increment once as well.
    const streakIncrements = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => c[0]?.update?.streak as { increment: number } | undefined)
      .filter(Boolean);
    expect(streakIncrements).toHaveLength(1);

    // Every POST took the (userId, madridDay) advisory lock before deciding.
    expect(H.MOCK_TX.$executeRaw).toHaveBeenCalledTimes(2);
    expect(H.MOCK_TX.$executeRaw.mock.calls[0][1]).toBe('user-1|2026-09-07');
    expect(H.MOCK_TX.$executeRaw.mock.calls[1][1]).toBe('user-1|2026-09-07');
  });

  it('6. day boundary is Europe/Madrid (22:00 UTC in summer), not UTC', () => {
    // Pure mapping checks with the REAL unified utilities (no mocking):
    // a session created at 21:59Z and one at 22:00Z belong to different
    // Madrid days, so each can earn its own daily reward.
    expect(getMadridDateKey(new Date('2026-09-07T21:59:00Z'))).toBe(DAY_1);
    expect(getMadridDateKey(new Date('2026-09-07T22:00:00Z'))).toBe(DAY_2);

    // The route's "today" window comes from madridDayBoundaries(DAY_1):
    // start = 2026-09-06T22:00:00Z, end = 2026-09-07T22:00:00Z (CEST).
    const { start, end } = madridDayBoundaries(DAY_1);
    expect(start.toISOString()).toBe('2026-09-06T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-07T22:00:00.000Z');
  });
});

// ─── G-03 — Finance POST ─────────────────────────────────────

describe('G-03 — POST /api/finance awards +10 XP only on the first log of the Madrid day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });

    let logCounter = 0;
    H.MOCK_TX.financeLog.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: `log-${++logCounter}`,
      ...data,
      createdAt: TODAY_NOON_UTC,
    }));
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);
  });

  it('7. first log of the day → created, +10 XP and streak +1', async () => {
    const { POST } = await import('@/app/api/finance/route');
    const res = await POST(makeRequest('/api/finance', 'POST', FINANCE_VALID_BODY) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.log.id).toBe('log-1');

    expect(H.MOCK_TX.financeLog.create).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_empire: { userId: 'user-1', empire: 'riqueza' } },
        update: { xp: { increment: 10 }, streak: { increment: 1 } },
      }),
    );
  });

  it('8. second log of the same day → created with +0 XP (no streak)', async () => {
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue({ id: 'log-earlier' });
    const { POST } = await import('@/app/api/finance/route');
    const res = await POST(makeRequest('/api/finance', 'POST', FINANCE_VALID_BODY) as any);
    expect(res.status).toBe(200);

    // The log MUST still be saved (history, balances, stats…).
    expect(H.MOCK_TX.financeLog.create).toHaveBeenCalledTimes(1);

    const call = H.empireProgressUpsert.mock.calls[0][0];
    expect(call.update.xp).toEqual({ increment: 0 });
    expect(call.update).not.toHaveProperty('streak');
  });

  it('9. several logs in one day → all valid, at most +10 XP', async () => {
    let call = 0;
    H.MOCK_TX.financeLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'log-earlier' };
    });

    const { POST } = await import('@/app/api/finance/route');
    for (let i = 0; i < 5; i++) {
      const res = await POST(makeRequest('/api/finance', 'POST', { ...FINANCE_VALID_BODY, amount: 10 + i }) as any);
      expect(res.status).toBe(200);
    }

    expect(H.MOCK_TX.financeLog.create).toHaveBeenCalledTimes(5);
    const increments = H.empireProgressUpsert.mock.calls.map(
      (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
    );
    expect(increments).toEqual([10, 0, 0, 0, 0]);
    expect(increments.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('10. logs on different days → one +10 reward per Madrid day', async () => {
    const { POST } = await import('@/app/api/finance/route');

    H.MOCK_TX.financeLog.findFirst.mockResolvedValueOnce(null);
    await POST(makeRequest('/api/finance', 'POST', FINANCE_VALID_BODY) as any);

    H.state.todayKey = DAY_2;
    H.MOCK_TX.financeLog.findFirst.mockResolvedValueOnce(null);
    await POST(makeRequest('/api/finance', 'POST', FINANCE_VALID_BODY) as any);

    const increments = H.empireProgressUpsert.mock.calls.map(
      (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
    );
    expect(increments).toEqual([10, 10]);

    // The first-of-day check queries by createdAt inside the correct
    // Madrid window for each day (never the user-supplied `date`).
    const windows = H.MOCK_TX.financeLog.findFirst.mock.calls.map(
      (c: any[]) => c[0].where.createdAt,
    );
    expect(windows[0].gte.getTime()).toBe(madridDayBoundaries(DAY_1).start.getTime());
    expect(windows[1].gte.getTime()).toBe(madridDayBoundaries(DAY_2).start.getTime());
  });

  it('11. two simultaneous first-of-day logs → exactly one +10, both logs preserved', async () => {
    let call = 0;
    H.MOCK_TX.financeLog.findFirst.mockImplementation(async () => {
      call++;
      return call === 1 ? null : { id: 'log-earlier' };
    });

    const { POST } = await import('@/app/api/finance/route');
    const [resA, resB] = await Promise.all([
      POST(makeRequest('/api/finance', 'POST', FINANCE_VALID_BODY) as any),
      POST(makeRequest('/api/finance', 'POST', { ...FINANCE_VALID_BODY, amount: 99.9, category: 'Ocio' }) as any),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // Both logs preserved.
    expect(H.MOCK_TX.financeLog.create).toHaveBeenCalledTimes(2);

    const increments = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment)
      .sort((a: number, b: number) => b - a);
    expect(increments).toEqual([10, 0]);

    const streakIncrements = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => c[0]?.update?.streak as { increment: number } | undefined)
      .filter(Boolean);
    expect(streakIncrements).toHaveLength(1);

    // Finance POST locks (userId, 'riqueza', madridDay).
    expect(H.MOCK_TX.$executeRaw).toHaveBeenCalledTimes(2);
    expect(H.MOCK_TX.$executeRaw.mock.calls[0][1]).toBe('user-1|riqueza|2026-09-07');
    expect(H.MOCK_TX.$executeRaw.mock.calls[1][1]).toBe('user-1|riqueza|2026-09-07');
  });

  it('12. identical retry within the dedup window → duplicated:true, no second record, no XP', async () => {
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue({ id: 'log-orig', type: 'expense' });
    const { POST } = await import('@/app/api/finance/route');
    const res = await POST(makeRequest('/api/finance', 'POST', FINANCE_VALID_BODY) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.duplicated).toBe(true);

    // No second write and no XP path at all.
    expect(H.MOCK_TX.financeLog.create).not.toHaveBeenCalled();
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('12b. retry AFTER the dedup window (new record) → saved with +0 XP', async () => {
    // The dedup check finds nothing (older than 10s), but the first-of-day
    // check inside the transaction sees the earlier log → +0 XP, record kept.
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue({ id: 'log-earlier' });
    const { POST } = await import('@/app/api/finance/route');
    const res = await POST(makeRequest('/api/finance', 'POST', FINANCE_VALID_BODY) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.duplicated).toBeUndefined();
    expect(H.MOCK_TX.financeLog.create).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ xp: { increment: 0 } }),
      }),
    );
  });
});

// ─── G-03 — Meditation DELETE coherence ──────────────────────

describe('G-03 — DELETE /api/meditation reverts the daily XP coherently', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.empireProgressFindUnique.mockResolvedValue({ xp: 100, streak: 5 });
  });

  it('13. deleting a repeat session of today (another remains) → XP untouched', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue({
      id: 'sess-2',
      userId: 'user-1',
      completedAt: TODAY_NOON_UTC,
    });
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue({ id: 'sess-1' }); // another session today

    const { DELETE } = await import('@/app/api/meditation/route');
    const res = await DELETE(makeRequest('/api/meditation', 'DELETE', { sessionId: 'sess-2' }) as any);
    expect(res.status).toBe(200);

    expect(H.MOCK_TX.meditationSession.delete).toHaveBeenCalledWith({ where: { id: 'sess-2' } });
    expect(H.empireProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { xp: 100 }, // 100 - 0: the repeat session never awarded XP
      }),
    );
    const data = H.empireProgressUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('streak');
  });

  it('14. deleting the sole session of today → −15 XP and streak −1', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'user-1',
      completedAt: TODAY_NOON_UTC,
    });
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null); // day becomes empty

    const { DELETE } = await import('@/app/api/meditation/route');
    const res = await DELETE(makeRequest('/api/meditation', 'DELETE', { sessionId: 'sess-1' }) as any);
    expect(res.status).toBe(200);

    expect(H.empireProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { xp: 85, streak: 4 }, // 100-15, 5-1
      }),
    );
  });

  it('15. deleting the sole session of a PAST day → −15 XP, streak untouched', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue({
      id: 'sess-past',
      userId: 'user-1',
      completedAt: PAST_NOON_UTC, // Madrid day 2026-09-05
    });
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null); // that past day becomes empty

    const { DELETE } = await import('@/app/api/meditation/route');
    const res = await DELETE(makeRequest('/api/meditation', 'DELETE', { sessionId: 'sess-past' }) as any);
    expect(res.status).toBe(200);

    expect(H.empireProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { xp: 85 }, // streak semantics preserved: past days never decrement
      }),
    );
    const data = H.empireProgressUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('streak');

    // The "other session" check queried the PAST day's Madrid window.
    const where = H.MOCK_TX.meditationSession.findFirst.mock.calls[0][0].where;
    expect(where.completedAt.gte.getTime()).toBe(madridDayBoundaries('2026-09-05').start.getTime());
    expect(where.completedAt.lt.getTime()).toBe(madridDayBoundaries('2026-09-05').end.getTime());
  });

  it('16. DELETE takes the same advisory-lock family as POST (same day key)', async () => {
    H.MOCK_DB.meditationSession.findUnique.mockResolvedValue({
      id: 'sess-1',
      userId: 'user-1',
      completedAt: TODAY_NOON_UTC,
    });
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValue(null);

    const { DELETE } = await import('@/app/api/meditation/route');
    await DELETE(makeRequest('/api/meditation', 'DELETE', { sessionId: 'sess-1' }) as any);

    expect(H.MOCK_TX.$executeRaw).toHaveBeenCalledTimes(1);
    expect(H.MOCK_TX.$executeRaw.mock.calls[0][1]).toBe('user-1|2026-09-07');
  });
});

// ─── G-03 — Finance DELETE coherence ─────────────────────────

describe('G-03 — DELETE /api/finance reverts the daily XP coherently', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.empireProgressFindUnique.mockResolvedValue({ xp: 100, streak: 5 });
  });

  it('17. deleting a repeat log of today (another remains) → XP untouched', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue({
      id: 'log-2',
      userId: 'user-1',
      createdAt: TODAY_NOON_UTC,
    });
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue({ id: 'log-1' }); // another log today

    const { DELETE } = await import('@/app/api/finance/route');
    const res = await DELETE(makeRequest('/api/finance', 'DELETE', { logId: 'log-2' }) as any);
    expect(res.status).toBe(200);

    expect(H.MOCK_TX.financeLog.delete).toHaveBeenCalledWith({ where: { id: 'log-2' } });
    expect(H.empireProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { xp: 100 }, // 100 - 0
      }),
    );
    const data = H.empireProgressUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('streak');
  });

  it('18. deleting the sole log of today → −10 XP and streak −1', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      createdAt: TODAY_NOON_UTC,
    });
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);

    const { DELETE } = await import('@/app/api/finance/route');
    const res = await DELETE(makeRequest('/api/finance', 'DELETE', { logId: 'log-1' }) as any);
    expect(res.status).toBe(200);

    expect(H.empireProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { xp: 90, streak: 4 }, // 100-10, 5-1
      }),
    );
  });

  it('19. deleting the sole log of a PAST day → −10 XP, streak untouched', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue({
      id: 'log-past',
      userId: 'user-1',
      createdAt: PAST_NOON_UTC, // Madrid day 2026-09-05
    });
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);

    const { DELETE } = await import('@/app/api/finance/route');
    const res = await DELETE(makeRequest('/api/finance', 'DELETE', { logId: 'log-past' }) as any);
    expect(res.status).toBe(200);

    expect(H.empireProgressUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { xp: 90 },
      }),
    );
    const data = H.empireProgressUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('streak');

    // Day determination uses createdAt (server clock) mapped to Madrid.
    const where = H.MOCK_TX.financeLog.findFirst.mock.calls[0][0].where;
    expect(where.createdAt.gte.getTime()).toBe(madridDayBoundaries('2026-09-05').start.getTime());
    expect(where.createdAt.lt.getTime()).toBe(madridDayBoundaries('2026-09-05').end.getTime());
  });

  it('20. DELETE takes the same advisory-lock family as POST (riqueza day key)', async () => {
    H.MOCK_DB.financeLog.findUnique.mockResolvedValue({
      id: 'log-1',
      userId: 'user-1',
      createdAt: TODAY_NOON_UTC,
    });
    H.MOCK_TX.financeLog.findFirst.mockResolvedValue(null);

    const { DELETE } = await import('@/app/api/finance/route');
    await DELETE(makeRequest('/api/finance', 'DELETE', { logId: 'log-1' }) as any);

    expect(H.MOCK_TX.$executeRaw).toHaveBeenCalledTimes(1);
    expect(H.MOCK_TX.$executeRaw.mock.calls[0][1]).toBe('user-1|riqueza|2026-09-07');
  });
});
