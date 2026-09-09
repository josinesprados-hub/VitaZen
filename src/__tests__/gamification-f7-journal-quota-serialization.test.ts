/**
 * F-7 — Journal daily quota serialization (closes N-1, the only functional
 * XP-integrity finding of the Fase 14 final audit at 29d1e1a).
 *
 * Original defect (N-1, TOCTOU):
 *   src/app/api/journal/route.ts (POST) computed the Madrid day window,
 *   ran `journalEntry.count` BEFORE opening the transaction, and only then
 *   acquired the 'user|crecimiento' advisory lock inside it. A burst of N
 *   concurrent POSTs could all observe count < 5 pre-lock; the lock then
 *   serialized the creates, but every request had already been approved, so
 *   more than 5 entries could be created and each paid +20 XP (up to +200 XP
 *   observed in a 10-request burst vs the intended +100/day cap).
 *
 * Fix (this commit): the quota decision moved INSIDE the transaction, after
 * the advisory lock:
 *     BEGIN → advisory lock → COUNT → quota check → CREATE/XP → COMMIT
 * Window semantics are untouched (F-3 intact: canonical
 * madridDayBoundaries(todayKey)); XP is untouched (+20 per valid entry,
 * max 5/day); DELETE semantics are untouched (same lock, atomic clamped
 * −20 revert, no quota logic — the revert mechanism was hardened to the
 * single atomic F-5B statement by N-2).
 *
 * Test strategy (controlled concurrency, project pattern from f5a/f5b):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   fire-and-forget side effects; getTodayDateKey is mocked (mutable) at
 *   BOTH specifier paths; every Madrid conversion stays REAL.
 * - A shared ledger models the committed state (entries today + XP awarded).
 *   db.$transaction serializes its callbacks through a promise queue —
 *   exactly what the pg_advisory_xact_lock guarantees in production — and
 *   the transaction mocks read/write the ledger. Firing N POSTs with
 *   Promise.all is therefore fully deterministic: no sleeps, no timers, no
 *   performance-dependent races. The outcome is decided by the ORDER of the
 *   operations inside the transaction (lock → count → create), which the
 *   event trace asserts verbatim.
 * - A pre-transaction `db.journalEntry.count` mock pushes 'DB-COUNT' into
 *   the same trace: any regression back to a pre-lock quota check makes the
 *   tests fail.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMadridDateKey, madridDayBoundaries } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_1 = '2026-09-07'; // ordinary 24-hour day (CEST)
const DAY_SPRING = '2026-03-29'; // 23-hour day in Europe/Madrid
const DAY_AUTUMN = '2026-10-25'; // 25-hour day in Europe/Madrid

// Madrid instants under test (UTC encodings):
//   23:30 Madrid on 2026-10-25 = 22:30Z (CET, UTC+1, after the autumn shift)
const AUTUMN_LAST_HOUR = '2026-10-25T22:30:00Z';
//   00:00 Madrid on 2026-10-26 = 23:00Z on 2026-10-25 — the TRUE end of day 25
const AUTUMN_TRUE_END_UTC = '2026-10-25T23:00:00.000Z';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = {
    todayKey: '2026-09-07',
    // Shared ledger modelling the COMMITTED state for today (Madrid):
    entries: 0, // journal entries created today
    xpAwarded: 0, // XP awarded to crecimiento by journal POSTs today
    seq: 0,
  };

  // Ordered event trace across ALL transactions of the test.
  const events: string[] = [];

  // Raw lock statements captured verbatim (SQL text + interpolated params).
  const lockCalls: Array<{ sql: string; params: unknown[] }> = [];

  const MOCK_TX = {
    $executeRaw: vi.fn(async (...args: unknown[]) => {
      const strings = args[0] as unknown[];
      const sql = strings.join('');
      // Capture every raw statement verbatim (locks + the N-2 atomic revert).
      lockCalls.push({ sql, params: args.slice(1) });
      if (sql.includes('pg_advisory_xact_lock')) {
        events.push('lock');
      } else if (sql.includes('GREATEST(0, "xp" - 20)')) {
        // N-2: the DELETE revert is an atomic clamped statement — replay its
        // exact effect on the ledger (F-5B architecture).
        events.push('xp-revert');
        state.xpAwarded = Math.max(0, state.xpAwarded - 20);
      } else {
        events.push('raw');
      }
      return 1;
    }),
    journalEntry: {
      // F-7: the quota count runs INSIDE the transaction, AFTER the lock.
      count: vi.fn(async () => {
        events.push('count');
        return state.entries;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push('create');
        state.entries += 1;
        return { id: `je-${++state.seq}`, ...data };
      }),
      delete: vi.fn(async () => {
        events.push('delete');
        state.entries = Math.max(0, state.entries - 1);
        return {};
      }),
    },
    empireProgress: {
      upsert: vi.fn(async (args: { update: { xp?: { increment?: number } } }) => {
        events.push('xp');
        state.xpAwarded += args.update?.xp?.increment ?? 0;
        return {};
      }),
      findUnique: vi.fn(async () => ({ xp: state.xpAwarded })),
      // Journal DELETE keeps its (unchanged) absolute clamped write.
      update: vi.fn(async (args: { data: { xp: number } }) => {
        events.push('xp-revert');
        state.xpAwarded = args.data.xp;
        return {};
      }),
    },
  };

  // Serialize transaction bodies through a promise queue — the mock-level
  // equivalent of pg_advisory_xact_lock: every transaction runs to completion
  // before the next one starts, so each count observes prior creates.
  const txQueue = { chain: Promise.resolve() as Promise<unknown> };

  const MOCK_DB = {
    $transaction: vi.fn((fn: (tx: typeof MOCK_TX) => unknown) => {
      txQueue.chain = txQueue.chain.then(() => fn(MOCK_TX));
      return txQueue.chain;
    }),
    journalEntry: {
      // Pre-transaction quota count is the N-1 bug: if POST ever consults it,
      // 'DB-COUNT' appears in the trace and the structural tests fail.
      count: vi.fn(async () => {
        events.push('DB-COUNT');
        return state.entries;
      }),
      // DELETE ownership lookup (widened type so tests can return an owned row).
      findUnique: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);

  return {
    state,
    events,
    lockCalls,
    txQueue,
    MOCK_DB,
    MOCK_TX,
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
  onJournalChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

// Mock ONLY "today" (mutable so tests can pick the DST anchor days);
// keep the REAL Madrid conversion utilities (Intl-backed, DST-exact).
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

function makeRequest(method: 'POST' | 'DELETE', body: unknown): Request {
  return new Request('http://localhost/api/journal', {
    method,
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function postEntry(): Promise<Response> {
  const { POST } = await import('@/app/api/journal/route');
  return POST(makeRequest('POST', { title: 'Entrada de prueba' }) as any) as unknown as Response;
}

async function deleteEntry(entryId = 'je-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/journal/route');
  return DELETE(makeRequest('DELETE', { entryId }) as any) as unknown as Response;
}

/** N concurrent POSTs, resolved by the serialized transaction queue. */
async function runBurst(n: number): Promise<Response[]> {
  return (await Promise.all(Array.from({ length: n }, () => postEntry()))) as Response[];
}

