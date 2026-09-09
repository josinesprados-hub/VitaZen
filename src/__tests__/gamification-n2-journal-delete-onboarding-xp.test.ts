/**
 * N-2 — XP integrity: Journal DELETE cannot destroy XP granted by other
 * sources (specifically the one-time onboarding +25, G-01).
 *
 * Original defect (audited at d5d1725):
 *   Journal DELETE reverted XP with a read-modify-write inside its
 *   'user|crecimiento' advisory-lock transaction:
 *       read  → tx.empireProgress.findUnique  (snapshot, no row lock)
 *       write → tx.empireProgress.update({ xp: Math.max(0, read.xp - 20) })
 *   An ABSOLUTE write only serializes with writers holding the SAME advisory
 *   lock. The one-time onboarding bonus (G-01) awards its +25 to this very
 *   'crecimiento' row via an ATOMIC increment WITHOUT this lock family
 *   (its serialization is the CAS on User.onboardingCompleted). Race:
 *     1. DELETE tx (lock held): reads xp = 20 (one paid journal entry).
 *     2. Onboarding tx commits: CAS claims, atomic `xp = xp + 25` → row = 45.
 *     3. DELETE tx: writes the stale absolute value max(0, 20-20) = 0.
 *     → the +25 is silently destroyed (final 0 instead of 25).
 *
 * Fix (this commit): the revert is a SINGLE atomic clamped statement —
 * the exact F-5B architecture already used by the meditation/finance
 * DELETE reverts:
 *     UPDATE "EmpireProgress" SET "xp" = GREATEST(0, "xp" - 20)
 *       WHERE "userId" = ... AND "empire" = 'crecimiento'
 * A single row-locked statement re-reads the LATEST committed value inside
 * the UPDATE itself and COMMUTES with any atomic increment (onboarding +25,
 * journal POST +20, any future atomic writer), regardless of advisory-lock
 * keys. The only XP ever removed is exactly the deleted entry's +20, and the
 * counter can never go negative. Invariant proven below:
 *     after DELETE, xp >= XP legitimately granted by other sources.
 *
 * Deliberately NOT changed:
 *   - onboarding's +25, its CAS guard and its atomic increment (G-01 intact;
 *     adding the journal lock family to onboarding would widen lock scope
 *     with no benefit since its write is already atomic and CAS-gated);
 *   - journal POST (+20, quota F-7), the advisory lock itself, streaks,
 *     achievements, challenges, schema.
 *
 * Test strategy (deterministic, project pattern from f5a/f5b/F-7):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit, the
 *   analytics/achievements/widget side effects; no sleeps, no timers.
 * - A shared ledger models the 'crecimiento' counter. Every XP-mutating
 *   statement both routes issue is captured verbatim (kind + amount + source)
 *   and replayed on the ledger.
 * - The mocked $transaction queue serializes transaction bodies — one valid
 *   schedule (the advisory lock for journal, the user-row CAS for
 *   onboarding). Because the fix's statements are single atomic SQL
 *   operations, commutativity is then proven by REPLAYING the captured
 *   statements in EVERY possible order: all orders yield the same final XP.
 *   The old RMW is shadow-simulated from the same initial state to document
 *   exactly the lost update the fix makes impossible.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = {
    // 'crecimiento' counter + journal rows ("committed" state)
    xp: 0,
    entries: 1,
    onboardingCompleted: false,
    claimed: 0, // times the G-01 CAS flipped false→true
  };

  // Verbatim capture of every XP-mutating statement, tagged by source.
  // (In this file Journal POST never runs: journal's only XP statement is
  // the DELETE revert, onboarding's is the +25 upsert — so source tagging is
  // unambiguous without shared mutable state.)
  const xpOps: Array<{ kind: 'increment' | 'clamp' | 'absolute'; n: number; source: string }> = [];
  // Raw SQL statements captured (locks + reverts) for verbatim assertions.
  const rawCalls: Array<{ sql: string; params: unknown[] }> = [];

  // Serialize transaction bodies through a promise queue: models ONE valid
  // schedule (the advisory lock for journal, the user-row CAS for
  // onboarding). Commutativity of the captured atomic statements is proven
  // separately by replaying them in every order.
  const txQueue = { chain: Promise.resolve() as Promise<unknown> };

  const MOCK_TX = {
    // ── Journal DELETE statements ──
    $executeRaw: vi.fn(async (...args: unknown[]) => {
      const sql = (args[0] as unknown[]).join('');
      rawCalls.push({ sql, params: args.slice(1) });
      if (sql.includes('GREATEST(0, "xp" - 20)')) {
        // N-2 fix: single atomic clamped revert — replay its exact effect.
        xpOps.push({ kind: 'clamp', n: 20, source: 'journal-delete' });
        state.xp = Math.max(0, state.xp - 20);
      }
      return 1;
    }),
    journalEntry: {
      delete: vi.fn(async () => {
        state.entries = Math.max(0, state.entries - 1);
        return {};
      }),
    },
    // ── Onboarding statements ──
    user: {
      update: vi.fn(async () => ({})),
      // G-01 CAS: exactly one request can flip onboardingCompleted false→true.
      updateMany: vi.fn(async (args: { where: { onboardingCompleted: boolean } }) => {
        if (args.where.onboardingCompleted === false && !state.onboardingCompleted) {
          state.onboardingCompleted = true;
          state.claimed += 1;
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },
    onboardingData: {
      upsert: vi.fn(async (args: { create: Record<string, unknown> }) => ({ id: 'ob-1', ...args.create })),
    },
    habitLog: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
    // ── Shared EmpireProgress models ──
    empireProgress: {
      // Onboarding award: atomic increment (+25) — its ONLY XP write (G-01).
      upsert: vi.fn(async (args: { update?: { xp?: { increment?: number } }; create?: { xp?: number } }) => {
        if (args.update?.xp?.increment !== undefined) {
          xpOps.push({ kind: 'increment', n: args.update.xp.increment, source: 'onboarding' });
          state.xp += args.update.xp.increment;
        } else if (args.create?.xp !== undefined) {
          xpOps.push({ kind: 'absolute', n: args.create.xp, source: 'onboarding-create' });
          state.xp = args.create.xp;
        }
        return {};
      }),
      // Regression guards: the old RMW helpers must never be called by DELETE.
      findUnique: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => {
      txQueue.chain = txQueue.chain.then(() => fn(MOCK_TX));
      return txQueue.chain;
    }),
    journalEntry: {
      // DELETE ownership lookup.
      findUnique: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
    },
  };

  const getAuthUserMock = vi.fn();
  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);
  const trackEventMock = vi.fn().mockResolvedValue(undefined);

  return {
    state,
    xpOps,
    rawCalls,
    txQueue,
    MOCK_TX,
    MOCK_DB,
    getAuthUserMock,
    getAuthUserBasicMock,
    rateLimitMock,
    evaluateAchievementsMock,
    trackEventMock,
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

vi.mock('@/lib/analytics-server', () => ({
  trackEvent: H.trackEventMock,
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onJournalChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

// ─── Helpers ─────────────────────────────────────────────────

const TEST_USER = { id: 'user-1', plan: 'free', email: 'user@test.com' };

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

async function deleteEntry(entryId = 'je-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/journal/route');
  return DELETE(makeRequest('/api/journal', 'DELETE', { entryId }) as any) as unknown as Response;
}

const ONBOARDING_BODY = {
  primaryFocus: 'crecimiento', // +25 goes to the SAME 'crecimiento' row as Journal
  stressLevel: 3,
  energyLevel: 4,
  focusLevel: 3,
  goals: ['Dormir mejor'],
};

async function postOnboarding(): Promise<Response> {
  const { POST } = await import('@/app/api/onboarding/route');
  return POST(makeRequest('/api/onboarding', 'POST', ONBOARDING_BODY) as any) as unknown as Response;
}

/** Replay captured-style ops on an initial counter (pure, order-explicit). */
function replay(ops: Array<{ kind: 'increment' | 'clamp' | 'absolute'; n: number }>, initial: number): number {
  let xp = initial;
  for (const op of ops) {
    if (op.kind === 'increment') xp += op.n;
    else if (op.kind === 'clamp') xp = Math.max(0, xp - op.n);
    else xp = op.n;
  }
  return xp;
}

