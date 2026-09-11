/**
 * FASE 15 — E-0.1 (F-NEW-1): empire streaks must not resurrect across a gap.
 *
 * The transition audit (Fase 14 → 15) proved that G-07's continuity reset
 * existed ONLY for disciplina (habits/route.ts). Meditation (mente), finance
 * (riqueza) and wellness/nutrition (energia) blindly did
 * `streak: { increment: 1 }` on the first action of a Madrid day, so a stale
 * stored counter survived a multi-day inactivity gap and was presented as
 * stored+1 by GET /api/empire the moment a new action restored aliveness:
 *
 *   stored 20 → 3 idle days (gate shows 0) → 1 meditation → 21  ❌
 *
 * The fix ports the G-07 pattern into each route, INSIDE the existing
 * advisory-locked transaction, using each empire's REAL activity source:
 *   - mente:     MeditationSession.completedAt  (same source the G-06 gate uses)
 *   - riqueza:   FinanceLog.createdAt           (server clock — NEVER the
 *                user-supplied `date`, mirroring the F-1/G-03 semantics)
 *   - energia:   WellnessLog.date OR NutritionLog.date (cross-module, F-2),
 *                relative to the LOG's own Madrid day (a G-02-validated
 *                backdated log continues the chain of ITS day)
 *
 * Any activity on the previous Madrid day → stored + 1 (atomic increment).
 * Previous day empty → the streak is explicitly SET to 1. Windows are built
 * with madridDayBoundaries + addDaysToDateKey (DST-exact, never start+24h).
 *
 * XP is UNTOUCHED by this fix: every test below asserts the exact XP payload
 * alongside the streak payload (G-03 day-gates preserved: 15/10/10 first
 * action of the day, 0 afterwards).
 *
 * Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 * fire-and-forget side effects. getTodayDateKey is mocked (mutable) at both
 * specifier paths; ALL Madrid conversions stay REAL.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_1 = '2026-09-07'; // Monday, CEST (fixed "today" for most tests)

// Instants whose Madrid day is unambiguous (September = CEST, UTC+2):
// 10:00Z → 12:00 Madrid of the same calendar day.
function noonUTC(offsetFromDay1: number): Date {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1, 10, 0, 0));
}

// Wellness/nutrition client dates are 'YYYY-MM-DD' strings; new Date('…')
// parses them as UTC midnight, which always lands inside the same Madrid
// civil day (02:00 CEST / 01:00 CET).

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    meditationSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    financeLog: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    wellnessLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
    nutritionLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    // finance POST pre-transaction dedup check
    financeLog: {
      findFirst: vi.fn().mockResolvedValue(null),
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

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onMeditationChange: vi.fn().mockResolvedValue(undefined),
  onFinanceChange: vi.fn().mockResolvedValue(undefined),
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
  onHabitChange: vi.fn().mockResolvedValue(undefined),
  onCheckinChange: vi.fn().mockResolvedValue(undefined),
  onPlanChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: vi.fn().mockResolvedValue([]),
}));

// Mock ONLY "today"; keep the real Madrid conversions (madridDayBoundaries,
// addDaysToDateKey, getMadridDateKey, startOfMadridDay — DST-exact).
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

function makeRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function postMeditation() {
  H.MOCK_TX.meditationSession.create.mockResolvedValueOnce({
    id: 'session-' + H.MOCK_TX.meditationSession.create.mock.calls.length,
    userId: 'user-1',
    duration: 10,
    type: 'mindfulness',
    completedAt: noonUTC(0),
  });
  const { POST } = await import('@/app/api/meditation/route');
  return POST(makeRequest('/api/meditation', { duration: 10, type: 'mindfulness' }) as any);
}

async function postFinance(date = DAY_1) {
  H.MOCK_TX.financeLog.create.mockResolvedValueOnce({
    id: 'fin-' + H.MOCK_TX.financeLog.create.mock.calls.length,
    userId: 'user-1',
    date: new Date(date + 'T00:00:00.000Z'),
    type: 'expense',
    category: 'Comida',
    amount: 12.5,
    createdAt: noonUTC(0),
  });
  const { POST } = await import('@/app/api/finance/route');
  return POST(makeRequest('/api/finance', {
    date,
    type: 'expense',
    category: 'Comida',
    amount: 12.5,
  }) as any);
}

async function postWellness(date = DAY_1) {
  H.MOCK_TX.wellnessLog.upsert.mockResolvedValueOnce({
    id: 'well-' + H.MOCK_TX.wellnessLog.upsert.mock.calls.length,
    userId: 'user-1',
    date: new Date(date + 'T00:00:00.000Z'),
    mood: 4,
    energy: 3,
    sleep: 4,
    stress: 2,
  });
  const { POST } = await import('@/app/api/wellness/route');
  return POST(makeRequest('/api/wellness', {
    date, mood: 4, energy: 3, sleep: 4, stress: 2,
  }) as any);
}

async function postNutrition(date = DAY_1) {
  H.MOCK_TX.nutritionLog.upsert.mockResolvedValueOnce({
    id: 'nut-' + H.MOCK_TX.nutritionLog.upsert.mock.calls.length,
    userId: 'user-1',
    date: new Date(date + 'T00:00:00.000Z'),
    meals: 'Comida completa',
    water: 5,
    calories: 2000,
  });
  const { POST } = await import('@/app/api/nutrition/route');
  return POST(makeRequest('/api/nutrition', {
    date, meals: 'Comida completa', water: 5, calories: 2000,
  }) as any);
}

/** streak payloads of every empireProgress.upsert call, in order. */
function streakOps(): Array<Record<string, unknown> | number | undefined> {
  return H.empireProgressUpsert.mock.calls
    .map((c: any[]) => (c[0]?.update as Record<string, unknown>)?.streak as Record<string, unknown>)
    .filter((s) => s !== undefined);
}

