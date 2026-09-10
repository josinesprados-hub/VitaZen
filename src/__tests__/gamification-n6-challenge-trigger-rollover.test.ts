/**
 * N-6 — Challenge widget-trigger wiring + Madrid day rollover + canonical
 * challenge→empire mapping.
 *
 * Three independent guarantees, all deterministic (state-machine DB mock,
 * frozen clock / fake timers — no sleeps, no real intervals):
 *
 * A) onChallengeChange is WIRED (it existed dead since the widgets layer
 *    was introduced: defined in triggers.ts, exported by the barrel, and
 *    called by NOBODY — the only unwired momentum dependency). Challenge
 *    completion must invalidate the momentum snapshot exactly when the
 *    award happens (and only then), without ever breaking the parent
 *    action, and must carry the user's plan (explicit arg → fallback
 *    fetch → 'FREE').
 *
 * B) watchMadridDay fires exactly at the next REAL Madrid midnight
 *    (computed via startOfNextDayMadrid — never now+24h), across both DST
 *    transitions (23h spring / 25h autumn days), re-checks the day key on
 *    demand (tab resume), does not fire spuriously, and survives listener
 *    errors and stop().
 *
 * C) challenge-empire.ts is the single canonical mapping consumed by both
 *    the server reward path (re-export) and the client challenge card,
 *    fail-closed for unknown categories, with labels for all 5 empires.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ════════════════════════════════════════════════════════════════
// A) onChallengeChange wiring
// ════════════════════════════════════════════════════════════════

const H = vi.hoisted(() => {
  const state = {
    completed: false,
    category: 'salud',
  };

  const findFirst = vi.fn();
  const updateMany = vi.fn();
  const empireUpsert = vi.fn();
  const userFindUnique = vi.fn();
  const onChallengeChange = vi.fn();

  const MOCK_DB = {
    userChallenge: { findFirst, updateMany },
    empireProgress: { upsert: empireUpsert },
    user: { findUnique: userFindUnique },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(MOCK_DB),
  };

  function makeUserChallenge() {
    return {
      id: 'uc-1',
      userId: 'user-1',
      challengeId: 'dc-1',
      completed: state.completed,
      completedAt: null,
      date: new Date('2026-09-10T00:00:00.000Z'),
      challenge: {
        id: 'dc-1',
        category: state.category,
        title: 'Reto de prueba',
        description: 'Descripción del reto',
        difficulty: 'medium',
      },
    };
  }

  function wireDefaults() {
    state.completed = false;
    state.category = 'salud';
    findFirst.mockReset();
    updateMany.mockReset();
    empireUpsert.mockReset();
    userFindUnique.mockReset();
    onChallengeChange.mockReset();

    findFirst.mockImplementation(async () => {
      if (!state.completed) return makeUserChallenge();
      return null;
    });
    updateMany.mockImplementation(async ({ where }: any) => {
      if (where?.completed === false && !state.completed) {
        state.completed = true;
        return { count: 1 };
      }
      return { count: 0 };
    });
    empireUpsert.mockResolvedValue({});
    userFindUnique.mockResolvedValue({ plan: 'FREE' });
  }

  return { state, MOCK_DB, onChallengeChange, wireDefaults, empireUpsert, userFindUnique };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));
vi.mock('@/lib/widgets/triggers', () => ({ onChallengeChange: H.onChallengeChange }));

async function run(action: string, habitName?: string, plan?: string) {
  const { tryAutoCompleteChallenge } = await import('@/lib/challenge-auto-complete');
  return tryAutoCompleteChallenge('user-1', action as any, habitName, plan);
}

function upsertCalls(): Array<{ where: { userId_empire: { empire: string } }; update: any }> {
  return H.MOCK_DB.empireProgress.upsert.mock.calls.map((c: any[]) => c[0]);
}

describe('N-6 A — challenge completion invalidates the momentum widget snapshot', () => {
  beforeEach(() => {
    H.wireDefaults();
  });

  it('CASE T1 — award fires onChallengeChange once, with the plan passed by the route', async () => {
    await run('checkin', undefined, 'PREMIUM');

    // Sanity: the award actually happened (+25 to the challenge's own empire).
    const calls = upsertCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].where.userId_empire.empire).toBe('energia'); // salud → energia
    expect(calls[0].update).toEqual({ xp: { increment: 25 } });

    expect(H.onChallengeChange).toHaveBeenCalledTimes(1);
    expect(H.onChallengeChange).toHaveBeenCalledWith('user-1', 'PREMIUM');
  });

  it('CASE T2 — no award (category/action mismatch) → trigger NOT fired', async () => {
    // salud challenges complete via checkin/meditation/wellness/nutrition,
    // NOT journal.
    await run('journal', undefined, 'PREMIUM');

    expect(upsertCalls()).toHaveLength(0);
    expect(H.onChallengeChange).not.toHaveBeenCalled();
  });

  it('CASE T3 — plan not passed → resolved from db (fallback fetch), still exactly one fire', async () => {
    await run('checkin');

    expect(H.userFindUnique).toHaveBeenCalledTimes(1);
    expect(H.onChallengeChange).toHaveBeenCalledTimes(1);
    expect(H.onChallengeChange).toHaveBeenCalledWith('user-1', 'FREE');
  });

  it('CASE T4 — fallback fetch fails → trigger still fires once with "FREE" (non-blocking)', async () => {
    H.userFindUnique.mockRejectedValue(new Error('db down'));

    await expect(run('checkin')).resolves.toBeUndefined();

    expect(H.onChallengeChange).toHaveBeenCalledTimes(1);
    expect(H.onChallengeChange).toHaveBeenCalledWith('user-1', 'FREE');
    // And the award itself was unaffected.
    expect(upsertCalls()).toHaveLength(1);
  });

  it('CASE T5 — trigger throwing synchronously must never break the award path', async () => {
    H.onChallengeChange.mockImplementation(() => {
      throw new Error('listener bug');
    });

    await expect(run('checkin', undefined, 'PREMIUM')).resolves.toBeUndefined();

    // The challenge WAS completed and XP WAS granted before the trigger ran.
    expect(upsertCalls()).toHaveLength(1);
    expect(H.state.completed).toBe(true);
  });

  it('CASE T6 — concurrent double-completion (CAS) fires the trigger exactly once', async () => {
    // Simulate two callers that both passed findFirst with completed:false:
    // only the first updateMany flips the row (count===1 → award).
    const { Promise: P } = global;
    const first = run('checkin', undefined, 'PREMIUM');
    const second = run('checkin', undefined, 'PREMIUM');
    await P.all([first, second]);

    expect(upsertCalls()).toHaveLength(1); // D-1 CAS: exactly one award
    expect(H.onChallengeChange).toHaveBeenCalledTimes(1); // N-6: exactly one invalidation
  });
});

// ════════════════════════════════════════════════════════════════
// B) watchMadridDay — midnight rollover Europe/Madrid
// ════════════════════════════════════════════════════════════════

import { watchMadridDay } from '@/lib/madrid-day-watcher';
import { getTodayDateKey } from '@/lib/dates';

describe('N-6 B — Madrid day rollover fires at the real midnight (DST-exact)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('CASE M1 — no fire before midnight; fires once crossing 00:00 Madrid (CEST: 22:00Z)', async () => {
    // 2026-09-11 21:59:00Z = 23:59 Madrid (CEST, UTC+2).
    vi.setSystemTime(new Date('2026-09-11T21:59:00.000Z'));
    const fired: string[] = [];
    const watcher = watchMadridDay((key) => fired.push(key));

    vi.advanceTimersByTime(59_000); // 21:59:59Z — still the same Madrid day
    expect(fired).toEqual([]);
    expect(getTodayDateKey()).toBe('2026-09-11');

    vi.advanceTimersByTime(2_000); // 22:00:01Z = 00:00:01 Madrid Sep 12
    expect(fired).toEqual(['2026-09-12']);

    watcher.stop();
  });

  it('CASE M2 — the watcher reschedules itself: fires again on the NEXT Madrid midnight', async () => {
    vi.setSystemTime(new Date('2026-09-11T21:59:00.000Z'));
    const fired: string[] = [];
    const watcher = watchMadridDay((key) => fired.push(key));

    vi.advanceTimersByTime(61_000); // cross into Sep 12
    vi.advanceTimersByTime(24 * 3600_000); // a full day later → Sep 13

    expect(fired).toEqual(['2026-09-12', '2026-09-13']);

    watcher.stop();
  });

  it('CASE M3 — DST spring (23h day): timer targets 23:00Z, not 22:00Z and not start+24h', async () => {
    // 2026-03-28 22:30Z = 23:30 Madrid CET (UTC+1). Next Madrid midnight is
    // Mar 29 00:00 CET = 22:30Z + 30 min → 23:00Z. A +24h timer would fire
    // at Mar 29 22:30Z; a CEST candidate would fire at 22:00Z. Neither may
    // win: the Madrid day Mar 28 is still CET.
    vi.setSystemTime(new Date('2026-03-28T22:30:00.000Z'));
    const fired: string[] = [];
    const watcher = watchMadridDay((key) => fired.push(key));

    vi.advanceTimersByTime(29 * 60_000 + 59_000); // 22:59:59Z — not yet midnight Madrid
    expect(fired).toEqual([]);

    vi.advanceTimersByTime(2_000); // 23:00:01Z = 00:00:01 Madrid Mar 29
    expect(fired).toEqual(['2026-03-29']);

    watcher.stop();
  });

  it('CASE M4 — DST autumn (25h day): timer targets 22:00Z, not 23:00Z and not start+24h', async () => {
    // 2026-10-24 21:30Z = 23:30 Madrid CEST (UTC+2). Next Madrid midnight is
    // Oct 25 00:00 CEST = 21:30Z + 30 min → 22:00Z. A +24h timer would fire
    // at Oct 24 21:30Z next day; a CET candidate would fire at 23:00Z.
    vi.setSystemTime(new Date('2026-10-24T21:30:00.000Z'));
    const fired: string[] = [];
    const watcher = watchMadridDay((key) => fired.push(key));

    vi.advanceTimersByTime(29 * 60_000 + 59_000); // 21:59:59Z — still Oct 24 in Madrid
    expect(fired).toEqual([]);

    vi.advanceTimersByTime(2_000); // 22:00:01Z = 00:00:01 Madrid Oct 25
    expect(fired).toEqual(['2026-10-25']);

    watcher.stop();
  });

  it('CASE M5 — checkNow (tab resume) fires only when the Madrid day actually changed', async () => {
    vi.setSystemTime(new Date('2026-09-11T10:00:00.000Z'));
    const fired: string[] = [];
    const watcher = watchMadridDay((key) => fired.push(key));

    watcher.checkNow(); // same day → no fire
    expect(fired).toEqual([]);

    // Two days pass while the tab was backgrounded (no timers advanced).
    vi.setSystemTime(new Date('2026-09-13T09:00:00.000Z'));
    watcher.checkNow();
    expect(fired).toEqual(['2026-09-13']);

    watcher.checkNow(); // no further change → no fire
    expect(fired).toEqual(['2026-09-13']);

    watcher.stop();
  });

  it('CASE M6 — stop() prevents any further firing', async () => {
    vi.setSystemTime(new Date('2026-09-11T21:59:00.000Z'));
    const fired: string[] = [];
    const watcher = watchMadridDay((key) => fired.push(key));
    watcher.stop();

    vi.advanceTimersByTime(48 * 3600_000);
    watcher.checkNow();
    vi.setSystemTime(new Date('2026-09-14T09:00:00.000Z'));
    watcher.checkNow();

    expect(fired).toEqual([]);
  });

  it('CASE M7 — a throwing listener does not kill the watcher', async () => {
    vi.setSystemTime(new Date('2026-09-11T21:59:00.000Z'));
    const fired: string[] = [];
    const watcher = watchMadridDay((key) => {
      fired.push(key);
      throw new Error('listener bug');
    });

    vi.advanceTimersByTime(61_000); // first fire throws...
    vi.advanceTimersByTime(24 * 3600_000); // ...but the next midnight still fires

    expect(fired).toEqual(['2026-09-12', '2026-09-13']);

    watcher.stop();
  });
});

// ════════════════════════════════════════════════════════════════
// C) challenge-empire.ts — single canonical mapping (N-5 parity)
// ════════════════════════════════════════════════════════════════

describe('N-6 C — canonical challenge→empire mapping (server & client share one source)', () => {
  it('CASE X1 — the server re-export and the client module are the SAME object', async () => {
    const client = await import('@/lib/challenge-empire');
    const server = await import('@/lib/challenge-auto-complete');

    expect(Object.is(server.CHALLENGE_CATEGORY_TO_EMPIRE, client.CHALLENGE_CATEGORY_TO_EMPIRE)).toBe(true);
  });

  it('CASE X2 — mapping values are exactly the N-5 canonical ones; unknown → undefined (fail-closed)', async () => {
    const { CHALLENGE_CATEGORY_TO_EMPIRE } = await import('@/lib/challenge-empire');

    expect(CHALLENGE_CATEGORY_TO_EMPIRE).toEqual({
      disciplina: 'disciplina',
      habitos: 'disciplina',
      mentalidad: 'mente',
      productividad: 'crecimiento',
      salud: 'energia',
    });
    // No category maps to riqueza (documented invariant), unknown fail-closed.
    expect(Object.values(CHALLENGE_CATEGORY_TO_EMPIRE)).not.toContain('riqueza');
    expect(CHALLENGE_CATEGORY_TO_EMPIRE['riqueza']).toBeUndefined();
    expect(CHALLENGE_CATEGORY_TO_EMPIRE['desconocido']).toBeUndefined();
  });

  it('CASE X3 — labels cover all five empires so no raw enum value can be rendered', async () => {
    const { EMPIRE_LABELS, CHALLENGE_CATEGORY_TO_EMPIRE } = await import('@/lib/challenge-empire');

    const ALL_EMPIRES = ['disciplina', 'mente', 'energia', 'riqueza', 'crecimiento'];
    for (const empire of ALL_EMPIRES) {
      expect(typeof EMPIRE_LABELS[empire]).toBe('string');
      expect(EMPIRE_LABELS[empire].length).toBeGreaterThan(0);
    }
    // Every mapping TARGET has a label (the card renders exactly this).
    for (const target of new Set(Object.values(CHALLENGE_CATEGORY_TO_EMPIRE))) {
      expect(EMPIRE_LABELS[target]).toBeDefined();
    }
  });
});
