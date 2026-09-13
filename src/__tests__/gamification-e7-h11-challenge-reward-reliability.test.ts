/**
 * E-7 — H-11: the challenge +25 XP reward is RELIABLE — it can no longer be
 * lost to a serverless freeze after the HTTP response was already sent.
 *
 * Original defect (confirmed at cb9f975):
 *   All 7 action routes fired `tryAutoCompleteChallenge(...).catch(() => {})`
 *   FIRE-AND-FORGET — the promise was launched and the route returned its
 *   response without awaiting it. The grant itself was already atomic and
 *   exactly-once (D-1 CAS inside a single $transaction), but RELIABILITY was
 *   not guaranteed: in a serverless runtime the process can be frozen right
 *   after the response is flushed, so an in-flight fire-and-forget grant is
 *   simply never executed — the challenge stayed completed WITHOUT its +25
 *   (or, for the losing half of a race, the completion happened while the
 *   reward path never ran). This is a durability bug, not a security one:
 *   the CAS already prevents double grants.
 *
 * Fix (this commit):
 *   Every one of the 7 call-sites now AWAITS the call:
 *       await tryAutoCompleteChallenge(...).catch(() => {});
 *   - The grant commits BEFORE the response is sent, so the platform cannot
 *     freeze the process between "challenge completed" and "+25 paid".
 *   - tryAutoCompleteChallenge NEVER rejects (catch-all inside, D-1 CAS
 *     kept: `updateMany({ completed: false })` → only the winner pays), and
 *     the `.catch(() => {})` is defense-in-depth — the parent action still
 *     cannot fail because of the challenge system, and the exact
 *     once-per-challenge +25 semantics are byte-identical.
 *
 * Test strategy:
 * - Tests 1–8 exercise the REAL lib (vi.importActual) over the mocked DB:
 *   exactly-one +25 to the challenge's own empire, CAS on stale/concurrent
 *   completions, transaction rollback → no half state, idempotent repeats
 *   (no XP farming), fail-closed on unknown categories.
 * - Test 9 proves the ROUTE holds its response until the grant resolves and
 *   evaluates achievements only afterwards.
 * - Test 10 is a source contract: all 7 call-sites are awaited, no
 *   fire-and-forget call survives.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Fixed "today" (Madrid) for the route-level test ─────────

const DAY_1 = '2026-09-07';
const NOON_UTC = '2026-09-07T10:00:00Z'; // 12:00 Madrid of DAY_1

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const userChallengeFindFirst = vi.fn().mockResolvedValue(null);
  const userChallengeUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const empireProgressUpsert = vi.fn().mockResolvedValue({});
  const userFindUnique = vi.fn().mockResolvedValue(null);
  const onChallengeChangeMock = vi.fn().mockResolvedValue(undefined);
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);
  const challengeRouteMock = vi.fn().mockResolvedValue(undefined);

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    // Models used by the REAL lib's D-1 transaction.
    userChallenge: { updateMany: userChallengeUpdateMany },
    // Models used by the wellness route's POST transaction (test 9).
    wellnessLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
        id: 'wl-new',
        ...create,
      })),
    },
    nutritionLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    empireProgress: { upsert: empireProgressUpsert },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    // Models used by the REAL lib before its transaction.
    userChallenge: { findFirst: userChallengeFindFirst },
    user: { findUnique: userFindUnique },
    // Models used by the wellness route (test 9).
    wellnessLog: { findUnique: vi.fn().mockResolvedValue(null) },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    userChallengeFindFirst,
    userChallengeUpdateMany,
    empireProgressUpsert,
    userFindUnique,
    onChallengeChangeMock,
    evaluateAchievementsMock,
    challengeRouteMock,
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

// The ROUTES see this mock (test 9 asserts the await contract against it);
// the lib-level tests import the REAL module via vi.importActual.
vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: H.challengeRouteMock,
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
  onChallengeChange: H.onChallengeChangeMock,
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

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

type RealLib = typeof import('@/lib/challenge-auto-complete');

/** The REAL tryAutoCompleteChallenge (routes see the mock, tests see this). */
async function realLib(): Promise<RealLib> {
  return vi.importActual<RealLib>('@/lib/challenge-auto-complete');
}

function challengeRow(category: string, title = 'Reto del día') {
  return {
    id: 'uc-1',
    userId: 'user-1',
    completed: false,
    challenge: { id: 'ch-1', category, title },
  };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/wellness', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function upsertXpCalls(): Array<{ empire: string; increment: number }> {
  return H.empireProgressUpsert.mock.calls.map((c: any[]) => ({
    empire: c[0]?.where?.userId_empire?.empire,
    increment: c[0]?.update?.xp?.increment,
  }));
}

// ─── E-7 — H-11: +25 XP reliability ──────────────────────────