/** Split the global event trace into per-transaction blocks ('lock'-led). */
function txBlocks(): string[][] {
  const blocks: string[][] = [];
  for (const e of H.events) {
    if (e === 'lock') blocks.push(['lock']);
    else if (blocks.length === 0) blocks.push([e]);
    else blocks[blocks.length - 1].push(e);
  }
  return blocks;
}

function eventsInclude(evt: string): boolean {
  return H.events.includes(evt);
}

interface CapturedCountArg {
  where: { userId: string; createdAt: { gte: Date; lt: Date } };
}

/** The quota window of the LAST in-transaction count, as ISO strings + span. */
function capturedWindow(): { gte: string; lt: string; spanHours: number } {
  const calls = H.MOCK_TX.journalEntry.count.mock.calls as unknown as [CapturedCountArg][];
  expect(calls.length).toBeGreaterThan(0);
  const { where } = calls[calls.length - 1][0];
  const gte = where.createdAt.gte.toISOString();
  const lt = where.createdAt.lt.toISOString();
  const spanHours = (where.createdAt.lt.getTime() - where.createdAt.gte.getTime()) / 3_600_000;
  return { gte, lt, spanHours };
}

function postLockCalls(): Array<{ sql: string; params: unknown[] }> {
  return H.lockCalls.filter((c) => c.sql.includes('pg_advisory_xact_lock'));
}