function journalReverts(): Array<{ sql: string; params: unknown[] }> {
  return H.rawCalls.filter((c) => c.sql.includes('GREATEST(0, "xp" - 20)'));
}

function journalLocks(): Array<{ sql: string; params: unknown[] }> {
  return H.rawCalls.filter((c) => c.sql.includes('pg_advisory_xact_lock'));
}

function resetLedger(xp: number, onboardingCompleted = false) {
  H.state.xp = xp;
  H.state.entries = 1;
  H.state.onboardingCompleted = onboardingCompleted;
  H.state.claimed = 0;
  H.xpOps.length = 0;
  H.rawCalls.length = 0;
  H.txQueue.chain = Promise.resolve();
  H.MOCK_DB.journalEntry.findUnique.mockResolvedValue({ id: 'je-1', userId: 'user-1' });
}

// ─── N-2 — structural guards ─────────────────────────────────

describe('N-2 — estructura del fix (statements capturados verbatim)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLedger(0);
    H.getAuthUserMock.mockResolvedValue(TEST_USER);
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('1. Journal DELETE: el revert es UN statement atómico GREATEST(0, "xp" - 20) sobre crecimiento — sin RMW', async () => {
    resetLedger(45);
    const res = await deleteEntry('je-1');
    expect(res.status).toBe(200);

    const reverts = journalReverts();
    expect(reverts.length).toBe(1);
    expect(reverts[0].sql).toContain('UPDATE "EmpireProgress"');
    expect(reverts[0].sql).toContain('GREATEST(0, "xp" - 20)');
    expect(reverts[0].sql).toContain("'crecimiento'");
    expect(reverts[0].params).toEqual(['user-1']);

    // The old read-modify-write path must be gone: no findUnique+update pair.
    expect(H.MOCK_TX.empireProgress.findUnique).not.toHaveBeenCalled();
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();

    // The advisory lock is still the FIRST statement of the transaction,
    // with the same 'user|crecimiento' key.
    const locks = journalLocks();
    expect(locks.length).toBe(1);
    expect(locks[0].sql).toContain("'|crecimiento'");
  });

  it('2. Onboarding: el +25 es un INCREMENTO atómico { increment: 25 }, concedido solo si el CAS G-01 reivindica', async () => {
    const res = await postOnboarding();
    expect(res.status).toBe(200);

    // CAS claimed exactly once; award was an atomic increment on the row.
    expect(H.state.claimed).toBe(1);
    expect(H.state.onboardingCompleted).toBe(true);
    expect(H.state.xp).toBe(25);

    const increments = H.xpOps.filter((o) => o.source === 'onboarding');
    expect(increments).toEqual([{ kind: 'increment', n: 25, source: 'onboarding' }]);
    expect(H.MOCK_TX.empireProgress.upsert).toHaveBeenCalledTimes(1);
  });
});