/** full update payloads of every empireProgress.upsert call, in order. */
function updateOps(): Array<Record<string, unknown>> {
  return H.empireProgressUpsert.mock.calls.map((c: any[]) => c[0].update as Record<string, unknown>);
}

/** create payloads (defensive path) of every empireProgress.upsert call. */
function createOps(): Array<Record<string, unknown>> {
  return H.empireProgressUpsert.mock.calls.map((c: any[]) => c[0].create as Record<string, unknown>);
}

function lockSeeds(): string[] {
  return H.MOCK_TX.$executeRaw.mock.calls
    .filter((c: any[]) => (c[0] as string[]).join(' ').includes('pg_advisory_xact_lock'))
    .map((c: any[]) => c[1] as string);
}

function resetMocks() {
  vi.clearAllMocks();
  H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
  H.MOCK_TX.nutritionLog.findUnique.mockResolvedValue(null);
  H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
  H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
  H.rateLimitMock.mockResolvedValue({ limited: false });
  H.state.todayKey = DAY_1;
}

// ─── MENTE (meditation) ──────────────────────────────────────

describe('E-0.1 — mente (POST /api/meditation)', () => {
  beforeEach(resetMocks);

  it('Caso 1 — ayer activo (sesión de meditación ayer) → streak CONTINÚA ({increment:1}) y XP intacto (+15)', async () => {
    // findFirst #1: otherSessionToday → none; findFirst #2: continuity → session yesterday.
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)                    // otherSessionToday
      .mockResolvedValueOnce([{ id: 'session-yesterday' }]); // yesterday activity
    const res = await postMeditation();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 15 }, streak: { increment: 1 } }, // stored N → N+1, XP intact
    ]);
  });

  it('Caso 2 — gap (ayer sin actividad, stored 20) → streak EXPLÍCITAMENTE 1, nunca 21', async () => {
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)   // otherSessionToday
      .mockResolvedValueOnce(null);  // yesterday empty
    const res = await postMeditation();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 15 }, streak: 1 }, // explicit SET, not {increment:1}
    ]);
  });

  it('Caso 8 — segunda sesión del mismo día → XP +0 y CERO escrituras de streak (comportamiento diario conservado)', async () => {
    // First session of the day (gap → set 1).
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postMeditation();

    // Second session: otherSessionToday finds the first → no streak op at all.
    H.MOCK_TX.meditationSession.findFirst.mockResolvedValueOnce([{ id: 'session-1' }]);
    await postMeditation();

    expect(updateOps()).toEqual([
      { xp: { increment: 15 }, streak: 1 },  // first session
      { xp: { increment: 0 } },              // second: XP gate only, streak untouched
    ]);
  });

  it('la ventana de continuidad usa el calendario Madrid real y la fuente REAL de mente (MeditationSession.completedAt)', async () => {
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postMeditation();

    // findFirst #2 = continuity check on completedAt with yesterday's true window.
    const continuityWhere = (H.MOCK_TX.meditationSession.findFirst.mock.calls[1][0] as any).where;
    expect(continuityWhere.completedAt).toBeDefined();
    expect(continuityWhere.completedAt.gte.toISOString()).toBe('2026-09-05T22:00:00.000Z');
    expect(continuityWhere.completedAt.lt.toISOString()).toBe('2026-09-06T22:00:00.000Z');
  });
});