// ─── F-7 — order structural: LOCK → COUNT → cuota → CREATE/XP ──

describe('F-7 — la decisión de cuota ocurre DENTRO de la transacción y DESPUÉS del lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.state.entries = 0;
    H.state.xpAwarded = 0;
    H.state.seq = 0;
    H.events.length = 0;
    H.lockCalls.length = 0;
    H.txQueue.chain = Promise.resolve();
    H.MOCK_DB.journalEntry.findUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('1. petición aceptada: traza exacta [lock, count, create, xp] — sin ningún DB-COUNT previo', async () => {
    const res = await postEntry();
    expect(res.status).toBe(200);

    expect(H.events).toEqual(['lock', 'count', 'create', 'xp']);
    // The advisory lock is the FIRST statement of the transaction.
    const locks = postLockCalls();
    expect(locks.length).toBe(1);
    expect(locks[0].sql).toContain("'|crecimiento'");
    expect(locks[0].params).toEqual(['user-1']);
    // N-1 regression guard: a pre-transaction count must never run.
    expect(eventsInclude('DB-COUNT')).toBe(false);
  });

  it('2. petición rechazada por cuota: traza exacta [lock, count] — sin create, sin XP y sin efectos laterales', async () => {
    H.state.entries = 5;
    H.state.xpAwarded = 100;

    const res = await postEntry();
    expect(res.status).toBe(429);

    expect(H.events).toEqual(['lock', 'count']);
    expect(H.state.entries).toBe(5); // no entry created
    expect(H.state.xpAwarded).toBe(100); // no XP awarded
    expect(H.MOCK_TX.journalEntry.create).not.toHaveBeenCalled();
    expect(H.MOCK_TX.empireProgress.upsert).not.toHaveBeenCalled();

    // A rejected request must not trigger any gamification side effect.
    const { evaluateAchievements } = await import('@/lib/achievements');
    const { onJournalChange } = await import('@/lib/widgets/triggers');
    const { tryAutoCompleteChallenge } = await import('@/lib/challenge-auto-complete');
    expect(evaluateAchievements).not.toHaveBeenCalled();
    expect(onJournalChange).not.toHaveBeenCalled();
    expect(tryAutoCompleteChallenge).not.toHaveBeenCalled();
  });
});

// ─── F-7 — casos de concurrencia A/B/C (ráfagas deterministas) ──

