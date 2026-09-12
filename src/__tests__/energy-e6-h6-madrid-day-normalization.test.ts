/**
 * E-6 — H-6 (Modelo 3): the stored `date` of WellnessLog/NutritionLog is
 * NORMALIZED server-side to the exact UTC instant of midnight of the log's
 * Europe/Madrid civil day BEFORE any read or write.
 *
 * Consequence (no schema change — @@unique([userId, date]) does the rest):
 *   - Two different instants of the SAME Madrid civil day map to the SAME
 *     (userId, date) key → the second POST acts on the existing row (upsert
 *     update/edit semantics) → max 1 WellnessLog and max 1 NutritionLog per
 *     user and Madrid day.
 *   - WellnessLog and NutritionLog are different tables → a Wellness + a
 *     Nutrition log of the same day still coexist.
 *   - DST is exact: normalization uses the existing startOfMadridDay
 *     utility (candidate-verification algorithm), correct for normal 24h
 *     days and for the 23h (spring) and 25h (autumn) transition days —
 *     never `start + 24h`.
 *   - Gamification untouched: G-02 still validates the raw client instant,
 *     the advisory lock stays 'user|energia|<day>', and the F-2 XP gate
 *     remains as defense-in-depth for legacy (non-normalized) rows.
 *
 * Test strategy (route-level, following gamification-g09-f2 conventions):
 * - @/lib/db, @/lib/auth, @/lib/rate-limit and the fire-and-forget side
 *   effects are mocked; getTodayDateKey is mocked (mutable) at BOTH
 *   specifier paths; the real Europe/Madrid utilities stay real.
 * - Instead of a dumb null mock, wellnessLog/nutritionLog inside the
 *   transaction are backed by a tiny in-memory store that models the REAL
 *   Prisma behavior of the @@unique([userId, date]) compound key:
 *   findUnique by (userId, date-instant), upsert = create-or-update on
 *   that key, findFirst with DST window filters. This lets the tests
 *   observe the true Modelo 3 outcome: one row per user and Madrid day.
 * - A "legacy row" (non-normalized instant of the same Madrid day) can be
 *   pre-seeded to verify the F-2 +0 XP gate still protects the day after
 *   deployment, before any data consolidation happens.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMadridDateKey, startOfMadridDay, madridDayBoundaries } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic route tests ────

const DAY_1 = '2026-09-07'; // CEST (UTC+2): Madrid midnight = 22:00Z of Sep 6
const DAY_2 = '2026-09-08';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  // In-memory store modeling @@unique([userId, date]) per model.
  function makeStore(idPrefix: string) {
    const rows: Array<Record<string, unknown>> = [];
    return {
      rows,
      findUnique: vi.fn(async ({ where }: { where: { userId_date: { userId: string; date: Date } } }) => {
        const { userId, date } = where.userId_date;
        return rows.find((r) => r.userId === userId && (r.date as Date).getTime() === date.getTime()) || null;
      }),
      upsert: vi.fn(async ({ where, update, create }: {
        where: { userId_date: { userId: string; date: Date } };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) => {
        const { userId, date } = where.userId_date;
        const found = rows.find((r) => r.userId === userId && (r.date as Date).getTime() === date.getTime());
        if (found) {
          Object.assign(found, update);
          return found;
        }
        const row = { id: `${idPrefix}-${rows.length + 1}`, ...create };
        rows.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where }: {
        where: {
          userId: string;
          id?: { not: string };
          date?: { gte?: Date; lt?: Date };
        };
      }) => {
        return rows.find((r) => {
          if (r.userId !== where.userId) return false;
          if (where.id?.not && r.id === where.id.not) return false;
          const t = (r.date as Date).getTime();
          if (where.date?.gte && t < where.date.gte.getTime()) return false;
          if (where.date?.lt && t >= where.date.lt.getTime()) return false;
          return true;
        }) || null;
      }),
    };
  }

  const wellnessStore = makeStore('wl');
  const nutritionStore = makeStore('nl');

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    wellnessLog: wellnessStore,
    nutritionLog: nutritionStore,
    empireProgress: { upsert: empireProgressUpsert },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    wellnessLog: { findUnique: vi.fn().mockResolvedValue(null) },
    nutritionLog: { findUnique: vi.fn().mockResolvedValue(null) },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    wellnessStore,
    nutritionStore,
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
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

// Mock ONLY "today"; keep the real Madrid conversion utilities.
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

function wellnessBody(date: string) {
  return { ...WELLNESS_BODY_BASE, date };
}
function nutritionBody(date: string) {
  return { ...NUTRITION_BODY_BASE, date };
}

function xpIncrements(): number[] {
  return H.empireProgressUpsert.mock.calls.map(
    (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
  );
}

function lockKeys(): string[] {
  return H.MOCK_TX.$executeRaw.mock.calls.map(
    (c: any[]) => `${c[1]}|energia|${c[2]}`,
  );
}

function resetStores() {
  H.wellnessStore.rows.length = 0;
  H.nutritionStore.rows.length = 0;
}

// ─── Tests ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  H.state.todayKey = DAY_1;
  H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
  H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
  H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(null);
  H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
  H.rateLimitMock.mockResolvedValue({ limited: false });
  resetStores();
});

describe('E-6 H-6 — POST /api/wellness normalizes date to Madrid midnight (Modelo 3)', () => {
  it('1. today (UI sends YYYY-MM-DD) → stored date is the exact Madrid-midnight instant', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_1)) as any);
    expect(res.status).toBe(200);

    const stored = H.wellnessStore.rows[0].date as Date;
    expect(stored.getTime()).toBe(startOfMadridDay(DAY_1).getTime());
    // CEST (UTC+2): Madrid midnight of 2026-09-07 is 2026-09-06T22:00:00Z.
    expect(stored.toISOString()).toBe('2026-09-06T22:00:00.000Z');
    // API contract untouched: the log still exposes `energy` (H-1).
    const json = await res.json();
    expect(json.log).toHaveProperty('energy', 3);
  });

  it('2. two instants of the SAME Madrid day (08:00Z and 20:00Z = 10:00/22:00 local) → ONE row, second POST edits it', async () => {
    const { POST } = await import('@/app/api/wellness/route');

    // The FASE 4 example, expressed as UTC instants of Madrid day 2026-09-10
    // (CEST, UTC+2): 10:00 Madrid = 08:00Z; 22:00 Madrid = 20:00Z.
    H.state.todayKey = '2026-09-10';
    const morning = '2026-09-10T08:00:00Z';
    const evening = '2026-09-10T20:00:00Z';
    expect(getMadridDateKey(new Date(morning))).toBe('2026-09-10');
    expect(getMadridDateKey(new Date(evening))).toBe('2026-09-10');

    const resA = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(morning)) as any);
    const resB = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(evening)) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // The second POST acted on the SAME row (upsert update semantics).
    expect((await resB.json()).log.id).toBe((await resA.json()).log.id);

    // Exactly ONE row exists for the user — the second POST updated it.
    expect(H.wellnessStore.rows).toHaveLength(1);
    expect(H.wellnessStore.rows[0].energy).toBe(WELLNESS_BODY_BASE.energy);
    // Both writes targeted the SAME normalized key.
    const stored = H.wellnessStore.rows[0].date as Date;
    expect(stored.toISOString()).toBe('2026-09-09T22:00:00.000Z');

    // XP: only the FIRST create paid; the update path never reaches the
    // gamification block (no +0 call — the row was found).
    expect(xpIncrements()).toEqual([10]);
  });

  it('3. Wellness + Nutrition of the same day → TWO rows (different tables, same normalized key)', async () => {
    const { POST: POST_W } = await import('@/app/api/wellness/route');
    const { POST: POST_N } = await import('@/app/api/nutrition/route');

    const resW = await POST_W(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_1)) as any);
    const resN = await POST_N(makeRequest('/api/nutrition', 'POST', nutritionBody(DAY_1)) as any);
    expect(resW.status).toBe(200);
    expect(resN.status).toBe(200);

    expect(H.wellnessStore.rows).toHaveLength(1);
    expect(H.nutritionStore.rows).toHaveLength(1);
    expect((H.wellnessStore.rows[0].date as Date).toISOString()).toBe('2026-09-06T22:00:00.000Z');
    expect((H.nutritionStore.rows[0].date as Date).toISOString()).toBe('2026-09-06T22:00:00.000Z');
  });

  it('4. two different Madrid days → TWO rows with different normalized keys', async () => {
    const { POST } = await import('@/app/api/wellness/route');

    const resA = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_1)) as any);
    expect(resA.status).toBe(200);
    H.state.todayKey = DAY_2;
    const resB = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_2)) as any);
    expect(resB.status).toBe(200);

    expect(H.wellnessStore.rows).toHaveLength(2);
    expect((H.wellnessStore.rows[0].date as Date).toISOString()).toBe('2026-09-06T22:00:00.000Z');
    expect((H.wellnessStore.rows[1].date as Date).toISOString()).toBe('2026-09-07T22:00:00.000Z');
  });

  it('5. DST spring-forward (23h day 2026-03-29) → normalized instant is 2026-03-28T23:00:00Z and the day window spans 23h', async () => {
    H.state.todayKey = '2026-03-29';
    const { POST } = await import('@/app/api/wellness/route');

    const res = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-03-29')) as any);
    expect(res.status).toBe(200);

    expect((H.wellnessStore.rows[0].date as Date).toISOString()).toBe('2026-03-28T23:00:00.000Z');

    // The first-of-day window queried by the route spans exactly 23 hours.
    const window = H.MOCK_TX.wellnessLog.findFirst.mock.calls[0][0].where.date as { gte: Date; lt: Date };
    const { start, end } = madridDayBoundaries('2026-03-29');
    expect(window.gte.getTime()).toBe(start.getTime());
    expect(window.lt.getTime()).toBe(end.getTime());
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);
  });

  it('6. DST fall-back (25h day 2026-10-25) → normalized instant is 2026-10-24T22:00:00Z and the day window spans 25h', async () => {
    H.state.todayKey = '2026-10-25';
    const { POST } = await import('@/app/api/wellness/route');

    const res = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-10-25')) as any);
    expect(res.status).toBe(200);

    expect((H.wellnessStore.rows[0].date as Date).toISOString()).toBe('2026-10-24T22:00:00.000Z');

    const window = H.MOCK_TX.wellnessLog.findFirst.mock.calls[0][0].where.date as { gte: Date; lt: Date };
    const { start, end } = madridDayBoundaries('2026-10-25');
    expect(window.gte.getTime()).toBe(start.getTime());
    expect(window.lt.getTime()).toBe(end.getTime());
    expect((end.getTime() - start.getTime()) / 3600000).toBe(25);
  });

  it('7. G-02 window intact on the RAW instant: today, yesterday and anteayer normalize; future and 3-days-back rejected', async () => {
    const { POST } = await import('@/app/api/wellness/route');

    // Hoy → 200, normalized to its Madrid midnight.
    const rToday = await POST(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_1)) as any);
    expect(rToday.status).toBe(200);
    expect((H.wellnessStore.rows[0].date as Date).toISOString()).toBe('2026-09-06T22:00:00.000Z');

    // Ayer → 200, its own midnight.
    H.state.todayKey = DAY_1;
    const rYesterday = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-09-06')) as any);
    expect(rYesterday.status).toBe(200);
    expect(H.wellnessStore.rows.find((r) => (r.date as Date).toISOString() === '2026-09-05T22:00:00.000Z')).toBeTruthy();

    // Anteayer → 200, its own midnight.
    const rBefore = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-09-05')) as any);
    expect(rBefore.status).toBe(200);
    expect(H.wellnessStore.rows.find((r) => (r.date as Date).toISOString() === '2026-09-04T22:00:00.000Z')).toBeTruthy();

    // Mañana → 400 (future).
    const rFuture = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-09-08')) as any);
    expect(rFuture.status).toBe(400);

    // 3 días atrás → 400 (outside the ≤2-day window).
    const rTooOld = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-09-04')) as any);
    expect(rTooOld.status).toBe(400);

    expect(H.wellnessStore.rows).toHaveLength(3);
  });
});

describe('E-6 H-6 — POST /api/nutrition normalizes date to Madrid midnight (Modelo 3)', () => {
  it('8. today (UI sends YYYY-MM-DD) → stored date is the exact Madrid-midnight instant', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody(DAY_1)) as any);
    expect(res.status).toBe(200);

    expect((H.nutritionStore.rows[0].date as Date).toISOString()).toBe('2026-09-06T22:00:00.000Z');
    const json = await res.json();
    expect(json.log).toHaveProperty('water', 6);
  });

  it('9. two instants of the SAME Madrid day → ONE row, second POST edits it', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    H.state.todayKey = '2026-09-10';

    const resA = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody('2026-09-10T08:00:00Z')) as any);
    const resB = await POST(makeRequest('/api/nutrition', 'POST', nutritionBody('2026-09-10T20:00:00Z')) as any);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect((await resB.json()).log.id).toBe((await resA.json()).log.id);

    expect(H.nutritionStore.rows).toHaveLength(1);
    expect((H.nutritionStore.rows[0].date as Date).toISOString()).toBe('2026-09-09T22:00:00.000Z');
    expect(xpIncrements()).toEqual([10]);
  });
});

describe('E-6 H-6 — gamification semantics preserved (Modelo 3)', () => {
  it('10. legacy non-normalized row of today → F-2 gate pays +0 XP and adds NO streak progression', async () => {
    // Realistic post-deploy scenario: a LEGACY row (pre-normalization instant)
    // already exists for today and its day progression was paid when it was
    // created (before this test). The incoming normalized POSTs miss the
    // instant-based findUnique, create the day's normalized rows, and the
    // F-2 isFirstEnergiaLogToday gate pays +0 XP with no streak change.
    const { POST: POST_W } = await import('@/app/api/wellness/route');
    const { POST: POST_N } = await import('@/app/api/nutrition/route');

    // Legacy wellness row of today at 10:00Z (non-normalized instant).
    H.wellnessStore.rows.push({
      id: 'wl-legacy',
      userId: 'user-1',
      date: new Date('2026-09-07T10:00:00Z'),
      mood: 3, energy: 3, sleep: 3, stress: 3, notes: null,
    });

    const resN = await POST_N(makeRequest('/api/nutrition', 'POST', nutritionBody(DAY_1)) as any);
    expect(resN.status).toBe(200);
    expect(xpIncrements()).toEqual([0]); // +0 XP — no farming

    const resW = await POST_W(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_1)) as any);
    expect(resW.status).toBe(200);
    // The legacy instant differs from the normalized key, so the wellness
    // POST creates the day's normalized row in parallel — the documented
    // residual limitation while historical data is not consolidated. XP is
    // still gated to +0 by isFirstEnergiaLogToday.
    expect(xpIncrements()).toEqual([0, 0]);

    // Streak: NO new progression — the day was already active (legacy row),
    // and repeat energia activity of the same day never re-increments it.
    const streakIncrements = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => c[0]?.update?.streak as { increment: number } | undefined)
      .filter(Boolean);
    expect(streakIncrements).toHaveLength(0);
  });

  it('11. Wellness + Nutrition same day → +10 XP total, one streak progression, single daily lock family', async () => {
    const { POST: POST_W } = await import('@/app/api/wellness/route');
    const { POST: POST_N } = await import('@/app/api/nutrition/route');

    const resW = await POST_W(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_1)) as any);
    const resN = await POST_N(makeRequest('/api/nutrition', 'POST', nutritionBody(DAY_1)) as any);
    expect(resW.status).toBe(200);
    expect(resN.status).toBe(200);

    const increments = xpIncrements();
    expect(increments).toEqual([10, 0]);
    expect(increments.reduce((a, b) => a + b, 0)).toBe(10);

    const streakIncrements = H.empireProgressUpsert.mock.calls
      .map((c: any[]) => c[0]?.update?.streak as { increment: number } | undefined)
      .filter(Boolean);
    expect(streakIncrements).toHaveLength(1);

    // Lock: every energia mutation of the day shares 'user|energia|<day>'.
    expect(lockKeys()).toEqual([`user-1|energia|${DAY_1}`, `user-1|energia|${DAY_1}`]);
  });

  it('12. normalized repeat of the day (row found) reaches NO gamification code and evaluates only the wellness domain', async () => {
    const { POST } = await import('@/app/api/wellness/route');

    await POST(makeRequest('/api/wellness', 'POST', wellnessBody(DAY_1)) as any);
    expect(H.evaluateAchievementsMock).toHaveBeenCalledWith('user-1', ['wellness', 'empire']);
    H.evaluateAchievementsMock.mockClear();
    H.empireProgressUpsert.mockClear();

    const res = await POST(makeRequest('/api/wellness', 'POST', wellnessBody('2026-09-07T09:00:00Z')) as any);
    expect(res.status).toBe(200);
    expect((await res.json()).newlyUnlocked).toEqual([]);

    // Update path: no XP block executed at all.
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
    // Achievements still evaluated for the wellness domain (content changed).
    expect(H.evaluateAchievementsMock).toHaveBeenCalledWith('user-1', ['wellness']);
  });
});