// ─── RIQUEZA (finance) ───────────────────────────────────────

describe('E-0.1 — riqueza (POST /api/finance, semántica createdAt)', () => {
  beforeEach(resetMocks);

  it('Caso 1 — ayer activo (log con createdAt ayer) → streak CONTINÚA ({increment:1}) y XP intacto (+10)', async () => {
    H.MOCK_TX.financeLog.findFirst
      .mockResolvedValueOnce(null)                     // otherLogToday
      .mockResolvedValueOnce([{ id: 'fin-yesterday' }]); // createdAt yesterday
    const res = await postFinance();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: { increment: 1 } },
    ]);
  });

  it('Caso 2 — gap (ayer vacío, stored 14) → streak EXPLÍCITAMENTE 1, nunca 15', async () => {
    H.MOCK_TX.financeLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const res = await postFinance();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: 1 },
    ]);
  });

  it('la continuidad de riqueza usa createdAt (reloj servidor) — la `date` del cliente JAMÁS participa en el streak', async () => {
    H.MOCK_TX.financeLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postFinance('2026-09-05'); // client date is allowed to differ (F-1)

    const continuityWhere = (H.MOCK_TX.financeLog.findFirst.mock.calls[1][0] as any).where;
    expect(continuityWhere.createdAt).toBeDefined();          // server clock
    expect(continuityWhere.date).toBeUndefined();             // client date NOT used
    expect(continuityWhere.createdAt.gte.toISOString()).toBe('2026-09-05T22:00:00.000Z');
    expect(continuityWhere.createdAt.lt.toISOString()).toBe('2026-09-06T22:00:00.000Z');
  });
});

// ─── ENERGÍA cross-module (wellness + nutrition) ─────────────

