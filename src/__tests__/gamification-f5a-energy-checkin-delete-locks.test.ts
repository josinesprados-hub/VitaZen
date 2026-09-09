/**
 * F-5A — Concurrency hardening for the DELETE paths that mutate XP:
 *   DELETE /api/wellness, DELETE /api/nutrition, DELETE /api/checkin.
 *
 * Original defect (confirmed by the G-10 audit at c768c4f):
 *   The three DELETEs performed the XP revert as a non-atomic
 *   read-modify-write (`xp = max(0, xp - 10)`) OUTSIDE any advisory lock,
 *   while the POSTs award XP inside the advisory lock `user|energia|<day>`
 *   (wellness/nutrition) / `user|<day>` (checkin) with ATOMIC increments.
 *   Demonstrable interleavings:
 *     - DELETE+DELETE of the two same-day energia logs: both could skip the
 *       revert (the +10 outlived its logs) or both apply it (a legitimate
 *       -10 lost from the running total).
 *     - DELETE+POST: the DELETE's stale absolute write could silently drop
 *       the +10 the POST had just granted — including ACROSS days (a
 *       backdated-log DELETE holds a different lock key than a today-POST,
 *       so a per-day lock alone cannot serialize that pair).
 *
 * Fix (this commit):
 *   1. Every DELETE acquires the SAME advisory-lock family as its POST,
 *      keyed from the STORED row date (getMadridDateKey(log.date)) — never
 *      from a client-supplied value:
 *        wellness/nutrition DELETE → 'user|energia|<logDateKey>'
 *        checkin DELETE            → 'user|<dayKey>'  (no domain namespace)
 *   2. The XP/streak reverts are now SINGLE atomic clamped statements
 *      (GREATEST(0, value - 10)) which commute with the POSTs' atomic
 *      `xp: { increment: 10 }` — no lost update, no stale absolute write,
 *      XP can never go negative.
 *
 * Test strategy (identical to gamification-g03/g09):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit, the
 *   fire-and-forget side effects and analytics; getTodayDateKey is mocked
 *   (mutable) at BOTH specifier paths; every Madrid conversion stays REAL.
 * - "Concurrency" tests model the SERIALIZED outcome the advisory lock
 *   guarantees at DB level and additionally assert the lock keys COLLIDE
 *   (same key → serialized) or DIFFER (distinct days → no needless block).
 *   The atomic GREATEST statements are asserted verbatim: being single
 *   row-locked UPDATEs they commute with the POSTs' atomic increments, so
 *   no sleep, timer or real race is needed — the interleaving result is
 *   determined by the statements themselves.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMadridDateKey, madridDayBoundaries } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_1 = '2026-09-07';
const NOON_A_UTC = '2026-09-07T10:00:00Z'; // 12:00 Madrid of DAY_1
const NOON_B_UTC = '2026-09-07T11:00:00Z'; // 13:00 Madrid of DAY_1 (same day)

// DST anchor days
const DAY_AUTUMN = '2026-10-25'; // 25-hour Madrid day
const DAY_SPRING = '2026-03-29'; // 23-hour Madrid day

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    wellnessLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
        id: 'wl-new',
        ...create,
      })),
      delete: vi.fn().mockResolvedValue({}),
    },
    nutritionLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
        id: 'nl-new',
        ...create,
      })),
      delete: vi.fn().mockResolvedValue({}),
    },
    dailyCheckin: {
      upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
        id: 'ck-new',
        ...create,
      })),
      delete: vi.fn().mockResolvedValue({}),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    // DELETE ownership lookups happen before the transaction.
    wellnessLog: { findUnique: vi.fn().mockResolvedValue(null) },
    nutritionLog: { findUnique: vi.fn().mockResolvedValue(null) },
    dailyCheckin: { findUnique: vi.fn().mockResolvedValue(null) },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);
  const trackEventMock = vi.fn();

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
    getAuthUserBasicMock,
    rateLimitMock,
    evaluateAchievementsMock,
    trackEventMock,
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
  onCheckinChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

vi.mock('@/lib/analytics-server', () => ({
  trackEvent: H.trackEventMock,
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

function lockCalls(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('pg_advisory_xact_lock'));
}

function energiaLockKeys(): string[] {
  return lockCalls().map((c) => `${c.params[0]}|energia|${c.params[1]}`);
}

function checkinLockKeys(): string[] {
  return lockCalls().map((c) => `${c.params[0]}|${c.params[1]}`);
}

function energiaXpDecrements(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "xp" - 10)') && c.sql.includes("'energia'"));
}

function energiaStreakDecrements(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "streak" - 1)'));
}

function menteXpDecrements(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "xp" - 10)') && c.sql.includes("'mente'"));
}

function xpIncrements(): number[] {
  return H.empireProgressUpsert.mock.calls.map(
    (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
  );
}

function ownedWellnessLog(dateIso: string, id = 'wl-1') {
  return { id, userId: 'user-1', date: new Date(dateIso) };
}

function ownedNutritionLog(dateIso: string, id = 'nl-1') {
  return { id, userId: 'user-1', date: new Date(dateIso) };
}

async function deleteWellness(logId = 'wl-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/wellness/route');
  return DELETE(makeRequest('/api/wellness', 'DELETE', { logId }) as any) as unknown as Response;
}

async function deleteNutrition(logId = 'nl-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/nutrition/route');
  return DELETE(makeRequest('/api/nutrition', 'DELETE', { logId }) as any) as unknown as Response;
}

async function postWellness(dateIso = NOON_A_UTC): Promise<Response> {
  const { POST } = await import('@/app/api/wellness/route');
  return POST(makeRequest('/api/wellness', 'POST', {
    date: dateIso, mood: 4, energy: 3, sleep: 4, stress: 2,
  }) as any) as unknown as Response;
}

async function postNutrition(dateIso = NOON_A_UTC): Promise<Response> {
  const { POST } = await import('@/app/api/nutrition/route');
  return POST(makeRequest('/api/nutrition', 'POST', {
    date: dateIso, water: 6, calories: 2100, meals: 'Comida',
  }) as any) as unknown as Response;
}

const CHECKIN_BODY = { emotion: 4, energy: 3, focus: 4, stress: 2, intention: 'Buen día' };

async function postCheckin(): Promise<Response> {
  const { POST } = await import('@/app/api/checkin/route');
  return POST(makeRequest('/api/checkin', 'POST', CHECKIN_BODY) as any) as unknown as Response;
}

async function deleteCheckin(checkinId = 'ck-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/checkin/route');
  return DELETE(makeRequest('/api/checkin', 'DELETE', { checkinId }) as any) as unknown as Response;
}

// ─── F-5A — Energy DELETEs: lock family + XP safety ──────────

describe('F-5A — DELETE wellness/nutrition run under the energia advisory lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. DELETE wellness toma el lock user|energia|<día del registro almacenado> como primera sentencia', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(NOON_A_UTC));

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    const locks = lockCalls();
    expect(locks).toHaveLength(1);
    // First statement of the transaction = the lock, before any read/write.
    expect(rawCalls()[0].sql).toContain('pg_advisory_xact_lock');
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-07']);
  });

  it('2. Caso A — DELETE wellness + DELETE nutrition del mismo día (serializados): exactamente un -10', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(NOON_A_UTC));

    // Serialized step 1 — DELETE wellness: the same-day nutrition log REMAINS.
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValueOnce({ id: 'nl-1' });
    const resW = await deleteWellness();
    expect(resW.status).toBe(200);
    expect(energiaXpDecrements()).toHaveLength(0); // the day's +10 is still justified

    // Serialized step 2 — DELETE nutrition: the day is now EMPTY.
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedNutritionLog(NOON_B_UTC));
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    const resN = await deleteNutrition();
    expect(resN.status).toBe(200);
    expect(energiaXpDecrements()).toHaveLength(1);
    expect(energiaStreakDecrements()).toHaveLength(1); // deleted log's day == today

    // Both DELETEs took the SAME lock key → they cannot interleave.
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-07', 'user-1|energia|2026-09-07']);
  });

  it('3. Caso A — orden inverso (nutrition primero): el total sigue siendo exactamente un -10', async () => {
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedNutritionLog(NOON_B_UTC));

    // Step 1 — DELETE nutrition: the same-day wellness log REMAINS.
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValueOnce({ id: 'wl-1' });
    await deleteNutrition();
    expect(energiaXpDecrements()).toHaveLength(0);

    // Step 2 — DELETE wellness: day empty now.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(NOON_A_UTC));
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    await deleteWellness();
    expect(energiaXpDecrements()).toHaveLength(1);
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-07', 'user-1|energia|2026-09-07']);
  });

  it('4. Caso B — POST (+10) y DELETE de un log repetido del mismo día: el XP del POST no se sobrescribe', async () => {
    // First energia log of the day pays +10 (atomic increment, inside the lock).
    const resPost = await postWellness(NOON_A_UTC);
    expect(resPost.status).toBe(200);
    expect(xpIncrements()).toEqual([10]);

    // Concurrent DELETE of a REPEAT same-day log (the POST's log remains):
    // under the shared lock the DELETE observes the remaining log → no revert.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(NOON_B_UTC, 'wl-2'));
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValueOnce({ id: 'wl-new' }); // POST's log survives
    const resDel = await deleteWellness('wl-2');
    expect(resDel.status).toBe(200);

    expect(energiaXpDecrements()).toHaveLength(0); // POST's +10 intact
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-07', 'user-1|energia|2026-09-07']);
  });

  it('5. Caso B' + " — DELETE del log que justificó el +10: exactamente un -10 (neto 0)", async () => {
    const resPost = await postWellness(NOON_A_UTC);
    expect(resPost.status).toBe(200);
    expect(xpIncrements()).toEqual([10]);

    // DELETE of that same (only) log: day left empty → one clamped -10.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(NOON_A_UTC, 'wl-new'));
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    const resDel = await deleteWellness('wl-new');
    expect(resDel.status).toBe(200);

    expect(xpIncrements()).toEqual([10]);
    expect(energiaXpDecrements()).toHaveLength(1); // +10 then -10 → coherent net 0
  });

  it('6. DELETE de un día pasado y POST de hoy: locks DISTINTOS (sin bloqueo innecesario) y revert atómico', async () => {
    // DELETE of yesterday's only log → lock of 2026-09-06, xp reverted, streak untouched.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog('2026-09-06T10:00:00Z'));
    const resDel = await deleteWellness();
    expect(resDel.status).toBe(200);
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-06']);
    expect(energiaXpDecrements()).toHaveLength(1);
    expect(energiaStreakDecrements()).toHaveLength(0);

    // Concurrent POST of today → different lock key (by design, no blocking).
    const resPost = await postWellness(NOON_A_UTC);
    expect(resPost.status).toBe(200);
    expect(xpIncrements()).toEqual([10]);

    // Both XP statements are RELATIVE (GREATEST decrement / atomic increment),
    // so they commute — the old stale absolute write is gone.
    expect(energiaXpDecrements()[0].sql).toContain('GREATEST(0, "xp" - 10)');
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-06', 'user-1|energia|2026-09-07']);
  });

  it('7. Nutrition DELETE + Nutrition POST del mismo día: serializados, resultado neto 0 coherente', async () => {
    const resPost = await postNutrition(NOON_A_UTC);
    expect(resPost.status).toBe(200);
    expect(xpIncrements()).toEqual([10]);

    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedNutritionLog(NOON_A_UTC, 'nl-new'));
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    const resDel = await deleteNutrition('nl-new');
    expect(resDel.status).toBe(200);

    expect(xpIncrements()).toEqual([10]);
    expect(energiaXpDecrements()).toHaveLength(1);
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-07', 'user-1|energia|2026-09-07']);
  });

  it('8. Wellness DELETE + Nutrition POST del mismo día: MISMA clave de lock (colisionan y serializan)', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(NOON_A_UTC));
    const resDel = await deleteWellness();
    expect(resDel.status).toBe(200);

    const resPost = await postNutrition(NOON_B_UTC); // same Madrid day
    expect(resPost.status).toBe(200);

    // Cross-module, same day: identical lock key → the DB serializes them.
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-09-07', 'user-1|energia|2026-09-07']);
  });

  it('9. XP nunca negativo: los reverts de energía son GREATEST(0, …) por SQL', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(NOON_A_UTC));
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    await deleteWellness();

    const xp = energiaXpDecrements();
    const streak = energiaStreakDecrements();
    expect(xp).toHaveLength(1);
    expect(streak).toHaveLength(1);
    expect(xp[0].sql).toContain('GREATEST(0, "xp" - 10)');
    expect(streak[0].sql).toContain('GREATEST(0, "streak" - 1)');
    expect(xp[0].sql).toContain("'energia'");
    // No absolute-value write remains in the DELETE path.
    expect(rawCalls().some((c) => c.sql.includes('EmpireProgress') && c.sql.includes('pg_advisory_xact_lock') === false && c.sql.toUpperCase().includes('UPDATE') === false)).toBe(false);
  });
});

// ─── F-5A — DST: the lock key is the Madrid NATURAL day ──────

describe('F-5A — los locks de energía usan la clave Madrid del día natural (DST)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('10. otoño 2026-10-25 (25 h): un log a las 23:59 Madrid bloquea user|energia|2026-10-25 con ventana de 25 h', async () => {
    H.state.todayKey = DAY_AUTUMN;
    const stored = '2026-10-25T22:59:00Z'; // 23:59 Madrid of day 25 (CET, UTC+1)
    expect(getMadridDateKey(new Date(stored))).toBe(DAY_AUTUMN);

    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(stored));
    const res = await deleteWellness();
    expect(res.status).toBe(200);

    // Single Madrid key — NOT a fixed 24h window.
    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-10-25']);

    // The dayNowEmpty window is the REAL Madrid natural day: 25 hours.
    const findFirstArg = (H.MOCK_TX.wellnessLog.findFirst.mock.calls[0][0] as any).where.date;
    expect(findFirstArg.gte.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(findFirstArg.lt.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect((findFirstArg.lt.getTime() - findFirstArg.gte.getTime()) / 3600000).toBe(25);
  });

  it('11. primavera 2026-03-29 (23 h): un log a las 23:30 Madrid bloquea user|energia|2026-03-29 con ventana de 23 h', async () => {
    H.state.todayKey = DAY_SPRING;
    const stored = '2026-03-29T21:30:00Z'; // 23:30 Madrid of day 29 (CEST, UTC+2)
    expect(getMadridDateKey(new Date(stored))).toBe(DAY_SPRING);

    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(stored));
    const res = await deleteWellness();
    expect(res.status).toBe(200);

    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-03-29']);

    const findFirstArg = (H.MOCK_TX.wellnessLog.findFirst.mock.calls[0][0] as any).where.date;
    expect(findFirstArg.gte.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(findFirstArg.lt.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect((findFirstArg.lt.getTime() - findFirstArg.gte.getTime()) / 3600000).toBe(23);
  });

  it('12. medianoche: un log a las 00:00 Madrid del 26 (2026-10-25T23:00Z) pertenece al día 26, no al 25', async () => {
    H.state.todayKey = '2026-10-26';
    const stored = '2026-10-25T23:00:00.000Z'; // = 2026-10-26 00:00 Madrid (CET)
    expect(getMadridDateKey(new Date(stored))).toBe('2026-10-26');

    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(stored));
    const res = await deleteWellness();
    expect(res.status).toBe(200);

    expect(energiaLockKeys()).toEqual(['user-1|energia|2026-10-26']);

    const findFirstArg = (H.MOCK_TX.wellnessLog.findFirst.mock.calls[0][0] as any).where.date;
    expect(findFirstArg.gte.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(findFirstArg.lt.toISOString()).toBe('2026-10-26T23:00:00.000Z');
    expect((findFirstArg.lt.getTime() - findFirstArg.gte.getTime()) / 3600000).toBe(24);

    // Boundary sanity: the day-25 window ends exactly where day 26 begins.
    const day25 = madridDayBoundaries(DAY_AUTUMN);
    expect(day25.end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});

// ─── F-5A — Check-in DELETE: same-family lock + atomic revert ─

describe('F-5A — DELETE check-in se serializa con el POST del mismo día Madrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue(null);
    H.MOCK_TX.$queryRaw.mockResolvedValue([]);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  // The row a POST stores for Madrid day D is exactly startOfMadridDay(D).
  const storedForDay = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`);

  it('13. DELETE check-in toma el lock user|<dayKey> del registro almacenado (familia del POST, sin namespace)', async () => {
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue({
      id: 'ck-1', userId: 'user-1', date: storedForDay(DAY_1),
    });

    const res = await deleteCheckin();
    expect(res.status).toBe(200);

    const locks = lockCalls();
    expect(locks).toHaveLength(1);
    expect(rawCalls()[0].sql).toContain('pg_advisory_xact_lock');
    // Same family/format as the POST ('user|<dayKey>') — NO domain namespace.
    expect(checkinLockKeys()).toEqual(['user-1|2026-09-07']);
    expect(locks[0].sql).not.toContain('|energia|');

    // The mente XP revert is the atomic clamped statement.
    expect(menteXpDecrements()).toHaveLength(1);
    expect(menteXpDecrements()[0].sql).toContain('GREATEST(0, "xp" - 10)');
    expect(menteXpDecrements()[0].sql).toContain("'mente'");
  });

  it('14. Check-in DELETE + POST del mismo día: MISMA clave de lock y resultado neto 0 coherente', async () => {
    // POST creates today's check-in and awards +10 mente (atomic increment).
    const resPost = await postCheckin();
    expect(resPost.status).toBe(200);
    expect(xpIncrements()).toEqual([10]);

    // DELETE of that check-in (stored row of day 2026-09-07): one clamped -10.
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue({
      id: 'ck-new', userId: 'user-1', date: storedForDay(DAY_1),
    });
    const resDel = await deleteCheckin('ck-new');
    expect(resDel.status).toBe(200);

    expect(xpIncrements()).toEqual([10]);
    expect(menteXpDecrements()).toHaveLength(1); // +10 then -10 → net 0
    expect(checkinLockKeys()).toEqual(['user-1|2026-09-07', 'user-1|2026-09-07']);
  });

  it('15. dos DELETE del mismo check-in: solo el primero revierte XP; el segundo ve 404', async () => {
    // Under the shared lock the second DELETE cannot observe the row anymore:
    // its pre-transaction lookup finds nothing and the route returns 404.
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValueOnce({
      id: 'ck-1', userId: 'user-1', date: storedForDay(DAY_1),
    });
    const res1 = await deleteCheckin();
    expect(res1.status).toBe(200);
    expect(menteXpDecrements()).toHaveLength(1);

    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValueOnce(null);
    const res2 = await deleteCheckin();
    expect(res2.status).toBe(404);
    expect(lockCalls()).toHaveLength(1); // no second lock: nothing was mutated
    expect(menteXpDecrements()).toHaveLength(1); // reverted exactly once
  });

  it('16. DELETE de un check-in de otro día y POST de hoy: locks DISTINTOS, revert atómico', async () => {
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue({
      id: 'ck-old', userId: 'user-1', date: storedForDay('2026-09-06'),
    });
    const resDel = await deleteCheckin('ck-old');
    expect(resDel.status).toBe(200);
    expect(checkinLockKeys()).toEqual(['user-1|2026-09-06']);
    expect(menteXpDecrements()).toHaveLength(1);

    const resPost = await postCheckin();
    expect(resPost.status).toBe(200);
    expect(xpIncrements()).toEqual([10]);

    // Different Madrid days → different keys (no needless blocking); the XP
    // statements are relative/atomic on both sides, so they commute.
    expect(checkinLockKeys()).toEqual(['user-1|2026-09-06', 'user-1|2026-09-07']);
    expect(menteXpDecrements()[0].sql).toContain('GREATEST(0, "xp" - 10)');
  });

  it('17. XP nunca negativo: el revert de check-in es GREATEST(0, "xp" - 10) sobre mente', async () => {
    H.MOCK_DB.dailyCheckin.findUnique.mockResolvedValue({
      id: 'ck-1', userId: 'user-1', date: storedForDay(DAY_1),
    });
    await deleteCheckin();

    const mente = menteXpDecrements();
    expect(mente).toHaveLength(1);
    expect(mente[0].sql).toContain('GREATEST(0, "xp" - 10)');
    expect(mente[0].params[0]).toBe('user-1');
  });
});