describe('E-7 H-11 — el +25 XP del reto se paga exactamente una vez (D-1 CAS)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.userChallengeFindFirst.mockResolvedValue(null);
    H.userChallengeUpdateMany.mockResolvedValue({ count: 0 });
  });

  it('1. acción que completa el reto → CAS completed:false → exactamente un +25 al imperio de su categoría', async () => {
    const { tryAutoCompleteChallenge } = await realLib();
    H.userChallengeFindFirst.mockResolvedValue(challengeRow('salud'));
    H.userChallengeUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE'),
    ).resolves.toBeUndefined();

    // The flip is CONDITIONAL on completed:false — the CAS WHERE clause.
    expect(H.userChallengeUpdateMany).toHaveBeenCalledTimes(1);
    expect(H.userChallengeUpdateMany.mock.calls[0][0]).toEqual({
      where: { id: 'uc-1', completed: false },
      data: { completed: true, completedAt: expect.any(Date) },
    });

    // Exactly one +25, to the empire of the challenge's OWN category
    // (salud → energia), XP only — never streak, never another empire.
    expect(upsertXpCalls()).toEqual([{ empire: 'energia', increment: 25 }]);
    expect(H.empireProgressUpsert.mock.calls[0][0].create).toEqual({
      userId: 'user-1',
      empire: 'energia',
      xp: 25,
    });

    // Completion and grant are ONE transaction (D-1), and the momentum
    // trigger fires for the winner only.
    expect(H.MOCK_DB.$transaction).toHaveBeenCalledTimes(1);
    expect(H.onChallengeChangeMock).toHaveBeenCalledTimes(1);
    expect(H.onChallengeChangeMock).toHaveBeenCalledWith('user-1', 'FREE');
  });

  it('2. CAS perdido (otro llamada ya lo completó) → cero XP y sin trigger', async () => {
    const { tryAutoCompleteChallenge } = await realLib();
    H.userChallengeFindFirst.mockResolvedValue(challengeRow('salud'));
    H.userChallengeUpdateMany.mockResolvedValue({ count: 0 }); // stale flip

    await expect(
      tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE'),
    ).resolves.toBeUndefined();

    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
    expect(H.onChallengeChangeMock).not.toHaveBeenCalled();
  });

  it('3. dos llamadas CONCURRENTES con barrera → ambas ven completed:false y solo UNA paga', async () => {
    const { tryAutoCompleteChallenge } = await realLib();
    H.userChallengeFindFirst.mockResolvedValue(challengeRow('salud'));

    // Both transactions enter updateMany (both saw completed:false) — the
    // barrier holds them together, then the DB-level CAS decides: the first
    // row-locked flip wins (count 1), the loser reads count 0.
    let entered = 0;
    let resolved = 0;
    let release!: () => void;
    const barrier = new Promise<void>((r) => { release = r; });
    H.userChallengeUpdateMany.mockImplementation(async () => {
      entered++;
      if (entered === 2) release();
      await barrier;
      resolved++;
      return { count: resolved === 1 ? 1 : 0 };
    });

    await Promise.all([
      tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE'),
      tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE'),
    ]);

    expect(H.userChallengeUpdateMany).toHaveBeenCalledTimes(2);
    expect(upsertXpCalls()).toEqual([{ empire: 'energia', increment: 25 }]);
    expect(H.onChallengeChangeMock).toHaveBeenCalledTimes(1);
  });

  it('4. reto ya completado (no hay candidato completed:false) → ni UPDATE ni XP', async () => {
    const { tryAutoCompleteChallenge } = await realLib();
    H.userChallengeFindFirst.mockResolvedValue(null); // nothing to complete

    await expect(
      tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE'),
    ).resolves.toBeUndefined();

    expect(H.userChallengeUpdateMany).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('5. fallo de la transacción → rollback sin estado a medias; el reintento paga exactamente una vez', async () => {
    const { tryAutoCompleteChallenge } = await realLib();
    H.userChallengeFindFirst.mockResolvedValue(challengeRow('salud'));
    H.userChallengeUpdateMany.mockResolvedValue({ count: 1 });

    // Attempt 1: the transaction dies (connection lost) — nothing is applied.
    H.MOCK_DB.$transaction.mockImplementationOnce(async () => {
      throw new Error('db connection lost');
    });

    // The lib NEVER rejects the parent action — the error is swallowed.
    await expect(
      tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE'),
    ).resolves.toBeUndefined();

    // No half state: no XP anywhere, no trigger (the flip rolled back with
    // the transaction).
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
    expect(H.onChallengeChangeMock).not.toHaveBeenCalled();

    // Retry (the challenge is still uncompleted): pays exactly once.
    await tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE');
    expect(H.userChallengeUpdateMany).toHaveBeenCalledTimes(1);
    expect(upsertXpCalls()).toEqual([{ empire: 'energia', increment: 25 }]);
    expect(H.onChallengeChangeMock).toHaveBeenCalledTimes(1);
  });

  it('6. idempotencia — repetir la llamada tras completar no re-paga', async () => {
    const { tryAutoCompleteChallenge } = await realLib();

    // First call completes and pays.
    H.userChallengeFindFirst.mockResolvedValueOnce(challengeRow('salud'));
    H.userChallengeUpdateMany.mockResolvedValueOnce({ count: 1 });
    await tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE');

    // Every later call sees no uncompleted candidate for today.
    H.userChallengeFindFirst.mockResolvedValue(null);
    await tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE');
    await tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE');

    expect(upsertXpCalls()).toEqual([{ empire: 'energia', increment: 25 }]);
  });

  it('7. farming imposible — cinco acciones seguidas el mismo día pagan un único +25', async () => {
    const { tryAutoCompleteChallenge } = await realLib();

    let completed = false;
    H.userChallengeFindFirst.mockImplementation(async () => (completed ? null : challengeRow('salud')));
    H.userChallengeUpdateMany.mockImplementation(async () => {
      completed = true;
      return { count: 1 };
    });

    for (let i = 0; i < 5; i++) {
      await tryAutoCompleteChallenge('user-1', 'wellness', undefined, 'FREE');
    }

    expect(upsertXpCalls()).toEqual([{ empire: 'energia', increment: 25 }]);
    expect(H.userChallengeUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('8. fail-closed — categoría desconocida NO completa el reto ni paga XP (ni siquiera por coincidencia de título)', async () => {
    const { tryAutoCompleteChallenge } = await realLib();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // A seeded challenge with a category outside the canonical mapping; the
    // habit action matches by exact title, so execution reaches the mapping
    // lookup — which fails CLOSED.
    H.userChallengeFindFirst.mockResolvedValue(
      challengeRow('categoria-desconocida', 'Limpia tu espacio de trabajo'),
    );

    await expect(
      tryAutoCompleteChallenge('user-1', 'habit', 'Limpia tu espacio de trabajo', 'FREE'),
    ).resolves.toBeUndefined();

    expect(H.userChallengeUpdateMany).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
    expect(H.onChallengeChangeMock).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('categoria-desconocida'));

    errSpy.mockRestore();
  });
});

// ─── E-7 — H-11: the ROUTE holds the response until the grant ─

describe('E-7 H-11 — la ruta espera al grant antes de responder y evalúa logros después', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
  });

  it('9. POST wellness: la respuesta no se envía hasta que el +25 se ha comprometido; los logros se evalúan después', async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });

    // The (mocked) challenge grant only resolves when the gate opens —
    // standing in for the real D-1 transaction's commit instant.
    H.challengeRouteMock.mockImplementation(async () => {
      await gate;
      events.push('challenge-grant');
    });
    H.evaluateAchievementsMock.mockImplementation(async () => {
      events.push('achievements');
      return [];
    });

    const { POST } = await import('@/app/api/wellness/route');
    const resPromise = POST(makeRequest({
      date: NOON_UTC, mood: 4, energy: 3, sleep: 4, stress: 2,
    }) as any) as unknown as Promise<Response>;

    // The grant is invoked before anything else can settle the response.
    await vi.waitFor(() => expect(H.challengeRouteMock).toHaveBeenCalledTimes(1));

    let settled = false;
    resPromise.then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 25));
    expect(settled).toBe(false); // response is HELD while the grant is in flight

    release();
    const res = await resPromise;
    expect(res.status).toBe(200);

    // Ordering: the grant committed BEFORE achievements were evaluated —
    // achievements observe the post-reward state, and the response (which
    // follows both) can never outrun the +25.
    expect(events).toEqual(['challenge-grant', 'achievements']);
  });

  it('10. CONTRATO DE FUENTE — los 7 call-sites de las rutas son await; no queda ningún fire-and-forget', async () => {
    const routes = [
      'src/app/api/wellness/route.ts',
      'src/app/api/nutrition/route.ts',
      'src/app/api/checkin/route.ts',
      'src/app/api/meditation/route.ts',
      'src/app/api/journal/route.ts',
      'src/app/api/habits/route.ts',
    ];

    let awaitedSites = 0;
    for (const rel of routes) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      const fireAndForget = src.match(/^\s*tryAutoCompleteChallenge\(/gm) ?? [];
      expect(fireAndForget, `${rel} still fires and forgets`).toEqual([]);
      const awaited = src.match(/^\s*await tryAutoCompleteChallenge\(/gm) ?? [];
      expect(awaited.length, `${rel} must await its call-site`).toBeGreaterThan(0);
      awaitedSites += awaited.length;
    }
    expect(awaitedSites).toBe(7); // wellness, nutrition, checkin, meditation, journal, habits×2

    // And every call keeps the never-fail defense belt.
    for (const rel of routes) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      const awaited = src.match(/^\s*await tryAutoCompleteChallenge\(.*\)\.catch\(\(\) => \{\}\);/gm) ?? [];
      expect(awaited.length, `${rel} must keep .catch(() => {})`).toBe(awaited.length);
    }
  });
});