describe('E-0.1 — energía cross-module (POST /api/wellness y /api/nutrition)', () => {
  beforeEach(resetMocks);

  it('Caso 4 — Wellness ayer + Wellness hoy → CONTINÚA ({increment:1})', async () => {
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)                      // otherEnergiaLogToday (wellness)
      .mockResolvedValueOnce([{ id: 'well-yesterday' }]); // wellnessYesterday
    // (nutritionLog.findFirst #1 skipped: wellnessYesterday found → short-circuit
    //  applies to the today-check; the continuity check queries wellness first)
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null); // otherNutritionLogToday
    const res = await postWellness();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: { increment: 1 } },
    ]);
  });

  it('Caso 5 — Nutrition ayer + Nutrition hoy → CONTINÚA ({increment:1})', async () => {
    H.MOCK_TX.nutritionLog.findFirst
      .mockResolvedValueOnce(null)                      // otherNutritionLogToday
      .mockResolvedValueOnce([{ id: 'nut-yesterday' }]); // nutritionYesterday
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null); // otherWellnessLogToday
    const res = await postNutrition();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: { increment: 1 } },
    ]);
  });

  it('Caso 6a — Wellness ayer + Nutrition hoy → CONTINÚA (cross-module)', async () => {
    // Nutrition POST today; continuity check: nutritionYesterday empty, wellnessYesterday found.
    H.MOCK_TX.nutritionLog.findFirst
      .mockResolvedValueOnce(null)   // otherNutritionLogToday
      .mockResolvedValueOnce(null);  // nutritionYesterday
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)                      // otherWellnessLogToday
      .mockResolvedValueOnce([{ id: 'well-yesterday' }]); // wellnessYesterday
    const res = await postNutrition();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: { increment: 1 } },
    ]);
  });

  it('Caso 6b — Nutrition ayer + Wellness hoy → CONTINÚA (cross-module)', async () => {
    // Wellness POST today; continuity check: wellnessYesterday empty, nutritionYesterday found.
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)   // otherEnergiaLogToday
      .mockResolvedValueOnce(null);  // wellnessYesterday
    H.MOCK_TX.nutritionLog.findFirst
      .mockResolvedValueOnce(null)                      // otherNutritionLogToday
      .mockResolvedValueOnce([{ id: 'nut-yesterday' }]); // nutritionYesterday
    const res = await postWellness();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: { increment: 1 } },
    ]);
  });

  it('Caso 7 — NINGUNA actividad de energía ayer + Wellness hoy → streak EXPLÍCITAMENTE 1', async () => {
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)   // otherEnergiaLogToday
      .mockResolvedValueOnce(null);  // wellnessYesterday
    H.MOCK_TX.nutritionLog.findFirst
      .mockResolvedValueOnce(null)   // otherNutritionLogToday
      .mockResolvedValueOnce(null);  // nutritionYesterday
    const res = await postWellness();
    expect(res.status).toBe(200);

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: 1 },
    ]);
  });

  it('Caso 8 — segunda actividad de energía el mismo día (wellness luego nutrition) → CERO escrituras de streak, XP +0', async () => {
    // Wellness first (gap → set 1).
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    H.MOCK_TX.nutritionLog.findFirst
      .mockResolvedValueOnce(null)   // otherNutritionLogToday
      .mockResolvedValueOnce(null);  // nutritionYesterday
    await postWellness();

    // Nutrition second: cross-module today-check finds wellness → no streak op.
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValueOnce([{ id: 'well-1' }]);
    await postNutrition();

    expect(updateOps()).toEqual([
      { xp: { increment: 10 }, streak: 1 },  // wellness first-of-day
      { xp: { increment: 0 } },              // nutrition: gated, streak untouched
    ]);
  });

  it('Wellness y Nutrition comparten la MISMA familia de locks (user|energia|<día Madrid>) — sin segunda familia', async () => {
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    H.MOCK_TX.nutritionLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postWellness();
    await postNutrition();

    // The energia lock template interpolates THREE fragments:
    // md5(${user.id} || '|energia|' || ${logDateKey}) — the '|energia|'
    // literal lives in the static SQL text. Reconstruct the effective key.
    const lockCalls = H.MOCK_TX.$executeRaw.mock.calls
      .filter((c: any[]) => (c[0] as string[]).join(' ').includes('pg_advisory_xact_lock'));
    const keys = lockCalls.map((c: any[]) => {
      const sql = (c[0] as string[]).join(' ');
      expect(sql).toContain("'|energia|'"); // single shared lock family
      return [c[1], c[2]]; // [userId, logDateKey]
    });
    expect(keys).toEqual([
      ['user-1', '2026-09-07'],
      ['user-1', '2026-09-07'],
    ]);
  });

  it('un log retroactivo (G-02, fecha de ayer) decide la continuidad respecto al día ANTERIOR AL DEL LOG', async () => {
    // Backdated wellness log for YESTERDAY (2026-09-06), logged today.
    H.state.todayKey = DAY_1;
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)   // otherEnergiaLogToday (yesterday's day window)
      .mockResolvedValueOnce(null);  // wellnessYesterday → continuity vs 2026-09-05
    H.MOCK_TX.nutritionLog.findFirst
      .mockResolvedValueOnce(null)   // otherNutritionLogToday
      .mockResolvedValueOnce(null);  // nutritionYesterday
    const res = await postWellness('2026-09-06');
    expect(res.status).toBe(200);

    // The continuity window is the day BEFORE the log's day (Sep 5), NOT before today.
    const continuityWhere = (H.MOCK_TX.wellnessLog.findFirst.mock.calls[1][0] as any).where;
    expect(continuityWhere.date.gte.toISOString()).toBe('2026-09-04T22:00:00.000Z');
    expect(continuityWhere.date.lt.toISOString()).toBe('2026-09-05T22:00:00.000Z');
  });
});

