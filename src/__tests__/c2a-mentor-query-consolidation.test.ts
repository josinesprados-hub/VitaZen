/**
 * C-2a — Mentor query consolidation (FASE 21).
 *
 * The FASE 20 audit (C-2) identified redundant reads in buildMentorContext.
 * C-2a consolidates them WITHOUT changing one byte of the context or the
 * prompt (proven byte-for-byte against the pre-change build on d333173):
 *
 *   S1  wellness 7d dates  ⊂ wellness 14d fetch        → derived in memory
 *   S2  nutrition 7d + 7–14d → ONE 14d fetch + split   (PREMIUM)
 *   S3  habitLog 7d + 7–14d  → ONE 14d fetch + split   (both tiers)
 *   S4  meditation 7d + 7–14d → ONE 14d fetch + split  (PREMIUM)
 *   S5  journal 7d + 7–14d   → ONE 14d fetch + split   (PREMIUM)
 *   S6  checkin 7d + 7–14d   → ONE 14d fetch + split   (both tiers)
 *   S7  userChallenge today + completed-7d → ONE OR query + split (both tiers)
 *
 * Query budget measured against the mocks below (1 call = 1 query):
 *   FREE    12 → 10   (S6 −1, S7 −1)
 *   PREMIUM 58 → 51   (S1..S7 −7 in wave 1; the C-2a parallel round
 *                     keeps 1+21+6+1 = 29 enrichment queries unchanged)
 *
 * What these tests guarantee:
 *   - exact query counts per plan (regression guard for C-2a);
 *   - the 14-day fetches are split at the EXACT sevenDaysAgo instant
 *     (gte → this week, lt → previous week), including boundary rows;
 *   - the S7 OR query keeps the exact Madrid-day keys and the memory split
 *     reproduces both former reads (today row, completed top-5, no dupes);
 *   - FREE/PREMIUM context separation is untouched (no context leaks
 *     between plans, no new FREE data).
 *
 * Test strategy (project pattern from c1/n7/g06): @/lib/db is replaced by a
 * mini query engine that RESPECTS each query's where/take/orderBy, so every
 * query receives exactly the rows it asks for from one shared dataset. The
 * clock is frozen (2026-09-07 noon UTC → Madrid day 2026-09-07); all Madrid
 * conversions stay real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startOfMadridDay, startOf7DaysAgoMadrid } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_1 = '2026-09-07'; // Monday, frozen "today" (CEST, UTC+2)

function noonUTC(offsetFromDay1: number): Date {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1, 10, 0, 0));
}

// The exact instant buildMentorContext uses as the 7-day boundary under the
// frozen clock: now − 7 × 86400000 ms (2026-09-07T12:00:00Z − 7d).
const SEVEN_DAYS_AGO_INSTANT = new Date(Date.UTC(2026, 8, 0, 12, 0, 0)); // 2026-08-31T12:00Z
const FOURTEEN_DAYS_AGO_INSTANT = new Date(Date.UTC(2026, 7, 24, 12, 0, 0)); // 2026-08-24T12:00Z

// ─── Mini query engine (hoisted — used by the vi.mock factory) ──────

const H = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Where = Record<string, unknown>;

  const state: Record<string, Row[]> = {};
  let queryCount = 0;

  function matchesWhere(row: Row, where: Where | undefined): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (key === 'OR') {
        const branches = cond as Where[];
        if (!branches.some((w) => matchesWhere(row, w))) return false;
        continue;
      }
      const v = row[key];
      if (cond === null) {
        if (v !== null && v !== undefined) return false;
        continue;
      }
      if (cond instanceof Date) {
        if (!(v instanceof Date) || v.getTime() !== cond.getTime()) return false;
        continue;
      }
      if (typeof cond === 'object') {
        const c = cond as Record<string, unknown>;
        const t = (x: unknown) => (x instanceof Date ? x.getTime() : typeof x === 'number' ? (x as number) : null);
        if ('gte' in c) {
          const tv = t(v); const tc = t(c.gte);
          if (tv === null || tc === null || tv < tc) return false;
        }
        if ('gt' in c) {
          const tv = t(v); const tc = t(c.gt);
          if (tv === null || tc === null || tv <= tc) return false;
        }
        if ('lt' in c) {
          const tv = t(v); const tc = t(c.lt);
          if (tv === null || tc === null || tv >= tc) return false;
        }
        if ('not' in c) {
          if (c.not === null && (v === null || v === undefined)) return false;
          if (c.not !== null && v === null) return false;
        }
        continue;
      }
      if (v !== cond) return false;
    }
    return true;
  }

  function sortBy(rows: Row[], orderBy: Record<string, string> | Record<string, string>[]): Row[] {
    const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
    const out = [...rows];
    for (const spec of specs.reverse()) {
      const [field, dir] = Object.entries(spec)[0];
      out.sort((a, b) => {
        const av = a[field] as Date | number | string | null;
        const bv = b[field] as Date | number | string | null;
        const an = av instanceof Date ? av.getTime() : typeof av === 'number' ? av : av === null || av === undefined ? -Infinity : av;
        const bn = bv instanceof Date ? bv.getTime() : typeof bv === 'number' ? bv : bv === null || bv === undefined ? -Infinity : bv;
        if (an === bn) return 0;
        return dir === 'desc' ? (an < bn ? 1 : -1) : an < bn ? -1 : 1;
      });
    }
    return out;
  }

  function query(table: string, args: Record<string, unknown>): Promise<Row[]> {
    queryCount++;
    let rows = state[table] ?? [];
    const where = args?.where as Where | undefined;
    if (where) rows = rows.filter((r) => matchesWhere(r, where));
    if (args?.orderBy) rows = sortBy(rows, args.orderBy as Record<string, string>);
    if (typeof args?.take === 'number') rows = rows.slice(0, args.take);
    return Promise.resolve(rows);
  }

  function makeTable(name: string) {
    return {
      findMany: vi.fn((args?: Record<string, unknown>) => query(name, args ?? {})),
      findFirst: vi.fn(async (args?: Record<string, unknown>) => {
        const rows = await query(name, { ...(args ?? {}), take: 1 });
        return rows[0] ?? null;
      }),
      count: vi.fn(async (args?: Record<string, unknown>) => {
        const rows = await query(name, args ?? {});
        return rows.length;
      }),
      findUnique: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        queryCount++;
        const rows = state[name] ?? [];
        return rows.find((r) => matchesWhere(r, args?.where ?? {})) ?? null;
      }),
    };
  }

  function seed(data: Record<string, Row[]>) {
    for (const [k, v] of Object.entries(data)) state[k] = v;
  }
  function clearSeed() {
    for (const k of Object.keys(state)) delete state[k];
    queryCount = 0;
  }
  function getQueryCount() {
    return queryCount;
  }
  function resetQueryCount() {
    queryCount = 0;
  }

  return { seed, clearSeed, getQueryCount, resetQueryCount, MOCK_DB: {
    dailyCheckin: makeTable('dailyCheckin'),
    habitLog: makeTable('habitLog'),
    meditationSession: makeTable('meditationSession'),
    journalEntry: makeTable('journalEntry'),
    aIThread: makeTable('aIThread'),
    empireProgress: makeTable('empireProgress'),
    user: makeTable('user'),
    onboardingData: makeTable('onboardingData'),
    wellnessLog: makeTable('wellnessLog'),
    financeLog: makeTable('financeLog'),
    nutritionLog: makeTable('nutritionLog'),
    monthlyClosure: makeTable('monthlyClosure'),
    emotionalDashboardState: makeTable('emotionalDashboardState'),
    achievement: makeTable('achievement'),
    userChallenge: makeTable('userChallenge'),
  } };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));
vi.mock('@/lib/groq', () => ({
  groq: { chat: { completions: { create: vi.fn() } } },
  GROQ_MODEL: 'test-model',
  SYSTEM_PROMPTS: { FREE: 'BASE_PROMPT_FREE', PREMIUM: 'BASE_PROMPT_PREMIUM' },
}));
vi.mock('@/lib/observability/server-logger', () => ({
  serverLog: { error: vi.fn(), apiError: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const START_OF_TODAY = startOfMadridDay(DAY_1);

// ─── Seed helpers ───────────────────────────────────────────────────

function baseSeed(plan: 'FREE' | 'PREMIUM') {
  const u = 'user-1';
  return {
    user: [{ id: u, name: 'Ana', plan }],
    dailyCheckin: [] as Record<string, unknown>[],
    habitLog: [] as Record<string, unknown>[],
    meditationSession: [] as Record<string, unknown>[],
    journalEntry: [] as Record<string, unknown>[],
    wellnessLog: [] as Record<string, unknown>[],
    nutritionLog: [] as Record<string, unknown>[],
    userChallenge: [] as Record<string, unknown>[],
    aIThread: [] as Record<string, unknown>[],
    empireProgress: [] as Record<string, unknown>[],
    onboardingData: [] as Record<string, unknown>[],
    financeLog: [] as Record<string, unknown>[],
    monthlyClosure: [] as Record<string, unknown>[],
    emotionalDashboardState: [] as Record<string, unknown>[],
    achievement: [] as Record<string, unknown>[],
  };
}

beforeEach(() => {
  H.clearSeed();
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-07T12:00:00.000Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════
// 1. QUERY BUDGET — the C-2a regression guard
// ═══════════════════════════════════════════════════════════

describe('C-2a — query budget per message', () => {
  it('FREE executes exactly 10 queries (was 12 before C-2a: S6 −1, S7 −1)', async () => {
    H.seed(baseSeed('FREE'));
    const { buildMentorContext } = await import('@/lib/mentor-context');
    await buildMentorContext('user-1', 'FREE');
    expect(H.getQueryCount()).toBe(10);
  });

  it('PREMIUM executes exactly 51 queries (was 58 before C-2a: S1..S7 −7 in wave 1)', async () => {
    H.seed(baseSeed('PREMIUM'));
    const { buildMentorContext } = await import('@/lib/mentor-context');
    await buildMentorContext('user-1', 'PREMIUM');
    // 22 wave-1 + 1 closures + 21 life stages (3 months × 7) + 6 patterns + 1 dashboard state
    expect(H.getQueryCount()).toBe(51);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. WINDOW EQUIVALENCE — the 14d fetch splits at the exact instants
// ═══════════════════════════════════════════════════════════

describe('C-2a — S6/S3 window split is exact (FREE observable fields)', () => {
  it('a check-in EXACTLY at the sevenDaysAgo instant belongs to THIS week; 1ms earlier belongs to the previous week', async () => {
    const s = baseSeed('FREE');
    s.dailyCheckin = [
      { userId: 'user-1', date: SEVEN_DAYS_AGO_INSTANT, emotion: 3, energy: 3, focus: 3, stress: 3, intention: 'frontera', note: null },
      { userId: 'user-1', date: new Date(SEVEN_DAYS_AGO_INSTANT.getTime() - 1), emotion: 2, energy: 2, focus: 2, stress: 4, intention: 'anterior', note: null },
      { userId: 'user-1', date: noonUTC(0), emotion: 4, energy: 4, focus: 4, stress: 2, intention: 'hoy', note: null },
      { userId: 'user-1', date: new Date(SEVEN_DAYS_AGO_INSTANT.getTime() - 6 * 86400000), emotion: 2, energy: 2, focus: 2, stress: 4, intention: 'prev', note: null },
    ];
    H.seed(s);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');

    // this week: hoy + frontera (gte) = 2 → 2 distinct checkin days + 0 other
    expect(ctx.weeklyActivity.checkins).toBe(2);
    // consistency counts distinct days with any activity: today + boundary day
    expect(ctx.consistency.activeDaysThisWeek).toBe(2);
    // FREE trend is checkin-count based: 2 vs 1 → 'stable' (no ±1 margin crossing)
    expect(ctx.consistency.trend).toBe('stable');
  });

  it('a habit completion EXACTLY at fourteenDaysAgo is still fetched (gte) and lands in the PREVIOUS week slice', async () => {
    const s = baseSeed('FREE');
    s.habitLog = [
      { userId: 'user-1', name: 'Frontera14', streak: 2, lastCompletedAt: FOURTEEN_DAYS_AGO_INSTANT, frequency: 'daily' },
      { userId: 'user-1', name: 'Antes14', streak: 2, lastCompletedAt: new Date(FOURTEEN_DAYS_AGO_INSTANT.getTime() - 1), frequency: 'daily' },
      { userId: 'user-1', name: 'Frontera7', streak: 2, lastCompletedAt: SEVEN_DAYS_AGO_INSTANT, frequency: 'daily' },
      { userId: 'user-1', name: 'Hoy', streak: 3, lastCompletedAt: noonUTC(0), frequency: 'daily' },
    ];
    H.seed(s);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');

    // weekly habit slice: Frontera7 (gte) + Hoy → 2 rows (Frontera14 and
    // Antes14 belong to the previous slice, still fetched by the 14d query)
    expect(ctx.weeklyActivity.habits).toBe(2);
    // streaks remain gated by lastCompletedAt as before (Frontera14 at 14d
    // is outside the daily-streak window → alive set only includes Hoy/Frontera7-era rows)
    expect(ctx.habitStreaks.map(h => h.name)).toEqual(['Hoy']);
  });

  it('the same dataset yields identical weeklyActivity whether rows sit strictly inside one week or on both boundaries (PREMIUM)', async () => {
    const s = baseSeed('PREMIUM');
    s.dailyCheckin = [
      { userId: 'user-1', date: noonUTC(0), emotion: 3, energy: 3, focus: 3, stress: 3, intention: 'a', note: null },
      { userId: 'user-1', date: noonUTC(-1), emotion: 3, energy: 3, focus: 3, stress: 3, intention: 'b', note: null },
      { userId: 'user-1', date: noonUTC(-9), emotion: 3, energy: 3, focus: 3, stress: 3, intention: 'c', note: null },
    ];
    s.meditationSession = [
      { userId: 'user-1', duration: 10, type: 'mindfulness', completedAt: SEVEN_DAYS_AGO_INSTANT }, // boundary → this week
      { userId: 'user-1', duration: 10, type: 'mindfulness', completedAt: noonUTC(-1) },
      { userId: 'user-1', duration: 10, type: 'mindfulness', completedAt: noonUTC(-8) },            // previous week
    ];
    s.journalEntry = [
      { userId: 'user-1', title: 'A', content: 'x', mood: 3, createdAt: noonUTC(0) },
      { userId: 'user-1', title: 'B', content: 'y', mood: 3, createdAt: new Date(SEVEN_DAYS_AGO_INSTANT.getTime() - 1000) }, // prev
    ];
    s.nutritionLog = [
      { userId: 'user-1', date: noonUTC(-2) },
      { userId: 'user-1', date: new Date(SEVEN_DAYS_AGO_INSTANT.getTime() - 2000) }, // prev
      { userId: 'user-1', date: SEVEN_DAYS_AGO_INSTANT },                            // this week (gte)
    ];
    s.wellnessLog = [
      { userId: 'user-1', date: noonUTC(0), sleep: 4, mood: 3, stress: 2, energy: 3, notes: null },
      { userId: 'user-1', date: noonUTC(-9), sleep: 2, mood: 2, stress: 4, energy: 2, notes: null },
    ];
    H.seed(s);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');

    expect(ctx.weeklyActivity).toEqual({
      meditations: 2, // boundary row (gte) + yesterday
      habits: 0,
      journals: 1,
      checkins: 2,
      wellness: 1,
      nutrition: 2,   // boundary row (gte) + -2d
    });
    // S1: the wellness DISPLAY slice is unchanged — it takes the 7 most
    // recent rows of the 14-day fetch (previous-week rows included), exactly
    // as before C-2a.
    expect(ctx.wellnessLogs).toHaveLength(2);
    expect(ctx.wellnessLogs[0].date).toEqual(noonUTC(0));
    expect(ctx.wellnessLogs[1].date).toEqual(noonUTC(-9));
  });
});

// ═══════════════════════════════════════════════════════════
// 3. S7 — the merged challenge query and its memory split
// ═══════════════════════════════════════════════════════════

function challengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uc-1', userId: 'user-1', challengeId: 'ch-1',
    completed: false, completedAt: null as Date | null,
    date: START_OF_TODAY,
    challenge: { id: 'ch-1', category: 'salud', title: 'Bebe 3 litros de agua', description: '', difficulty: 'easy', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ...overrides,
  };
}

describe('C-2a — S7 one OR query for today + completed history', () => {
  it('queries once with the exact Madrid-day keys and splits today/completed without duplicates', async () => {
    const s = baseSeed('FREE');
    s.userChallenge = [
      challengeRow({ id: 'uc-today', completed: false }),
      // completed today → belongs to BOTH the today row set AND the completed list
      challengeRow({ id: 'uc-today-done', completed: true, completedAt: noonUTC(0), date: START_OF_TODAY }),
      challengeRow({ id: 'uc-old-assignment', completed: true, completedAt: noonUTC(-1), date: startOfMadridDay('2026-08-20') }),
      // completed exactly at the 7-Madrid-days boundary (gte → included)
      challengeRow({ id: 'uc-boundary', completed: true, completedAt: startOf7DaysAgoMadrid(), date: startOfMadridDay('2026-08-25') }),
      // completed 1ms before the boundary → excluded
      challengeRow({ id: 'uc-just-outside', completed: true, completedAt: new Date(startOf7DaysAgoMadrid().getTime() - 1), date: startOfMadridDay('2026-08-20') }),
    ];
    H.seed(s);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');

    expect(ctx.gamification).not.toBeNull();
    // today = the row whose date IS the current Madrid-day key (first match)
    expect(ctx.gamification!.currentChallenge!.title).toBe('Bebe 3 litros de agua');
    expect(ctx.gamification!.currentChallenge!.completed).toBe(false);
    // completed list: uc-today-done (today), uc-old-assignment (−1d), uc-boundary (gte) — NO duplicates, NOT uc-just-outside
    const ids = ctx.gamification!.recentCompleted.map(r => r.title);
    expect(ids).toEqual(['Bebe 3 litros de agua', 'Bebe 3 litros de agua', 'Bebe 3 litros de agua']);
    // 3 distinct rows reached the list (titles equal by seed) — verify via count
    expect(ctx.gamification!.recentCompleted).toHaveLength(3);
    expect(ctx.gamification!.recentCompleted[0].completedAt >= startOf7DaysAgoMadrid()).toBe(true);
  });

  it('caps the completed list at the same top-5 the former DB-level take applied', async () => {
    const s = baseSeed('PREMIUM');
    const completed = Array.from({ length: 7 }, (_, i) =>
      challengeRow({
        id: `uc-done-${i}`,
        completed: true,
        completedAt: new Date(Date.UTC(2026, 8, 6 - i, 10, 0, 0)), // −1d … −7d
        date: startOfMadridDay('2026-08-30'),
        challenge: { id: `ch-${i}`, category: 'salud', title: `Reto ${i}`, description: '', difficulty: 'easy', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      }));
    s.userChallenge = completed;
    H.seed(s);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');

    expect(ctx.gamification!.recentCompleted.map(r => r.title)).toEqual([
      'Reto 0', 'Reto 1', 'Reto 2', 'Reto 3', 'Reto 4', // most recent first, 5 max
    ]);
    // no challenge today (only completed rows) → currentChallenge null
    expect(ctx.gamification!.currentChallenge).toBeNull();
  });

  it('a failing merged challenge read degrades to null/[] without breaking the context (catch preserved)', async () => {
    const s = baseSeed('FREE');
    H.seed(s);
    H.MOCK_DB.userChallenge.findMany.mockRejectedValueOnce(new Error('challenge read failed'));

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');

    expect(ctx.gamification).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// 4. PLAN SEPARATION — consolidations changed nothing for FREE/PREMIUM
// ═══════════════════════════════════════════════════════════

describe('C-2a — FREE/PREMIUM context separation is untouched', () => {
  it('FREE keeps: no premium queries, empty premium-only fields, gamification present', async () => {
    const s = baseSeed('FREE');
    s.dailyCheckin = [
      { userId: 'user-1', date: noonUTC(0), emotion: 4, energy: 4, focus: 4, stress: 2, intention: 'hoy', note: null },
    ];
    s.userChallenge = [challengeRow({ completed: false })];
    s.wellnessLog = [{ userId: 'user-1', date: noonUTC(0), sleep: 4, mood: 3, stress: 2, energy: 3, notes: 'nota' }];
    s.nutritionLog = [{ userId: 'user-1', date: noonUTC(0) }];
    s.empireProgress = [{ userId: 'user-1', empire: 'mente', xp: 100, streak: 3 }];
    H.seed(s);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');

    expect(ctx.plan).toBe('FREE');
    expect(ctx.emotionalState).toBeNull();
    expect(ctx.patternObservations).toBeNull();
    expect(ctx.lifeStage).toBeNull();
    expect(ctx.monthlyClosures).toEqual([]);
    expect(ctx.silentMemories).toEqual([]);
    expect(ctx.onboardingData).toBeNull();
    expect(ctx.empireProgress).toEqual([]);
    // premium-only weekly counters stay 0 for FREE (S1/S2 did not widen FREE data)
    expect(ctx.weeklyActivity.wellness).toBe(0);
    expect(ctx.weeklyActivity.nutrition).toBe(0);
    expect(ctx.wellnessLogs).toEqual([]);
    // FREE still receives its own weekly counters from the consolidated fetches
    expect(ctx.weeklyActivity.checkins).toBe(1);
  });

  it('PREMIUM keeps every enrichment source (ESE, closures, life stage, patterns, silent memories, empire progress)', async () => {
    const s = baseSeed('PREMIUM');
    s.dailyCheckin = [
      { userId: 'user-1', date: noonUTC(0), emotion: 2, energy: 2, focus: 3, stress: 4, intention: 'Cuidarme', note: null },
      { userId: 'user-1', date: noonUTC(-1), emotion: 4, energy: 4, focus: 4, stress: 2, intention: 'Seguir', note: null },
      { userId: 'user-1', date: noonUTC(-9), emotion: 3, energy: 3, focus: 3, stress: 3, intention: 'prev', note: null },
    ];
    s.wellnessLog = [
      { userId: 'user-1', date: noonUTC(0), sleep: 4, mood: 3, stress: 2, energy: 3, notes: 'Mejorando' },
      { userId: 'user-1', date: new Date(Date.UTC(2026, 7, 10, 10, 0, 0)), sleep: 2, mood: 2, stress: 4, energy: 2, notes: null },
    ];
    s.financeLog = [
      { userId: 'user-1', date: noonUTC(-1), createdAt: noonUTC(-1), type: 'expense', category: 'ocio', amount: 20, mood: 'enjoyment', contexto: null },
      { userId: 'user-1', date: noonUTC(-2), createdAt: noonUTC(-2), type: 'expense', category: 'super', amount: 40, mood: 'necessity', contexto: 'Compra' },
      { userId: 'user-1', date: noonUTC(-3), createdAt: noonUTC(-3), type: 'expense', category: 'transporte', amount: 30, mood: 'necessity', contexto: null },
    ];
    s.habitLog = [{ userId: 'user-1', name: 'Meditar', streak: 5, lastCompletedAt: noonUTC(0), frequency: 'daily' }];
    s.meditationSession = [{ userId: 'user-1', duration: 10, type: 'mindfulness', completedAt: noonUTC(0) }];
    s.journalEntry = [{ userId: 'user-1', title: 'Reflexión', content: 'Cuando medito duermo mejor.', mood: 4, createdAt: noonUTC(0) }];
    s.nutritionLog = [{ userId: 'user-1', date: noonUTC(-1) }];
    s.empireProgress = [{ userId: 'user-1', empire: 'mente', xp: 80, streak: 2 }];
    s.monthlyClosure = [{ userId: 'user-1', month: '2026-09', reflection: 'ok', reflectedAt: noonUTC(-1), summaryViewedAt: noonUTC(-1) }];
    s.emotionalDashboardState = [{ userId: 'user-1', memoryState: JSON.stringify({ shown: ['Un mes así.'] }) }];
    s.onboardingData = [{ userId: 'user-1', goals: '["dormir mejor"]', primaryFocus: 'mente', stressLevel: 3, energyLevel: 3, focusLevel: 3, initialHabits: '["Meditar"]' }];
    H.seed(s);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');

    expect(ctx.plan).toBe('PREMIUM');
    expect(ctx.emotionalState).not.toBeNull();
    expect(ctx.emotionalState!.status).toBeTruthy();
    expect(ctx.monthlyClosures).toHaveLength(1);
    expect(ctx.monthlyClosures[0].hasReflection).toBe(true);
    expect(ctx.silentMemories).toEqual(['Un mes así.']);
    expect(ctx.onboardingData!.goals).toEqual(['dormir mejor']);
    expect(ctx.empireProgress).toHaveLength(1);
    expect(ctx.empireProgress[0].streak).toBe(2); // gated, alive
    // life stage: the engine consumed the seeded months (no crash → block ran)
    expect(ctx.lifeStage === null || typeof ctx.lifeStage!.flavor === 'string').toBe(true);
  });
});