describe('F-7 — ráfagas concurrentes (10 POST en Promise.all, cola serializada)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.state.entries = 0;
    H.state.xpAwarded = 0;
    H.state.seq = 0;
    H.events.length = 0;
    H.lockCalls.length = 0;
    H.txQueue.chain = Promise.resolve();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('CASO A — ráfaga desde cero: exactamente 5 creadas, 5×200, 5×429, +100 XP (nunca +120…+200)', async () => {
    const responses = await runBurst(10);

    const accepted = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status === 429);
    expect(accepted.length).toBe(5);
    expect(rejected.length).toBe(5);
    expect(H.state.entries).toBe(5);

    // Each accepted request paid exactly +20 under its own serialized count.
    expect(H.state.xpAwarded).toBe(100);
    expect(H.MOCK_TX.empireProgress.upsert).toHaveBeenCalledTimes(5);
    for (const call of H.MOCK_TX.empireProgress.upsert.mock.calls as any[][]) {
      expect(call[0].update.xp).toEqual({ increment: 20 });
    }

    // Every transaction: lock first, then count; creates only after a <5 count.
    const blocks = txBlocks();
    expect(blocks.length).toBe(10);
    for (const b of blocks) expect(b[0]).toBe('lock');
    expect(blocks.filter((b) => b.join(',') === 'lock,count,create,xp').length).toBe(5);
    expect(blocks.filter((b) => b.join(',') === 'lock,count').length).toBe(5);
    expect(eventsInclude('DB-COUNT')).toBe(false);
  });

  it('CASO B — ya existen 4: exactamente 1 entrada nueva, +20 XP, las otras 9 reciben 429', async () => {
    H.state.entries = 4;
    H.state.xpAwarded = 80;

    const responses = await runBurst(10);

    const accepted = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status === 429);
    expect(accepted.length).toBe(1);
    expect(rejected.length).toBe(9);
    expect(H.state.entries).toBe(5);
    expect(H.state.xpAwarded).toBe(100); // exactly one +20 over the pre-existing 80
    expect(eventsInclude('DB-COUNT')).toBe(false);
  });

  it('CASO C — ya existen 5: 0 entradas nuevas, 0 XP adicional, las 10 reciben 429', async () => {
    H.state.entries = 5;
    H.state.xpAwarded = 100;

    const responses = await runBurst(10);

    expect(responses.every((r) => r.status === 429)).toBe(true);
    expect(H.state.entries).toBe(5);
    expect(H.state.xpAwarded).toBe(100);
    expect(H.MOCK_TX.journalEntry.create).not.toHaveBeenCalled();
    expect(H.MOCK_TX.empireProgress.upsert).not.toHaveBeenCalled();
    expect(eventsInclude('DB-COUNT')).toBe(false);
  });
});

// ─── F-7 — CASO D: POST/POST y POST/DELETE bajo 'user|crecimiento' ──

