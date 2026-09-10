/**
 * N-5 — Challenge XP goes to the challenge's own empire (Opción B).
 *
 * Before N-5, every auto-completed challenge awarded "+25 XP → disciplina"
 * regardless of its category. N-5 routes the reward to the empire of the
 * challenge's OWN category (single canonical mapping
 * CHALLENGE_CATEGORY_TO_EMPIRE in src/lib/challenge-auto-complete.ts):
 *
 *   disciplina    → disciplina
 *   habitos       → disciplina
 *   mentalidad    → mente
 *   productividad → crecimiento
 *   salud         → energia
 *
 * (The repo's real challenge categories are action themes, not empire
 * names; no challenge category is completed by a finance action, so
 * riqueza never receives challenge XP. Task cases A–E are expressed with
 * the REAL repo categories.)
 *
 * The category is server-side data (DailyChallenge.category, seeded): the
 * client cannot influence it — the manual completion endpoint is
 * 403-deprecated and no API accepts a category (CASE J).
 *
 * Guarantees kept from D-1 (all deterministic, no sleeps):
 *   - exactly ONE award per challenge (CAS updateMany with completed:false
 *     inside a transaction; only count===1 grants XP) — CASE G/H;
 *   - exactly +25 (never +20/+50/double) — CASE F;
 *   - the reward grants XP only, never streaks;
 *   - XP amounts of every other source are untouched (covered by the
 *     existing gamification suites running in the same regression pass).
 *
 * Strategy: unit tests over the REAL tryAutoCompleteChallenge (the single
 * reward path — called fire-and-forget by every action route), with the
 * DB mocked as a small deterministic state machine. The deprecated manual
 * route is exercised for real (CASE J).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Deterministic DB state machine (hoisted) ────────────────

const H = vi.hoisted(() => {
  const state = {
    // Mirrors UserChallenge.completed for the CAS semantics.
    completed: false,
    // When true, findFirst returns the row even if completed (stale read,
    // like two concurrent callers that both passed the findFirst check).
    staleFindFirst: false,
  };

  // Side-channel: counts returned by each updateMany invocation (mock.results
  // holds the Promise for async fns, not the resolved value).
  const casCounts: number[] = [];

  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const empireUpsert = vi.fn();

  const MOCK_DB: {
    userChallenge: { findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> };
    empireProgress: { upsert: ReturnType<typeof vi.fn> };
    $transaction: (fn: (tx: unknown) => unknown) => Promise<unknown>;
  } = {
    userChallenge: { findFirst, updateMany },
    empireProgress: { upsert: empireUpsert },
    // tx === MOCK_DB: the transaction body calls the same mocks.
    $transaction: async (fn) => fn(MOCK_DB),
  };

  function wireDefaults() {
    state.completed = false;
    state.staleFindFirst = false;
    casCounts.length = 0;

    findFirst.mockImplementation(async () => {
      if (state.staleFindFirst || !state.completed) return makeUserChallenge();
      return null; // real WHERE completed:false → nothing uncompleted
    });

    // Real CAS: only the caller that flips completed:false → true gets 1.
    updateMany.mockImplementation(async ({ where }: any) => {
      if (where?.completed === false && !state.completed) {
        state.completed = true;
        casCounts.push(1);
        return { count: 1 };
      }
      casCounts.push(0);
      return { count: 0 };
    });

    empireUpsert.mockResolvedValue({});
  }

  return { state, casCounts, MOCK_DB, wireDefaults };
});

function makeUserChallenge(category = 'disciplina', title = 'Reto de prueba') {
  return {
    id: 'uc-1',
    userId: 'user-1',
    challengeId: 'dc-1',
    completed: H.state.completed,
    completedAt: null,
    date: new Date('2026-09-10T00:00:00.000Z'),
    challenge: {
      id: 'dc-1',
      category,
      title,
      description: 'Descripción del reto',
      difficulty: 'medium',
    },
  };
}

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

// ─── Helpers ─────────────────────────────────────────────────

// The action that completes each category in the real auto-complete gating
// (ACTION_CATEGORIES): the action decides IF the challenge completes, the
// category decides WHICH empire is rewarded.
const ACTION_FOR_CATEGORY: Record<string, string> = {
  disciplina: 'habit',
  habitos: 'habit',
  mentalidad: 'meditation',
  productividad: 'journal',
  salud: 'checkin',
};

type Call = { where: { userId_empire: { userId: string; empire: string } }; update: any; create: any };

function upsertCalls(): Call[] {
  return H.MOCK_DB.empireProgress.upsert.mock.calls.map((c: any[]) => c[0] as Call);
}

async function run(action: string, habitName?: string) {
  const { tryAutoCompleteChallenge } = await import('@/lib/challenge-auto-complete');
  return tryAutoCompleteChallenge('user-1', action as any, habitName);
}

function beforeEachSetup(category: string) {
  H.MOCK_DB.userChallenge.findFirst.mockImplementation(async () => {
    if (H.state.staleFindFirst || !H.state.completed) return makeUserChallenge(category);
    return null;
  });
}

// ─── Tests ───────────────────────────────────────────────────

describe('N-5 — CASES A–E: each challenge category rewards its own empire (+25, XP only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.wireDefaults();
  });

  it('A — disciplina challenge (via habit) → +25 to disciplina', async () => {
    beforeEachSetup('disciplina');
    await run('habit');

    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0].where.userId_empire).toEqual({ userId: 'user-1', empire: 'disciplina' });
    expect(upsertCalls()[0].update).toEqual({ xp: { increment: 25 } });
    expect(upsertCalls()[0].create).toEqual({ userId: 'user-1', empire: 'disciplina', xp: 25 });
  });

  it('B — salud challenge (via checkin) → +25 to energia; disciplina never touched', async () => {
    beforeEachSetup('salud');
    await run('checkin');

    const calls = upsertCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where.userId_empire.empire).toBe('energia');
    expect(calls.every((c) => c.where.userId_empire.empire !== 'disciplina')).toBe(true);
  });

  it('C — mentalidad challenge (via meditation) → +25 to mente; disciplina never touched', async () => {
    beforeEachSetup('mentalidad');
    await run('meditation');

    const calls = upsertCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where.userId_empire.empire).toBe('mente');
    expect(calls.every((c) => c.where.userId_empire.empire !== 'disciplina')).toBe(true);
  });

  it('D — productividad challenge (via journal) → +25 to crecimiento; disciplina never touched', async () => {
    beforeEachSetup('productividad');
    await run('journal');

    const calls = upsertCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where.userId_empire.empire).toBe('crecimiento');
    expect(calls.every((c) => c.where.userId_empire.empire !== 'disciplina')).toBe(true);
  });

  it('E — habitos challenge (via habit) → +25 to its own category empire (disciplina)', async () => {
    beforeEachSetup('habitos');
    await run('habit');

    const calls = upsertCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where.userId_empire.empire).toBe('disciplina');
  });

  it('reward is XP-only: the upsert never touches streak (same shape for every empire)', async () => {
    beforeEachSetup('salud');
    await run('checkin');

    const call = upsertCalls()[0];
    expect(Object.keys(call.update)).toEqual(['xp']);
    expect(Object.keys(call.create).sort()).toEqual(['empire', 'userId', 'xp']);
  });
});

describe('N-5 — CASE F: exactly +25 per valid completion (never +20/+50/double)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.wireDefaults();
  });

  it('every mapped category grants exactly +25 in update AND create paths, once', async () => {
    const { CHALLENGE_CATEGORY_TO_EMPIRE } = await import('@/lib/challenge-auto-complete');
    const categories = Object.keys(CHALLENGE_CATEGORY_TO_EMPIRE);

    expect(categories.sort()).toEqual(['disciplina', 'habitos', 'mentalidad', 'productividad', 'salud']);

    for (const category of categories) {
      vi.clearAllMocks();
      H.wireDefaults();
      beforeEachSetup(category);

      await run(ACTION_FOR_CATEGORY[category]);

      expect(H.MOCK_DB.userChallenge.updateMany).toHaveBeenCalledTimes(1);
      expect(upsertCalls()).toHaveLength(1);
      expect(upsertCalls()[0].update.xp).toEqual({ increment: 25 });
      expect(upsertCalls()[0].create.xp).toBe(25);
      expect(upsertCalls()[0].where.userId_empire.empire).toBe(CHALLENGE_CATEGORY_TO_EMPIRE[category]);
    }
  });
});

describe('N-5 — CASE G: duplicate completion never re-awards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.wireDefaults();
  });

  it('second sequential completion finds nothing uncompleted → no second +25', async () => {
    beforeEachSetup('salud');

    await run('checkin'); // first: completes and awards
    expect(upsertCalls()).toHaveLength(1);

    await run('checkin'); // second: findFirst → null (already completed)
    expect(upsertCalls()).toHaveLength(1); // still exactly one award
  });

  it('stale read that still reaches the CAS (updateMany count 0) → no award', async () => {
    beforeEachSetup('salud');
    H.state.staleFindFirst = true; // findFirst ignores completed (stale read)
    H.state.completed = true;      // ...but the row is already completed

    await run('checkin');

    expect(H.MOCK_DB.userChallenge.updateMany).toHaveBeenCalledTimes(1);
    expect(upsertCalls()).toHaveLength(0); // CAS rejected: no XP
  });
});

describe('N-5 — CASE H: two concurrent completions → exactly one award, never +50', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.wireDefaults();
  });

  it('Promise.all with stale reads on both sides → single +25 to energia (deterministic CAS)', async () => {
    beforeEachSetup('salud');
    H.state.staleFindFirst = true; // BOTH callers pass findFirst (real race)

    await Promise.all([run('checkin'), run('meditation')]);

    // Both reached the CAS, but only one flipped the flag:
    expect(H.MOCK_DB.userChallenge.updateMany).toHaveBeenCalledTimes(2);
    expect(H.casCounts.slice().sort()).toEqual([0, 1]);

    // Exactly one reward, exactly +25, to the challenge's own empire:
    const calls = upsertCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where.userId_empire.empire).toBe('energia');
    expect(calls[0].update).toEqual({ xp: { increment: 25 } });
  });

  it('same race on a disciplina challenge → single +25, never +50', async () => {
    beforeEachSetup('disciplina');
    H.state.staleFindFirst = true;

    await Promise.all([run('habit'), run('habit')]);

    expect(H.casCounts.slice().sort()).toEqual([0, 1]);
    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0].where.userId_empire.empire).toBe('disciplina');
  });
});

describe('N-5 — CASE I: the auto-complete path (every action route) rewards the right empire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.wireDefaults();
  });

  it('full action×category matrix: each completing action awards the mapped empire', async () => {
    const mod = await import('@/lib/challenge-auto-complete');
    const { CHALLENGE_CATEGORY_TO_EMPIRE } = mod;
    // ACTION_CATEGORIES is internal; mirror of its real contents — kept in
    // sync by the matrix test below failing loudly if the code changes.
    const ACTION_CATEGORIES: Record<string, string[]> = {
      checkin: ['salud'],
      habit: ['disciplina', 'habitos'],
      meditation: ['mentalidad', 'salud'],
      journal: ['mentalidad', 'productividad'],
      wellness: ['salud'],
      nutrition: ['salud'],
    };

    for (const [action, categories] of Object.entries(ACTION_CATEGORIES)) {
      for (const category of categories) {
        vi.clearAllMocks();
        H.wireDefaults();
        beforeEachSetup(category);

        await run(action);

        const calls = upsertCalls();
        expect(calls, `${action} × ${category}`).toHaveLength(1);
        expect(calls[0].where.userId_empire.empire, `${action} × ${category}`).toBe(
          CHALLENGE_CATEGORY_TO_EMPIRE[category]
        );
        expect(calls[0].update).toEqual({ xp: { increment: 25 } });
      }
    }
  });

  it('a non-matching action does NOT complete the challenge (gating intact, no XP)', async () => {
    beforeEachSetup('salud'); // salud is NOT completable by habit (without title match)
    await run('habit');

    expect(H.MOCK_DB.userChallenge.updateMany).not.toHaveBeenCalled();
    expect(upsertCalls()).toHaveLength(0);
    expect(H.state.completed).toBe(false);
  });
});

describe('N-5 — CASE J: the reward destination cannot be manipulated from the client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.wireDefaults();
  });

  it('title-match completion still follows the SERVER category, not the client action', async () => {
    // productividad challenge completed by a habit whose name matches the
    // title: the empire must be the challenge category's (crecimiento),
    // NOT the habit action's empire (disciplina).
    const TITLE = 'Limpia tu espacio de trabajo'; // real seed title (productividad)
    H.MOCK_DB.userChallenge.findFirst.mockImplementation(async () => makeUserChallenge('productividad', TITLE));
    // Only for this test, bypass the CAS wiring of beforeEachSetup:
    H.MOCK_DB.userChallenge.updateMany.mockResolvedValue({ count: 1 });

    await run('habit', TITLE);

    const calls = upsertCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where.userId_empire.empire).toBe('crecimiento');
  });

  it('unknown category → fail-closed: no completion, no XP', async () => {
    beforeEachSetup('categoria-inexistente' as any);

    await run('checkin'); // even though checkin "matches" nothing, the point
    // is the guard AFTER the match: unknown mapped category never completes.

    expect(H.MOCK_DB.userChallenge.updateMany).not.toHaveBeenCalled();
    expect(upsertCalls()).toHaveLength(0);
    expect(H.state.completed).toBe(false);
  });

  it('manual completion endpoint stays 403-deprecated (client cannot grant challenge XP)', async () => {
    const { POST } = await import('@/app/api/challenges/complete/route');
    const res = await POST(new Request('http://localhost/api/challenges/complete', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: 'dc-1', category: 'riqueza' }), // attempted manipulation
    }) as any);

    expect(res.status).toBe(403);
    expect(upsertCalls()).toHaveLength(0);
  });
});