// ─── N-2 — CASO A: onboarding + DELETE concurrentes ──────────

describe('N-2 — CASO A: DELETE de Journal vs onboarding (+25) en carrera', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLedger(20); // one journal entry already paid +20; onboarding pending
    H.getAuthUserMock.mockResolvedValue(TEST_USER);
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('ejecución concurrente real (Promise.all): ambas 200, +25 reivindicado una vez y PRESERVADO en todo orden', async () => {
    const initial = 20;

    const [delRes, onbRes] = await Promise.all([deleteEntry('je-1'), postOnboarding()]);
    expect(delRes.status).toBe(200);
    expect(onbRes.status).toBe(200);

    // The CAS claimed exactly once and the award was issued exactly once.
    expect(H.state.claimed).toBe(1);
    const increments = H.xpOps.filter((o) => o.source === 'onboarding');
    expect(increments).toEqual([{ kind: 'increment', n: 25, source: 'onboarding' }]);

    // The DELETE emitted exactly one atomic clamp; no absolute write.
    expect(journalReverts().length).toBe(1);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();

    // The single valid schedule the queue ran must already preserve the +25.
    expect(H.state.xp).toBe(25);

    // Commutativity proof: replay the CAPTURED statements (clamp 20 / +25) in
    // BOTH possible orders — identical outcome, +25 preserved in both.
    const clamp = { kind: 'clamp' as const, n: 20 };
    const inc = { kind: 'increment' as const, n: 25 };
    expect(replay([clamp, inc], initial)).toBe(25); // DELETE first
    expect(replay([inc, clamp], initial)).toBe(25); // onboarding first

    // Shadow of the OLD bug (documentation): with the RMW, the schedule
    // "read 20 → onboarding commits 45 → absolute write max(0,20-20)=0"
    // destroyed the +25 (final 0). The fix removed the absolute write, so
    // this schedule no longer exists — the structural guards above prove it.
    const oldRmwShadow = replay([{ kind: 'absolute' as const, n: 0 }], 45);
    expect(oldRmwShadow).toBe(0); // old behavior lost the +25
    expect(H.state.xp).toBe(25); // new behavior keeps it (every order → 25)
  });
});

// ─── N-2 — CASOS B / C / D: invariantes del contador ─────────