describe('F-7 — el lock user|crecimiento sigue serializando POST↔POST y POST↔DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.state.entries = 0;
    H.state.xpAwarded = 0;
    H.state.seq = 0;
    H.events.length = 0;
    H.lockCalls.length = 0;
    H.txQueue.chain = Promise.resolve();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('1. POST y DELETE toman exactamente el MISMO advisory lock (mismo SQL y mismos parámetros)', async () => {
    H.MOCK_DB.journalEntry.findUnique.mockResolvedValue({ id: 'je-1', userId: 'user-1' });
    H.state.entries = 1;
    H.state.xpAwarded = 20;

    const postRes = await postEntry();
    const delRes = await deleteEntry('je-1');
    expect(postRes.status).toBe(200);
    expect(delRes.status).toBe(200);

    const locks = postLockCalls();
    expect(locks.length).toBe(2);
    expect(locks[0].sql).toBe(locks[1].sql);
    expect(locks[0].params).toEqual(locks[1].params);
    expect(locks[0].sql).toContain("md5(");
    expect(locks[0].sql).toContain("'|crecimiento'");
    expect(locks[0].params).toEqual(['user-1']);
  });

  it('2. DELETE libera una plaza y un POST posterior la reutiliza — todo serializado por el mismo lock', async () => {
    // Day full: 5 entries, 100 XP.
    H.state.entries = 5;
    H.state.xpAwarded = 100;

    // A 6th POST is rejected.
    const full = await postEntry();
    expect(full.status).toBe(429);

    // DELETE one entry (ownership ok) → slot freed, XP reverted (−20, clamp).
    H.MOCK_DB.journalEntry.findUnique.mockResolvedValue({ id: 'je-1', userId: 'user-1' });
    const delRes = await deleteEntry('je-1');
    expect(delRes.status).toBe(200);
    expect(H.state.entries).toBe(4);
    expect(H.state.xpAwarded).toBe(80);

    // DELETE block: lock → delete → xp-revert. NO quota count added to DELETE.
    const blocks = txBlocks();
    expect(blocks[blocks.length - 1]).toEqual(['lock', 'delete', 'xp-revert']);

    // A new POST now fits within the quota: accepted, +20, back to 5/100.
    const res = await postEntry();
    expect(res.status).toBe(200);
    expect(H.state.entries).toBe(5);
    expect(H.state.xpAwarded).toBe(100);
  });

  it('3. la semántica del DELETE no cambia: revert atómico GREATEST(0, xp - 20) sobre crecimiento, sin count de cuota y sin RMW', async () => {
    H.state.entries = 3;
    H.state.xpAwarded = 60;
    H.MOCK_DB.journalEntry.findUnique.mockResolvedValue({ id: 'je-2', userId: 'user-1' });

    const res = await deleteEntry('je-2');
    expect(res.status).toBe(200);

    // N-2: the revert is ONE atomic clamped statement on the crecimiento row
    // (same architecture as the meditation/finance DELETE reverts) — no
    // read-modify-write via empireProgress.update.
    const reverts = H.lockCalls.filter((c) => c.sql.includes('GREATEST(0, "xp" - 20)'));
    expect(reverts.length).toBe(1);
    expect(reverts[0].sql).toContain('"EmpireProgress"');
    expect(reverts[0].sql).toContain("'crecimiento'");
    expect(reverts[0].params).toEqual(['user-1']);
    expect(H.MOCK_TX.empireProgress.update).not.toHaveBeenCalled();
    expect(H.state.xpAwarded).toBe(40); // 60 − 20, replayed with the SQL clamp
    expect(H.state.entries).toBe(2);

    // DELETE never consults the quota (no count in its transaction).
    expect(H.events).not.toContain('count');
    expect(eventsInclude('DB-COUNT')).toBe(false);
  });
});

// ─── F-7 — escalera XP (§5) ──────────────────────────────────

describe('F-7 — escalera XP: 1→20 … 5→100, sexta/séptima/ráfaga → +0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.state.entries = 0;
    H.state.xpAwarded = 0;
    H.state.seq = 0;
    H.events.length = 0;
    H.lockCalls.length = 0;
    H.txQueue.chain = Promise.resolve();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('cada entrada aceptada paga +20 sobre el estado serializado; desde la sexta todo es 429 y +0', async () => {
    for (let n = 1; n <= 5; n++) {
      const res = await postEntry();
      expect(res.status).toBe(200);
      expect(H.state.xpAwarded).toBe(20 * n);
      expect(H.state.entries).toBe(n);
    }

    // 6th and 7th: rejected, no create, no XP.
    for (let n = 6; n <= 7; n++) {
      const res = await postEntry();
      expect(res.status).toBe(429);
      expect(H.state.xpAwarded).toBe(100);
      expect(H.state.entries).toBe(5);
    }

    // Any later burst: every request 429, +0 XP.
    const responses = await runBurst(5);
    expect(responses.every((r) => r.status === 429)).toBe(true);
    expect(H.state.xpAwarded).toBe(100);
    expect(H.state.entries).toBe(5);
  });
});

// ─── F-7 — DST (§10): primavera 23h, otoño 25h, medianoche ────

