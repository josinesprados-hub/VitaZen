/**
 * N-4 — "EmpireProgress.level" is a dead column: prove the removal is safe.
 *
 * What was removed: the persisted `level` column (Prisma schema +
 * migration 20260910000000_remove_dead_empire_progress_level).
 *
 * Why it is dead (N-4 audit): the column was written ONLY by its column
 * default (no createMany / upsert / update / raw SQL ever set it) and no
 * reader ever consumed it: the user-facing level has always been derived
 * from XP at read time with
 *     level = Math.floor(xp / 100) + 1
 * in GET /api/empire (src/app/api/empire/route.ts), the Mentor context
 * (src/lib/mentor-context.ts) and the achievements engine
 * (src/lib/achievements.ts — hidden_empire_balance). XP is the single
 * source of truth.
 *
 * What these tests guarantee (route-level, REAL logic — no copied formula):
 *   1. Level boundaries through the real GET /api/empire handler using
 *      post-migration row shapes (rows carry NO `level` property):
 *      0 XP → 1, 99 XP → 1, 100 XP → 2, 199 XP → 2, 200 XP → 3.
 *   2. The XP economy is untouched: the response echoes the stored xp
 *      value exactly, and xpToNextLevel/progress stay consistent.
 *   3. The read contract of EmpireProgress does not reference the dropped
 *      column: the route selects exactly { empire, xp, streak }. If a
 *      future change reintroduces a dependency on the removed column this
 *      test fails loudly instead of failing at SQL runtime.
 *   4. The response contract (empire, level, xp, xpToNextLevel, streak,
 *      progress) is unchanged by the cleanup.
 *
 * Not covered here on purpose (already owned by their own suites, which
 * run in the same N-4 regression pass):
 *   - write paths that award XP (G-03/G-04/F-7/N-2/N-3 route tests) —
 *     none of them ever set `level` (audit-verified) and tsc now fails if
 *     a payload referenced the removed field;
 *   - achievements level derivation from XP (G-05 hidden_empire_balance:
 *     mente xp 450 → level 5) — real-logic coverage in gamification-g05.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const MOCK_DB = {
    empireProgress: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    habitLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    meditationSession: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    financeLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    wellnessLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    nutritionLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };

  const getAuthUserBasicMock = vi.fn();

  return { MOCK_DB, getAuthUserBasicMock };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
  getAuthUserBasic: H.getAuthUserBasicMock,
}));

// Everything else stays REAL: withTiming, serverLog, gateEmpireStreak and
// the Madrid date utilities are exercised unmocked (same strategy as G-06).

// ─── Helpers ─────────────────────────────────────────────────

// POST-migration EmpireProgress row shape: exactly the columns the table
// has after 20260910000000_remove_dead_empire_progress_level. Note the
// deliberate ABSENCE of any `level` property — these rows simulate what
// Prisma returns once the column is gone.
function empireRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep-1',
    userId: 'user-1',
    empire: 'disciplina',
    xp: 0,
    streak: 0,
    ...overrides,
  };
}

function makeRequest(): Request {
  return new Request('http://localhost/api/empire', {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

async function getEmpires(): Promise<Record<string, any>> {
  const { GET } = await import('@/app/api/empire/route');
  const res = await GET(makeRequest() as any);
  expect(res.status).toBe(200);
  const data = await res.json();
  return Object.fromEntries(data.empires.map((e: any) => [e.empire, e]));
}

// ─── Tests ───────────────────────────────────────────────────

describe('N-4 — level is derived from XP by the real GET /api/empire (post-migration rows, no `level` column)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1' });
    // No activity → every gated streak is 0; keeps the test orthogonal to G-06.
    H.MOCK_DB.habitLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.meditationSession.findFirst.mockResolvedValue(null);
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_DB.nutritionLog.findFirst.mockResolvedValue(null);
  });

  it('A/B — XP boundaries 0/99/100/199/200 → levels 1/1/2/2/3 through the REAL handler', async () => {
    // One call, five empires — each canonical empire carries one boundary value.
    H.MOCK_DB.empireProgress.findMany.mockResolvedValue([
      empireRow({ id: 'ep-d', empire: 'disciplina', xp: 0 }),   // → level 1
      empireRow({ id: 'ep-m', empire: 'mente', xp: 99 }),       // → level 1
      empireRow({ id: 'ep-r', empire: 'riqueza', xp: 100 }),    // → level 2
      empireRow({ id: 'ep-e', empire: 'energia', xp: 199 }),    // → level 2
      empireRow({ id: 'ep-c', empire: 'crecimiento', xp: 200 }),// → level 3
    ]);

    const byEmpire = await getEmpires();

    expect(byEmpire.disciplina.level).toBe(1); //   0 XP
    expect(byEmpire.mente.level).toBe(1);      //  99 XP — still level 1
    expect(byEmpire.riqueza.level).toBe(2);    // 100 XP — exactly level 2
    expect(byEmpire.energia.level).toBe(2);    // 199 XP — still level 2
    expect(byEmpire.crecimiento.level).toBe(3);// 200 XP — exactly level 3
  });

  it('A — stored XP is echoed intact and xpToNextLevel/progress stay consistent (XP economy untouched)', async () => {
    const XP_VALUES = [
      ['disciplina', 0],
      ['mente', 99],
      ['riqueza', 100],
      ['energia', 199],
      ['crecimiento', 200],
    ] as const;
    H.MOCK_DB.empireProgress.findMany.mockResolvedValue(
      XP_VALUES.map(([empire, xp], i) => empireRow({ id: `ep-${i}`, empire, xp }))
    );

    const byEmpire = await getEmpires();

    for (const [empire, xp] of XP_VALUES) {
      expect(byEmpire[empire].xp).toBe(xp);                                  // no drift
      expect(byEmpire[empire].xpToNextLevel).toBe(100 - (xp % 100));          // 100, 1, 100, 1, 100
      expect(byEmpire[empire].progress).toBe(((xp % 100) / 100) * 100);       // 0, 99, 0, 99, 0
    }
  });

  it('C — read contract: the route selects exactly { empire, xp, streak } from EmpireProgress (never the dropped column)', async () => {
    H.MOCK_DB.empireProgress.findMany.mockResolvedValue([
      empireRow({ empire: 'disciplina', xp: 250, streak: 8 }),
    ]);

    await getEmpires();

    expect(H.MOCK_DB.empireProgress.findMany).toHaveBeenCalledTimes(1);
    const [args] = H.MOCK_DB.empireProgress.findMany.mock.calls[0] as any[];
    expect(args.select).toEqual({ empire: true, xp: true, streak: true });
    expect(Object.keys(args.select)).not.toContain('level');
  });

  it('D — response contract unchanged: exactly { empire, level, xp, xpToNextLevel, streak, progress } per empire', async () => {
    H.MOCK_DB.empireProgress.findMany.mockResolvedValue([
      empireRow({ empire: 'disciplina', xp: 67, streak: 7 }),
    ]);

    const byEmpire = await getEmpires();

    expect(Object.keys(byEmpire.disciplina).sort()).toEqual(
      ['empire', 'level', 'progress', 'streak', 'xp', 'xpToNextLevel']
    );
    expect(byEmpire.disciplina).toEqual({
      empire: 'disciplina',
      level: 1,        // floor(67/100)+1
      xp: 67,
      xpToNextLevel: 33,
      streak: 0,       // no activity → gated to 0 (G-06 semantics, real streaks.ts)
      progress: 67,
    });
  });
});