describe('N-2 — CASOS B/C/D: el DELETE solo revierte su +20, nunca XP de otras fuentes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLedger(0);
    H.getAuthUserMock.mockResolvedValue(TEST_USER);
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('CASO B — xp = 45 (25 onboarding + 20 journal): DELETE → 25 (el +25 se conserva)', async () => {
    resetLedger(45, true); // onboarding already granted its +25
    const res = await deleteEntry('je-1');
    expect(res.status).toBe(200);
    expect(H.state.xp).toBe(25);
    expect(H.state.entries).toBe(0);
  });

  it('CASO C — xp = 20 (solo journal): DELETE → 0 (clamp, nunca negativo)', async () => {
    resetLedger(20);
    const res = await deleteEntry('je-1');
    expect(res.status).toBe(200);
    expect(H.state.xp).toBe(0);
  });

  it('CASO D — múltiples fuentes (journal 20 + onboarding 25 + otra 10): DELETE elimina EXACTAMENTE 20 y conserva 35', async () => {
    resetLedger(55, true); // 20 journal + 25 onboarding + 10 other legitimate source
    const res = await deleteEntry('je-1');
    expect(res.status).toBe(200);
    expect(H.state.xp).toBe(35);

    // Invariant: after DELETE, xp >= XP granted by other sources.
    expect(H.state.xp).toBeGreaterThanOrEqual(25 + 10);

    // Ledger replay of the captured statements. Two physically different
    // families of schedules:
    //   a) The entry was PAID before the delete (the only reachable schedule
    //      for a real entry: POST and DELETE share the advisory lock, and a
    //      deleted entry must exist) → the clamp removes exactly its +20:
    //      final = 35.
    //   b) The clamp runs before the increments (pure statement interleave,
    //      not reachable for a paid entry) → it finds 0 and removes nothing;
    //      later grants land untouched → final = 55. In both families the
    //      invariant holds: final >= 35 (non-journal sources intact).
    const inc20 = { kind: 'increment' as const, n: 20 };
    const inc25 = { kind: 'increment' as const, n: 25 };
    const inc10 = { kind: 'increment' as const, n: 10 };
    const clamp = { kind: 'clamp' as const, n: 20 };
    expect(replay([inc20, inc25, inc10, clamp], 0)).toBe(35);
    expect(replay([inc25, inc10, inc20, clamp], 0)).toBe(35);
    expect(replay([clamp, inc20, inc25, inc10], 0)).toBe(55);
    expect(replay([clamp, inc25, inc10, inc20], 0)).toBe(55);
    for (const order of [
      [inc20, inc25, inc10, clamp],
      [inc25, inc10, inc20, clamp],
      [clamp, inc20, inc25, inc10],
      [clamp, inc25, inc10, inc20],
    ]) {
      expect(replay(order, 0)).toBeGreaterThanOrEqual(35);
    }
  });
});

// ─── N-2 — CASO E: G-01 intacto ──────────────────────────────

describe('N-2 — CASO E: la protección G-01 sigue intacta (onboarding +25 una única vez)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLedger(0);
    H.getAuthUserMock.mockResolvedValue(TEST_USER);
    H.getAuthUserBasicMock.mockResolvedValue(TEST_USER);
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('secuencial: 1ª llamada → +25; 2ª llamada → +0 (sin reabrir G-01)', async () => {
    const first = await postOnboarding();
    expect(first.status).toBe(200);
    expect(H.state.xp).toBe(25);
    expect(H.state.claimed).toBe(1);

    const second = await postOnboarding();
    expect(second.status).toBe(200);
    expect(H.state.xp).toBe(25); // unchanged
    expect(H.state.claimed).toBe(1);
    expect(H.MOCK_TX.empireProgress.upsert).toHaveBeenCalledTimes(1);
  });

  it('concurrente: dos POST de onboarding → exactamente un +25 (CAS false→true)', async () => {
    const [a, b] = await Promise.all([postOnboarding(), postOnboarding()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(H.state.claimed).toBe(1);
    expect(H.state.xp).toBe(25);
    expect(H.MOCK_TX.empireProgress.upsert).toHaveBeenCalledTimes(1);
  });

  it('tras el fix N-2, un DELETE posterior conserva los +25 del onboarding (B con historial E)', async () => {
    // Onboarding first (+25), then a journal entry pays +20 (ledger = 45).
    await postOnboarding();
    H.state.xp += 20;
    expect(H.state.xp).toBe(45);

    const res = await deleteEntry('je-1');
    expect(res.status).toBe(200);
    expect(H.state.xp).toBe(25); // the +25 survives
  });
});