describe('F-7 — DST: la cuota sigue siendo el día natural Europe/Madrid (F-3 intacto)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    H.state.entries = 0;
    H.state.xpAwarded = 0;
    H.state.seq = 0;
    H.events.length = 0;
    H.lockCalls.length = 0;
    H.txQueue.chain = Promise.resolve();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.evaluateAchievementsMock.mockResolvedValue([]);
  });

  it('primavera 2026-03-29 (23 h): ventana exacta de 23h, 5 entradas permitidas, sexta rechazada', async () => {
    H.state.todayKey = DAY_SPRING;

    const responses = await runBurst(6);
    const accepted = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status === 429);
    expect(accepted.length).toBe(5);
    expect(rejected.length).toBe(1);
    expect(H.state.entries).toBe(5);
    expect(H.state.xpAwarded).toBe(100);

    const w = capturedWindow();
    expect(w.gte).toBe('2026-03-28T23:00:00.000Z');
    expect(w.lt).toBe('2026-03-29T22:00:00.000Z');
    expect(w.spanHours).toBe(23);
  });

  it('otoño 2026-10-25 (25 h): la última hora del 25 sigue contando, 5 máximo, sexta rechazada', async () => {
    H.state.todayKey = DAY_AUTUMN;

    const responses = await runBurst(6);
    const accepted = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status === 429);
    expect(accepted.length).toBe(5);
    expect(rejected.length).toBe(1);
    expect(H.state.entries).toBe(5);
    expect(H.state.xpAwarded).toBe(100);

    // The canonical window spans the full 25-hour natural day.
    const w = capturedWindow();
    expect(w.gte).toBe('2026-10-24T22:00:00.000Z');
    expect(w.lt).toBe(AUTUMN_TRUE_END_UTC);
    expect(w.spanHours).toBe(25);

    // An entry written in the FINAL hour of day 25 (23:30 Madrid = 22:30Z)
    // falls inside the deciding window — it still counts for day 25's quota.
    const t = new Date(AUTUMN_LAST_HOUR);
    expect(getMadridDateKey(t)).toBe(DAY_AUTUMN);
    expect(t.getTime()).toBeGreaterThanOrEqual(new Date(w.gte).getTime());
    expect(t.getTime()).toBeLessThan(new Date(w.lt).getTime());
  });

  it('medianoche: 23:59 Madrid del 25 es día 25; 00:00 Madrid del 26 abre una cuota nueva que empieza exactamente al cerrarse el 25', async () => {
    // 2026-10-25 23:59 Madrid (22:59Z) is still day 25 (REAL Intl conversion).
    expect(getMadridDateKey(new Date('2026-10-25T22:59:00Z'))).toBe(DAY_AUTUMN);
    // 2026-10-26 00:00 Madrid = 2026-10-25T23:00Z is already day 26.
    expect(getMadridDateKey(new Date(AUTUMN_TRUE_END_UTC))).toBe('2026-10-26');

    // Day 25 exhausted → every POST is rejected even in its last minute.
    H.state.todayKey = DAY_AUTUMN;
    H.state.entries = 5;
    H.state.xpAwarded = 100;
    const res25 = await postEntry();
    expect(res25.status).toBe(429);

    // 00:00 Madrid of day 26: fresh quota; the new window starts at the exact
    // instant day 25 closed (no gap, no overlap) — each day owns its quota.
    H.state.todayKey = '2026-10-26';
    H.state.entries = 0;
    const res26 = await postEntry();
    expect(res26.status).toBe(200);
    expect(H.state.entries).toBe(1);
    expect(H.state.xpAwarded).toBe(120); // 100 (day 25) + 20 (day 26)

    const w = capturedWindow();
    expect(w.gte).toBe(AUTUMN_TRUE_END_UTC);
    expect(w.lt).toBe('2026-10-26T23:00:00.000Z');
    expect(w.spanHours).toBe(24);

    // Sanity: the canonical boundaries of both days meet at the same instant.
    const day25 = madridDayBoundaries(DAY_AUTUMN);
    const day26 = madridDayBoundaries('2026-10-26');
    expect(day25.end.toISOString()).toBe(AUTUMN_TRUE_END_UTC);
    expect(day26.start.toISOString()).toBe(AUTUMN_TRUE_END_UTC);
  });
});