// ─── Madrid / DST ────────────────────────────────────────────

describe('E-0.1 — Madrid / DST (calendario canónico, nunca start+24h)', () => {
  beforeEach(resetMocks);

  it('día normal (24h): la ventana de ayer son las dos medianoches reales de Madrid', async () => {
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postMeditation();

    const w = (H.MOCK_TX.meditationSession.findFirst.mock.calls[1][0] as any).where.completedAt;
    expect(w.gte.toISOString()).toBe('2026-09-05T22:00:00.000Z');
    expect(w.lt.toISOString()).toBe('2026-09-06T22:00:00.000Z');
    expect((w.lt.getTime() - w.gte.getTime()) / 3600000).toBe(24);
  });

  it('transición DST otoño (día de 25h): hoy 2026-10-26 → ayer 2026-10-25 tiene 25 horas exactas', async () => {
    H.state.todayKey = '2026-10-26';
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postMeditation();

    const w = (H.MOCK_TX.meditationSession.findFirst.mock.calls[1][0] as any).where.completedAt;
    expect(w.gte.toISOString()).toBe('2026-10-24T22:00:00.000Z'); // CEST-side midnight
    expect(w.lt.toISOString()).toBe('2026-10-25T23:00:00.000Z');  // CET-side midnight
    expect((w.lt.getTime() - w.gte.getTime()) / 3600000).toBe(25);
  });

  it('transición DST primavera (día de 23h): hoy 2026-03-30 → ayer 2026-03-29 tiene 23 horas exactas', async () => {
    H.state.todayKey = '2026-03-30';
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postMeditation();

    const w = (H.MOCK_TX.meditationSession.findFirst.mock.calls[1][0] as any).where.completedAt;
    expect(w.gte.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(w.lt.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect((w.lt.getTime() - w.gte.getTime()) / 3600000).toBe(23);
  });

  it('medianoche exacta: un instante EXACTAMENTE en el inicio de hoy pertenece a HOY (gt/lt correctos en ambas ventanas)', async () => {
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postMeditation();

    const todayWhere = (H.MOCK_TX.meditationSession.findFirst.mock.calls[0][0] as any).where.completedAt;
    const yesterWhere = (H.MOCK_TX.meditationSession.findFirst.mock.calls[1][0] as any).where.completedAt;
    // Continuity window EXCLUDES today's first instant (lt): activity at
    // exactly midnight counts as TODAY, not yesterday.
    expect(yesterWhere.lt.toISOString()).toBe(todayWhere.gte.toISOString());
    // Today window INCLUDES it (gte).
    expect(todayWhere.gte instanceof Date).toBe(true);
    expect(todayWhere.lt > todayWhere.gte).toBe(true);
  });
});

// ─── XP intacto + ruta defensiva ─────────────────────────────

describe('E-0.1 — XP permanece intacto (G-03 gates preservados)', () => {
  beforeEach(resetMocks);

  it('los tres imperios mantienen EXACTAMENTE sus XP diarios (15/10/10) junto al streak corregido', async () => {
    // mente — continuation
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([{ id: 'session-y' }]);
    await postMeditation();
    expect(updateOps()[0]).toEqual({ xp: { increment: 15 }, streak: { increment: 1 } });

    // riqueza — gap
    resetMocks();
    H.MOCK_TX.financeLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postFinance();
    expect(updateOps()[0]).toEqual({ xp: { increment: 10 }, streak: 1 });

    // energia — continuation
    resetMocks();
    H.MOCK_TX.wellnessLog.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([{ id: 'well-y' }]);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    await postWellness();
    expect(updateOps()[0]).toEqual({ xp: { increment: 10 }, streak: { increment: 1 } });
  });

  it('la rama create defensiva (fila ausente) sigue sembrando cadena fresca: xp 15/10/10, streak 1 — sin cambios', async () => {
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    await postMeditation();
    expect(createOps()[0]).toEqual({ userId: 'user-1', empire: 'mente', xp: 15, streak: 1 });
  });
});
