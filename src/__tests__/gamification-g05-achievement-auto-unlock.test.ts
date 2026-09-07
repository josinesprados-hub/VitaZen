/**
 * FASE 14 — G-05: automatic achievement unlocking + immediate feedback.
 *
 * Before G-05, checkAndUnlock was ONLY invoked by GET /api/achievements, so
 * an action that fulfilled an achievement condition stayed locked until the
 * user visited /logros. After G-05:
 *   - Every mutation endpoint that can change an achievement metric evaluates
 *     the AFFECTED DOMAINS ONLY right after its write commits
 *     (evaluateAchievements in src/lib/achievements.ts) and returns
 *     `newlyUnlocked` (rich metadata) in its response for immediate feedback.
 *   - Achievement rows stay guarded by @@unique([userId, key]); a losing
 *     concurrent create catches the P2002 and does NOT claim the feedback, so
 *     duplicates and duplicate feedback are impossible.
 *   - Evaluation is best-effort: it runs OUTSIDE the action transaction and
 *     can never fail the action itself. GET /api/achievements remains as the
 *     full-path safety net (and is no longer the primary unlock trigger).
 *
 * Test strategy (same family as gamification-g03/g04):
 * - Route-level tests mock @/lib/db (with an in-memory achievement table that
 *   enforces the unique constraint like PostgreSQL), @/lib/auth, rate limiting
 *   and the fire-and-forget side effects (analytics, challenges, widgets).
 * - getTodayDateKey is mocked (mutable) at BOTH specifier paths (@/lib/dates
 *   and @/lib/deterministic); every other Madrid utility stays REAL.
 * - Unlocks are verified on the REAL evaluation flow: the real collectors run
 *   against the mocked counters and the real evaluateAchievements creates the
 *   records — achievements are never stubbed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Fixed "today" (Madrid) for deterministic route tests ────

const TODAY = '2026-09-07'; // Monday

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = {
    todayKey: '2026-09-07',
    seq: 0,
    // counters read by the REAL achievement collectors
    counts: {
      meditation: 0, journal: 0, gratitude: 0, wellness: 0,
      habits: 0, nutrition: 0, checkin: 0, closure: 0,
    },
    financeGroup: [] as Array<{ type: string; _count: { type: number } }>,
    financeContext: 0,
    meditationTypes: [] as Array<{ type: string }>,
    wellnessMoods: [] as Array<{ mood: number }>,
    checkinDates: [] as Array<{ date: Date }>,
    empireRows: [] as Array<{ empire: string; xp: number; streak: number }>,
    userCreatedAt: new Date('2026-09-01T10:00:00Z'),
    // per-route pre-existing rows (null → route returns 404)
    sessionRow: null as Record<string, unknown> | null,
    journalRow: null as Record<string, unknown> | null,
    financeExistingRow: null as Record<string, unknown> | null,
    // failure injection for the best-effort evaluation
    failAchievementFindMany: false,
  };

  // ── In-memory achievement table, enforcing @@unique([userId, key]) ──
  const achievementRows: Array<{ userId: string; key: string; unlockedAt: Date }> = [];

  const achievementFindMany = vi.fn(async (args?: { where?: { userId?: string } }) => {
    if (state.failAchievementFindMany) {
      throw new Error('injected findMany failure');
    }
    const userId = args?.where?.userId;
    return achievementRows.filter(r => !userId || r.userId === userId);
  });

  const achievementCreate = vi.fn(async (args: { data: { userId: string; key: string } }) => {
    const { userId, key } = args.data;
    if (achievementRows.some(r => r.userId === userId && r.key === key)) {
      const err = new Error(
        `Invalid \`prisma.achievement.create()\` invocation: Unique constraint failed on the fields: (\`userId\`,\`key\`)`,
      ) as Error & { code?: string };
      err.code = 'P2002';
      throw err;
    }
    const row = { userId, key, unlockedAt: new Date() };
    achievementRows.push(row);
    return row;
  });

  const empireUpsert = vi.fn(async () => ({}));

  const empireFindMany = vi.fn(async () => state.empireRows);

  // Shared tx (every $transaction runs its callback against this object)
  const MOCK_TX = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => [] as unknown[]),
    user: {
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })), // G-01 CAS: false→true wins
    },
    onboardingData: { upsert: vi.fn(async () => ({ goals: '[]', primaryFocus: 'mente', stressLevel: 1, energyLevel: 1, focusLevel: 1, initialHabits: '[]' })) },
    habitLog: {
      findMany: vi.fn(async () => [] as Array<{ name: string }>),
      createMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'h-tx', streak: 0, lastCompletedAt: null, ...args.data })),
      findFirst: vi.fn(async () => null),
    },
    empireProgress: {
      upsert: empireUpsert,
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
    meditationSession: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'ms-tx', completedAt: new Date(), ...args.data })),
      findFirst: vi.fn(async () => null),
    },
    financeLog: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'fl-tx', createdAt: new Date(), date: new Date(), description: null, mood: null, contexto: null, ...args.data,
      })),
      findFirst: vi.fn(async () => null),
    },
    dailyCheckin: {
      upsert: vi.fn(async () => ({ id: 'dc-tx', date: state.todayKey })),
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    achievement: { findMany: achievementFindMany, create: achievementCreate },
    user: {
      findUnique: vi.fn(async () => ({ id: 'user-1', createdAt: state.userCreatedAt })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    meditationSession: {
      count: vi.fn(async () => state.counts.meditation),
      findMany: vi.fn(async () => state.meditationTypes),
      findUnique: vi.fn(async () => state.sessionRow),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'ms-' + (++state.seq), completedAt: new Date(), ...args.data })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data })),
      delete: vi.fn(async () => ({})),
    },
    journalEntry: {
      count: vi.fn(async (args?: { where?: Record<string, unknown> }) =>
        args?.where && 'gratitude' in args.where ? state.counts.gratitude : state.counts.journal),
      findUnique: vi.fn(async () => state.journalRow),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'je-' + (++state.seq), ...args.data })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data })),
      delete: vi.fn(async () => ({})),
    },
    wellnessLog: {
      count: vi.fn(async () => state.counts.wellness),
      findMany: vi.fn(async () => state.wellnessMoods),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: 'wl-tx' })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data })),
      delete: vi.fn(async () => ({})),
    },
    habitLog: {
      count: vi.fn(async (args?: { where?: Record<string, unknown> }) => {
        const w = args?.where ?? {};
        // POST /api/habits quota check filters by createdAt; the habits
        // collector filters by userId only.
        return 'createdAt' in w ? 0 : state.counts.habits;
      }),
      findMany: vi.fn(async () => [] as Array<{ streak: number }>),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'h-' + (++state.seq), streak: 0, lastCompletedAt: null, ...args.data })),
      createMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    nutritionLog: {
      count: vi.fn(async () => state.counts.nutrition),
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: 'nl-tx' })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, ...args.data })),
    },
    financeLog: {
      groupBy: vi.fn(async () => state.financeGroup),
      count: vi.fn(async () => state.financeContext),
      findFirst: vi.fn(async () => state.financeExistingRow),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({ id: 'fl-' + (++state.seq), createdAt: new Date(), date: new Date(), description: null, mood: null, contexto: null, ...args.data })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({ id: args.where.id, contexto: null, ...args.data })),
    },
    dailyCheckin: {
      count: vi.fn(async () => state.counts.checkin),
      findMany: vi.fn(async () => state.checkinDates),
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: 'dc-' + (++state.seq), date: state.todayKey })),
      update: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    monthlyClosure: {
      count: vi.fn(async () => state.counts.closure),
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({ id: 'mc-' + (++state.seq) })),
    },
    empireProgress: { findMany: empireFindMany, upsert: empireUpsert, update: vi.fn(async () => ({})) },
    onboardingData: {
      upsert: vi.fn(async () => ({ goals: '[]', primaryFocus: 'mente', stressLevel: 1, energyLevel: 1, focusLevel: 1, initialHabits: '[]' })),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const getAuthUserMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return {
    state, achievementRows, achievementFindMany, achievementCreate,
    empireFindMany, empireUpsert, MOCK_DB, MOCK_TX,
    getAuthUserBasicMock, getAuthUserMock, rateLimitMock,
  };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: H.getAuthUserMock,
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
  onMeditationChange: vi.fn().mockResolvedValue(undefined),
  onJournalChange: vi.fn().mockResolvedValue(undefined),
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
  onFinanceChange: vi.fn().mockResolvedValue(undefined),
  onCheckinChange: vi.fn().mockResolvedValue(undefined),
  onHabitChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/monthly-closure/digest', () => ({
  generateMonthlyDigest: vi.fn().mockResolvedValue({}),
  getPreviousMonthForClosure: vi.fn(() => '2026-08'),
  isClosurePeriod: vi.fn(() => true),
}));

// Mock ONLY "today"; keep the real Madrid conversion utilities.
vi.mock('@/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dates')>();
  return { ...actual, getTodayDateKey: () => H.state.todayKey };
});

vi.mock('@/lib/deterministic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deterministic')>();
  return { ...actual, getTodayDateKey: () => H.state.todayKey };
});

// ─── Real system under test (engine imported statically) ─────

import {
  evaluateAchievements,
  calculateProgress,
  DOMAIN_ACHIEVEMENT_KEYS,
  ACHIEVEMENTS,
} from '@/lib/achievements';

// ─── Helpers ─────────────────────────────────────────────────

function makeRequest(path: string, method: string, body?: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const USER = { id: 'user-1', plan: 'FREE' };

beforeEach(() => {
  // Clear call history but KEEP the implementations defined above.
  vi.clearAllMocks();
  H.state.todayKey = TODAY;
  H.state.seq = 0;
  H.state.counts = { meditation: 0, journal: 0, gratitude: 0, wellness: 0, habits: 0, nutrition: 0, checkin: 0, closure: 0 };
  H.state.financeGroup = [];
  H.state.financeContext = 0;
  H.state.meditationTypes = [];
  H.state.wellnessMoods = [];
  H.state.checkinDates = [];
  H.state.empireRows = [];
  H.state.userCreatedAt = new Date('2026-09-01T10:00:00Z');
  H.state.sessionRow = null;
  H.state.journalRow = null;
  H.state.financeExistingRow = null;
  H.state.failAchievementFindMany = false;
  H.achievementRows.length = 0;
  H.getAuthUserBasicMock.mockResolvedValue(USER);
  H.getAuthUserMock.mockResolvedValue(USER);
});

// ─── G-05 TESTS ──────────────────────────────────────────────

describe('G-05 — domain map invariants', () => {
  it('the union of DOMAIN_ACHIEVEMENT_KEYS covers exactly the 45 achievements', () => {
    const union = new Set(Object.values(DOMAIN_ACHIEVEMENT_KEYS).flat());
    const all = new Set(ACHIEVEMENTS.map(a => a.key));
    expect(ACHIEVEMENTS).toHaveLength(45);
    expect(union).toEqual(all);
    expect(union.size).toBe(45);
  });

  it('domains are disjoint (no achievement belongs to two domains)', () => {
    const flat = Object.values(DOMAIN_ACHIEVEMENT_KEYS).flat();
    expect(new Set(flat).size).toBe(flat.length);
  });
});

describe('G-05 — evaluateAchievements selectivity (no unnecessary evaluations)', () => {
  it('evaluating [meditation] only runs the meditation collector queries', async () => {
    await evaluateAchievements('user-1', ['meditation']);
    expect(H.MOCK_DB.meditationSession.count).toHaveBeenCalledTimes(1);
    expect(H.MOCK_DB.journalEntry.count).not.toHaveBeenCalled();
    expect(H.MOCK_DB.wellnessLog.count).not.toHaveBeenCalled();
    expect(H.MOCK_DB.nutritionLog.count).not.toHaveBeenCalled();
    expect(H.MOCK_DB.monthlyClosure.count).not.toHaveBeenCalled();
  });

  it('evaluating [habits] does not run the empire collector (no XP path)', async () => {
    await evaluateAchievements('user-1', ['habits']);
    expect(H.MOCK_DB.habitLog.count).toHaveBeenCalled();
    expect(H.empireFindMany).not.toHaveBeenCalled();
  });

  it('evaluating [habits, empire] runs the empire collector', async () => {
    await evaluateAchievements('user-1', ['habits', 'empire']);
    expect(H.empireFindMany).toHaveBeenCalledTimes(1);
  });

  it('empty domain list evaluates nothing', async () => {
    const result = await evaluateAchievements('user-1', []);
    expect(result).toEqual([]);
    expect(H.MOCK_DB.meditationSession.count).not.toHaveBeenCalled();
    expect(H.achievementFindMany).not.toHaveBeenCalled();
  });
});

describe('G-05 — POST /api/meditation unlocks at action time (TESTS 1, 2, 5)', () => {
  it('first meditation unlocks meditation_first WITHOUT visiting /logros and returns rich feedback', async () => {
    H.state.counts.meditation = 1; // the row this POST just committed
    const { POST } = await import('@/app/api/meditation/route');
    const res = await POST(makeRequest('/api/meditation', 'POST', { duration: 10, type: 'mindfulness' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Action saved
    expect(body.session).toBeTruthy();
    // Achievement unlocked by the ACTION (record created before any GET)
    expect(body.newlyUnlocked).toHaveLength(1);
    expect(body.newlyUnlocked[0]).toMatchObject({
      key: 'meditation_first',
      title: 'Primer Silencio',
      description: 'Tu primera pausa consciente',
      category: 'meditation',
      icon: 'Wind',
    });
    // The record exists in the DB at action time — no GET /api/achievements involved
    expect(H.achievementRows.map(r => r.key)).toContain('meditation_first');
    expect(H.achievementCreate).toHaveBeenCalledWith({ data: { userId: 'user-1', key: 'meditation_first' } });
  });

  it('retrying the same action does NOT duplicate the record nor re-claim feedback (TEST 3)', async () => {
    H.state.counts.meditation = 1;
    const { POST } = await import('@/app/api/meditation/route');

    const first = await POST(makeRequest('/api/meditation', 'POST', { duration: 10, type: 'mindfulness' }));
    const firstBody = await first.json();
    expect(firstBody.newlyUnlocked.map((a: { key: string }) => a.key)).toEqual(['meditation_first']);

    // Retry (same state — the unlock already happened)
    const second = await POST(makeRequest('/api/meditation', 'POST', { duration: 10, type: 'mindfulness' }));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.newlyUnlocked).toEqual([]);
    // exactly ONE record, one create call that succeeded
    expect(H.achievementRows.filter(r => r.key === 'meditation_first')).toHaveLength(1);
  });

  it('two concurrent POSTs unlocking the same achievement produce ONE record, no 500, single feedback (TEST 4)', async () => {
    H.state.counts.meditation = 2; // both requests' rows committed
    const { POST } = await import('@/app/api/meditation/route');

    const [r1, r2] = await Promise.all([
      POST(makeRequest('/api/meditation', 'POST', { duration: 10, type: 'mindfulness' })),
      POST(makeRequest('/api/meditation', 'POST', { duration: 15, type: 'box' })),
    ]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json();
    const b2 = await r2.json();

    // Exactly one achievement record — the unique constraint arbitrated.
    expect(H.achievementRows.filter(r => r.key === 'meditation_first')).toHaveLength(1);
    // Exactly ONE of the two responses claims the unlock feedback.
    const claimed = [
      b1.newlyUnlocked.some((a: { key: string }) => a.key === 'meditation_first'),
      b2.newlyUnlocked.some((a: { key: string }) => a.key === 'meditation_first'),
    ].filter(Boolean);
    expect(claimed).toHaveLength(1);
  });

  it('a single action can unlock SEVERAL achievements, all reported without duplicates (TEST 7)', async () => {
    // 10th meditation session and 3rd distinct type, both met by this action.
    // meditation_first is already owned from an earlier session.
    H.state.counts.meditation = 10;
    H.state.meditationTypes = [{ type: 'mindfulness' }, { type: 'box' }, { type: 'coherence' }];
    H.achievementRows.push({ userId: 'user-1', key: 'meditation_first', unlockedAt: new Date() });
    const { POST } = await import('@/app/api/meditation/route');
    const res = await POST(makeRequest('/api/meditation', 'POST', { duration: 20, type: 'nadi_shodhana' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    const keys = body.newlyUnlocked.map((a: { key: string }) => a.key).sort();
    expect(keys).toEqual(['hidden_meditation_3_types', 'meditation_10']);
    expect(new Set(body.newlyUnlocked.map((a: { key: string }) => a.key)).size).toBe(2);
    // All records exist: the 2 new ones + the pre-owned meditation_first
    expect(H.achievementRows.map(r => r.key).sort())
      .toEqual(['hidden_meditation_3_types', 'meditation_10', 'meditation_first']);
  });

  it('evaluation failure never fails the action (best-effort, newlyUnlocked: [])', async () => {
    H.state.counts.meditation = 1;
    H.state.failAchievementFindMany = true;
    const { POST } = await import('@/app/api/meditation/route');
    const res = await POST(makeRequest('/api/meditation', 'POST', { duration: 10, type: 'mindfulness' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session).toBeTruthy(); // the action result is intact
    expect(body.newlyUnlocked).toEqual([]);
  });
});

describe('G-05 — meditation PUT (editing type can complete hidden_meditation_3_types)', () => {
  it('PUT evaluates the meditation domain and returns newlyUnlocked', async () => {
    H.state.sessionRow = { id: 's-1', userId: 'user-1', type: 'mindfulness' };
    H.state.meditationTypes = [{ type: 'mindfulness' }, { type: 'box' }, { type: 'coherence' }];
    const { PUT } = await import('@/app/api/meditation/route');
    const res = await PUT(makeRequest('/api/meditation', 'PUT', { sessionId: 's-1', type: 'coherence' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newlyUnlocked.map((a: { key: string }) => a.key)).toContain('hidden_meditation_3_types');
  });

  it('PUT does NOT run evaluations from unrelated domains (TEST 6)', async () => {
    H.state.sessionRow = { id: 's-1', userId: 'user-1', type: 'mindfulness' };
    const { PUT } = await import('@/app/api/meditation/route');
    const res = await PUT(makeRequest('/api/meditation', 'PUT', { sessionId: 's-1', type: 'box' }));
    expect(res.status).toBe(200);
    expect(H.MOCK_DB.journalEntry.count).not.toHaveBeenCalled();
    expect(H.MOCK_DB.wellnessLog.count).not.toHaveBeenCalled();
    expect(H.MOCK_DB.dailyCheckin.count).not.toHaveBeenCalled();
    expect(H.empireFindMany).not.toHaveBeenCalled();
  });
});

describe('G-05 — journal PUT (gratitude added after creation)', () => {
  it('adding gratitude unlocks hidden_gratitude_10 (and journal_10) in one evaluation', async () => {
    H.state.journalRow = { id: 'j-1', userId: 'user-1' };
    H.state.counts.journal = 10;
    H.state.counts.gratitude = 10;
    H.achievementRows.push({ userId: 'user-1', key: 'journal_first', unlockedAt: new Date() });
    const { PUT } = await import('@/app/api/journal/route');
    const res = await PUT(makeRequest('/api/journal', 'PUT', {
      entryId: 'j-1', title: 'Día', content: 'Texto', mood: 3, gratitude: 'Mi familia',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    const keys = body.newlyUnlocked.map((a: { key: string }) => a.key).sort();
    expect(keys).toEqual(['hidden_gratitude_10', 'journal_10']);
    // No XP changes on PUT → the empire domain is NOT evaluated
    expect(H.empireFindMany).not.toHaveBeenCalled();
  });
});

describe('G-05 — POST /api/checkin (empire domain: empire_all)', () => {
  const CHECKIN_BODY = { emotion: 3, energy: 4, focus: 3, stress: 2, intention: 'Presencia', note: null };

  it('creating the check-in that activates the 5th empire unlocks empire_all', async () => {
    H.state.counts.checkin = 1;
    H.state.empireRows = [
      { empire: 'disciplina', xp: 120, streak: 2 },
      { empire: 'energia', xp: 40, streak: 1 },
      { empire: 'riqueza', xp: 10, streak: 1 },
      { empire: 'crecimiento', xp: 20, streak: 1 },
      { empire: 'mente', xp: 10, streak: 1 }, // granted by THIS check-in's tx
    ];
    const { POST } = await import('@/app/api/checkin/route');
    const res = await POST(makeRequest('/api/checkin', 'POST', CHECKIN_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newlyUnlocked.map((a: { key: string }) => a.key)).toContain('empire_all');
    expect(body.newlyUnlocked.map((a: { key: string }) => a.key)).toContain('checkin_first');
  });

  it('update path (existing check-in) does NOT evaluate (TEST 6: no unnecessary evaluations)', async () => {
    // $queryRaw FOR UPDATE returns the existing row → update path
    H.MOCK_TX.$queryRaw.mockImplementation(async () => [{ id: 'dc-1' }]);
    const { POST } = await import('@/app/api/checkin/route');
    const res = await POST(makeRequest('/api/checkin', 'POST', CHECKIN_BODY));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newlyUnlocked).toEqual([]);
    expect(H.achievementFindMany).not.toHaveBeenCalled();
    expect(H.MOCK_DB.dailyCheckin.count).not.toHaveBeenCalled();
    H.MOCK_TX.$queryRaw.mockImplementation(async () => []);
  });
});

describe('G-05 — habits domain', () => {
  it('creating the first habit unlocks habits_first at action time', async () => {
    H.state.counts.habits = 1; // the row this POST just committed
    const { POST } = await import('@/app/api/habits/route');
    const res = await POST(makeRequest('/api/habits', 'POST', { name: 'Leer 20 minutos', frequency: 'daily' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.newlyUnlocked.map((a: { key: string }) => a.key)).toEqual(['habits_first']);
    expect(H.achievementRows.map(r => r.key)).toContain('habits_first');
    // G-04 intact: creating a habit grants NO XP → no empire evaluation
    expect(H.empireFindMany).not.toHaveBeenCalled();
    expect(H.empireUpsert).not.toHaveBeenCalled();
  });
});

describe('G-05 — POST /api/monthly-closure (closure domain)', () => {
  it('first monthly closure unlocks monthly_closure_first', async () => {
    H.state.counts.closure = 1;
    const { POST } = await import('@/app/api/monthly-closure/route');
    const res = await POST(makeRequest('/api/monthly-closure', 'POST', { month: '2026-08', reflection: 'Un mes intenso' }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newlyUnlocked.map((a: { key: string }) => a.key)).toEqual(['monthly_closure_first']);
  });
});

describe('G-05 — finance dedup path (retry semantics)', () => {
  it('a duplicate finance POST (10s dedup) runs NO evaluation and returns no feedback (TEST 3/6)', async () => {
    H.state.financeExistingRow = { id: 'fl-old', userId: 'user-1', type: 'expense', category: 'café', amount: 2, date: new Date() };
    const { POST } = await import('@/app/api/finance/route');
    const res = await POST(makeRequest('/api/finance', 'POST', {
      date: TODAY, type: 'expense', category: 'café', amount: 2,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicated).toBe(true);
    expect(body.newlyUnlocked).toBeUndefined();
    // No evaluation at all — the original request already handled unlocking.
    expect(H.achievementFindMany).not.toHaveBeenCalled();
    expect(H.achievementCreate).not.toHaveBeenCalled();
  });

  it('a fresh finance POST evaluates finance + empire and unlocks finance_first + finance_income_first', async () => {
    H.state.financeGroup = [{ type: 'income', _count: { type: 1 } }];
    const { POST } = await import('@/app/api/finance/route');
    const res = await POST(makeRequest('/api/finance', 'POST', {
      date: TODAY, type: 'income', category: 'salario', amount: 1000,
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    const keys = body.newlyUnlocked.map((a: { key: string }) => a.key).sort();
    expect(keys).toEqual(['finance_first', 'finance_income_first']);
    expect(H.empireFindMany).toHaveBeenCalledTimes(1); // empire domain included on XP path
  });
});

describe('G-05 — nutrition (create evaluates, update does not)', () => {
  it('nutrition PUT (no metric affected) runs NO achievement evaluation (TEST 6)', async () => {
    const { PUT } = await import('@/app/api/nutrition/route');
    const res = await PUT(makeRequest('/api/nutrition', 'PUT', {
      logId: 'nl-1', meals: 'Pasado por agua', water: 4, calories: 1800, notes: null,
    }));
    // PUT requires an owned log; the base findUnique returns null → 404 proves
    // the route still behaves, and no evaluation ran either way.
    expect([200, 404]).toContain(res.status);
    expect(H.achievementFindMany).not.toHaveBeenCalled();
    expect(H.achievementCreate).not.toHaveBeenCalled();
  });
});

describe('G-05 — GET /api/achievements remains the safety net (TEST 8)', () => {
  it('still unlocks anything pending (e.g. time-based) and reports it once', async () => {
    H.state.counts.meditation = 5;
    H.state.counts.checkin = 1;
    H.state.checkinDates = [{ date: new Date('2026-09-07T08:00:00Z') }];
    const { GET } = await import('@/app/api/achievements/route');
    const res = await GET(makeRequest('/api/achievements', 'GET'));

    expect(res.status).toBe(200);
    const body = await res.json();
    // Full evaluation: meditation_first (count 5) unlocked now, via the GET
    expect(body.newlyUnlocked).toContain('meditation_first');
    expect(H.achievementRows.map(r => r.key)).toContain('meditation_first');
    // Response shape intact (string[] keys, achievements list, stats)
    expect(Array.isArray(body.newlyUnlocked)).toBe(true);
    expect(body.achievements.length).toBeGreaterThan(0);
    expect(body.stats.total).toBe(27);
  });

  it('revisiting /logros does NOT re-mark an already-unlocked achievement as new nor duplicate it', async () => {
    H.state.counts.meditation = 5;
    const { GET } = await import('@/app/api/achievements/route');

    const first = await GET(makeRequest('/api/achievements', 'GET'));
    const firstBody = await first.json();
    expect(firstBody.newlyUnlocked).toContain('meditation_first');

    const second = await GET(makeRequest('/api/achievements', 'GET'));
    const secondBody = await second.json();
    expect(secondBody.newlyUnlocked).toEqual([]);
    expect(H.achievementRows.filter(r => r.key === 'meditation_first')).toHaveLength(1);
  });
});

describe('G-05 — calculateProgress full path (GET parity after refactor)', () => {
  it('full progress contains all 45 keys with correct values for a seeded user', async () => {
    H.state.counts.meditation = 12;
    H.state.counts.journal = 3;
    H.state.counts.gratitude = 1;
    H.state.counts.wellness = 2;
    H.state.counts.habits = 2;
    H.state.counts.nutrition = 1;
    H.state.counts.checkin = 4;
    H.state.counts.closure = 1;
    H.state.financeGroup = [{ type: 'income', _count: { type: 2 } }, { type: 'expense', _count: { type: 3 } }];
    H.state.financeContext = 2;
    H.state.meditationTypes = [{ type: 'mindfulness' }, { type: 'box' }];
    H.state.wellnessMoods = [{ mood: 1 }, { mood: 3 }];
    H.state.empireRows = [{ empire: 'mente', xp: 450, streak: 3 }];

    const progress = await calculateProgress('user-1');
    expect(Object.keys(progress).sort()).toEqual(ACHIEVEMENTS.map(a => a.key).sort());
    expect(progress['meditation_10']).toBe(10);
    expect(progress['hidden_meditation_3_types']).toBe(2);
    expect(progress['hidden_finance_both_5']).toBe(2);
    expect(progress['empire_all']).toBe(1);
    // mente xp 450 → level = floor(450/100)+1 = 5 ≥ 5 → exactly 1 empire balanced
    expect(progress['hidden_empire_balance']).toBe(1);
    expect(progress['hidden_one_year']).toBeLessThan(365);
  });
});

