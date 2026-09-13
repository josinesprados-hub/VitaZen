/**
 * E-7 — H-5: the STORED energia streak cache stays consistent after a
 * DELETE that empties a Madrid day (wellness OR nutrition).
 *
 * Original defect (confirmed at cb9f975):
 *   The DELETE handlers only corrected `EmpireProgress.streak` when the
 *   deleted log belonged to TODAY (Madrid) — `streak = GREATEST(0, streak-1)`.
 *   Deleting a HISTORIC log that emptied its Madrid day left the stored
 *   cache counting a day with no activity. Every later POST then propagated
 *   the inflated base (E-0.1's `streak + 1`), and `gateEmpireStreak` (G-06)
 *   could only mask the drift at READ time while the chain was alive — it
 *   never repairs the stored value.
 *
 * Fix (this commit):
 *   When a DELETE empties the log's Madrid day, the transaction now ALSO:
 *     1. takes the additional advisory lock 'user|energia|recount'
 *        (ALWAYS after the day key — fixed order day → recount, so the
 *        lock graph stays acyclic and deadlock-free);
 *     2. reads the Madrid date keys that still exist across BOTH energia
 *        tables (the same cross-module definition the POST increment uses);
 *     3. recomputes the expected cache with `chainEndingAtLastActivity`
 *        (chain semantics: consecutive days ENDING at the last day with
 *        activity — NOT the read-time today-anchored calcStreakFromKeys);
 *     4. applies the correction as a COMMUTATIVE, CLAMPED delta
 *        `streak = GREATEST(0, streak + delta)` — delta 0 writes nothing,
 *        a relative delta cannot clobber a concurrent POST's atomic
 *        `+1`/`SET 1`, and the cache can never go negative.
 *
 *   XP is untouched by the recount (the F-2 day-empty revert keeps its
 *   semantics), no historic rows are rewritten, no other user is ever
 *   recalculated, and no XP is granted or rolled back by the DELETE beyond
 *   the existing F-2 revert.
 *
 * Test strategy (identical to gamification-f5a/g09-f2):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   side-effect modules; getTodayDateKey is mocked (mutable) at BOTH
 *   specifier paths; every Madrid conversion and the new
 *   `chainEndingAtLastActivity` stay REAL (Europe/Madrid via Intl).
 * - The correction statement is asserted verbatim (single row-locked
 *   `GREATEST(0, "streak" + delta)` UPDATE), so no sleep, timer or real
 *   race is needed; test 7 models the serialized outcome the advisory
 *   locks guarantee with an explicit transaction queue plus a stateful
 *   store, and closes with the repeated-DELETE 404.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMadridDateKey, madridDayBoundaries } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_0 = '2026-09-07'; // today
const DAY_1 = '2026-09-06'; // yesterday
const DAY_2 = '2026-09-05';
const DAY_3 = '2026-09-04';

// Noon-UTC instants (September = CEST, UTC+2 → 12:00 Madrid of that day).
const noon = (dayKey: string) => `${dayKey}T10:00:00Z`;

// DST anchor days
const SPRING_TODAY = '2026-03-29'; // 23-hour Madrid day
const AUTUMN_TODAY = '2026-10-26'; // the day AFTER the 25-hour Madrid day

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  // Stateful store for the serialized-concurrency test (test 7). All other
  // tests use the per-test mockResolvedValue overrides instead.
  const store = {
    streak: 0,
    xp: 0,
    wellnessRows: [] as Array<{ id: string; userId: string; date: Date }>,
  };

  const empireProgressFindUnique = vi.fn().mockResolvedValue(null);
  const empireProgressUpsert = vi.fn().mockResolvedValue({});
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);
  const challengeMock = vi.fn().mockResolvedValue(undefined);

  const makeLogStore = () => ({
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({
      id: 'log-new',
      ...create,
    })),
    delete: vi.fn().mockResolvedValue({}),
  });

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    wellnessLog: makeLogStore(),
    nutritionLog: makeLogStore(),
    empireProgress: {
      findUnique: empireProgressFindUnique,
      upsert: empireProgressUpsert,
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    // DELETE ownership lookups happen before the transaction.
    wellnessLog: { findUnique: vi.fn().mockResolvedValue(null) },
    nutritionLog: { findUnique: vi.fn().mockResolvedValue(null) },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return {
    state,
    store,
    MOCK_DB,
    MOCK_TX,
    empireProgressFindUnique,
    empireProgressUpsert,
    evaluateAchievementsMock,
    challengeMock,
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
  tryAutoCompleteChallenge: H.challengeMock,
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: H.evaluateAchievementsMock,
}));

// Mock ONLY "today"; keep the REAL Madrid conversion utilities.
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

interface RawCall { sql: string; params: any[] }

function rawCalls(): RawCall[] {
  return (H.MOCK_TX.$executeRaw.mock.calls as any[][]).map((c) => ({
    sql: (c[0] as string[]).join(' '),
    params: c.slice(1),
  }));
}

function allLockCalls(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('pg_advisory_xact_lock'));
}

function dayLockCalls(): RawCall[] {
  return allLockCalls().filter((c) => !c.sql.includes('|energia|recount'));
}

function recountLockCalls(): RawCall[] {
  return allLockCalls().filter((c) => c.sql.includes('|energia|recount'));
}

function energiaXpDecrements(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "xp" - 10)') && c.sql.includes("'energia'"));
}

function legacyStreakDecrements(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "streak" - 1)'));
}

function recountStreakUpdates(): RawCall[] {
  return rawCalls().filter((c) => c.sql.includes('GREATEST(0, "streak" +'));
}

function ownedWellnessLog(dateIso: string, id = 'wl-1') {
  return { id, userId: 'user-1', date: new Date(dateIso) };
}

function ownedNutritionLog(dateIso: string, id = 'nl-1') {
  return { id, userId: 'user-1', date: new Date(dateIso) };
}

function remainingWellnessDays(...dayKeys: string[]) {
  return dayKeys.map((k) => ({ date: new Date(noon(k)) }));
}

async function deleteWellness(logId = 'wl-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/wellness/route');
  return DELETE(makeRequest('/api/wellness', 'DELETE', { logId }) as any) as unknown as Response;
}

async function deleteNutrition(logId = 'nl-1'): Promise<Response> {
  const { DELETE } = await import('@/app/api/nutrition/route');
  return DELETE(makeRequest('/api/nutrition', 'DELETE', { logId }) as any) as unknown as Response;
}

async function postWellness(dateIso = noon(DAY_0)): Promise<Response> {
  const { POST } = await import('@/app/api/wellness/route');
  return POST(makeRequest('/api/wellness', 'POST', {
    date: dateIso, mood: 4, energy: 3, sleep: 4, stress: 2,
  }) as any) as unknown as Response;
}

// ─── E-7 — H-5: streak recount after DELETE ──────────────────

describe('E-7 H-5 — DELETE histórico deja la caché de racha consistente (recount con delta)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_0;
    H.store.streak = 0;
    H.store.xp = 0;
    H.store.wellnessRows = [];
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue([]);
    H.MOCK_TX.nutritionLog.findUnique.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findMany.mockResolvedValue([]);
    H.MOCK_TX.$executeRaw.mockResolvedValue(1);
    H.empireProgressFindUnique.mockResolvedValue(null);
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. cadena consecutiva — DELETE histórico corrige la caché con delta -1 y toma los locks en orden día→recount', async () => {
    // Chain {D-2, D-1, D0} with an (inflated) stored cache of 3. The deleted
    // log is D-2's — the chain that remains is {D-1, D0} → expected 2.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_2)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_1, DAY_0));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    // Correction applied as a commutative, clamped DELTA (−1), never as an
    // absolute write: params are (userId, delta).
    const updates = recountStreakUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain('GREATEST(0, "streak" +');
    expect(updates[0].sql).toContain("'energia'");
    expect(updates[0].params[1]).toBe('user-1');
    expect(updates[0].params[0]).toBe(-1);

    // Lock order: the energia DAY key first, the recount key second — the
    // lock graph (day → recount) is acyclic, so no deadlock is possible.
    const locks = allLockCalls();
    expect(locks).toHaveLength(2);
    expect(dayLockCalls()[0].params[0]).toBe('user-1');
    expect(dayLockCalls()[0].params[1]).toBe(DAY_2);
    expect(recountLockCalls()[0].sql).toContain("'|energia|recount'");
    expect(rawCalls()[0].sql).toContain('pg_advisory_xact_lock');
    expect(rawCalls()[0].params[1]).toBe(DAY_2);
  });

  it('2. DELETE de HOY con el día vacío — decremento F-5A intacto y recount con delta 0 → cero escrituras', async () => {
    // Chain {D-2, D-1, D0}, stored 3. Deleting today's (only-by-mock) log
    // empties today: the legacy decrement fires (−1) and the recount finds
    // the cache ALREADY consistent (modeled post-decrement value 2 == the
    // real chain {D-2, D-1}) → delta 0 → NO recount statement at all.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_0)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_2, DAY_1));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 2 }); // post-decrement state

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    expect(legacyStreakDecrements()).toHaveLength(1);
    expect(recountStreakUpdates()).toHaveLength(0);
    // The recount still serialized (lock taken), it just had nothing to fix.
    expect(recountLockCalls()).toHaveLength(1);
  });

  it('3. DELETE histórico que rompe la continuidad — el recount cruza tablas (días restantes en NUTRITION) → delta -1', async () => {
    // Real activity {D-4…} in wellness and {D-1, D0} in nutrition; the cache
    // says 3. Deleting D-2's wellness log (its own day is empty) must leave
    // the cache at the REAL chain: 2 (D-1, D0 in NUTRITION) → delta −1.
    // The remaining days are deliberately served by the nutrition findMany:
    // the recount MUST read both tables (cross-module, same as the POST).
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_2)));
    H.MOCK_TX.nutritionLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_1, DAY_0));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    const updates = recountStreakUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].params[0]).toBe(-1);
    expect(H.MOCK_TX.wellnessLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
    }));
    expect(H.MOCK_TX.nutritionLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
    }));
  });

  it('4. DELETE PUENTE (dirección inversa: nutrition borrado, días restantes en WELLNESS) → delta -2', async () => {
    // Chain {D-3, D-2, D-1} stored 3 (tip D-1). Deleting the MIDDLE day D-2
    // disconnects D-3: the real chain ending at the last active day is just
    // {D-1} → expected 1 → delta 1 − 3 = −2. The remaining days are served
    // by the wellness findMany because the deleted log is NUTRITION — the
    // mirrored cross-module direction.
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedNutritionLog(noon(DAY_2)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_3, DAY_1));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const res = await deleteNutrition();
    expect(res.status).toBe(200);

    const updates = recountStreakUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain("'energia'");
    expect(updates[0].params[0]).toBe(-2);
    expect(H.MOCK_TX.wellnessLog.findMany).toHaveBeenCalled();
    expect(H.MOCK_TX.nutritionLog.findMany).toHaveBeenCalled();
  });

  it('5. DELETE de un día aislado que NO afecta a la cadena — delta 0 → ninguna escritura del recount', async () => {
    // Real activity: an old isolated day D-3 plus today D0. The cache (1) is
    // the chain ending at D0. Deleting D-3's log does not change the chain →
    // delta 0 → the recount writes NOTHING (and the legacy decrement does
    // not fire either — the deleted day is not today).
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_3)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_0));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 1 });

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    expect(recountStreakUpdates()).toHaveLength(0);
    expect(legacyStreakDecrements()).toHaveLength(0);
    expect(recountLockCalls()).toHaveLength(1);
    // The XP revert (F-2, day left empty) still applies — only the streak
    // correction is a no-op here.
    expect(energiaXpDecrements()).toHaveLength(1);
  });

  it('6. borrado MÚLTIPLE — correcciones encadenadas dejan la caché en la cadena real restante', async () => {
    // Chain {D-3, D-2, D-1}, stored 3. Two sequential historic deletes:
    //   DELETE D-3 → remaining {D-2, D-1} → expected 2 → delta −1 (3→2)
    //   DELETE D-2 → remaining {D-1}    → expected 1 → delta −1 (2→1)
    // The findUnique mock models the DB value AFTER each correction.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_3), 'wl-a'));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValueOnce(remainingWellnessDays(DAY_2, DAY_1));
    H.empireProgressFindUnique.mockResolvedValueOnce({ streak: 3 });

    const res1 = await deleteWellness('wl-a');
    expect(res1.status).toBe(200);

    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_2), 'wl-b'));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValueOnce(remainingWellnessDays(DAY_1));
    H.empireProgressFindUnique.mockResolvedValueOnce({ streak: 2 });

    const res2 = await deleteWellness('wl-b');
    expect(res2.status).toBe(200);

    const updates = recountStreakUpdates();
    expect(updates).toHaveLength(2);
    expect(updates[0].params[0]).toBe(-1);
    expect(updates[1].params[0]).toBe(-1);
    // Both recounters serialized through the same recount key.
    expect(recountLockCalls()).toHaveLength(2);
    expect(recountLockCalls()[0].sql).toBe(recountLockCalls()[1].sql);
  });

  it('7. CONCURRENCIA — cola serializada por los locks: dos DELETE históricos acaban en la cadena real; DELETE repetido → 404 sin segunda corrección', async () => {
    // Stateful store + serialized transaction queue: models what the
    // advisory locks guarantee at DB level (the two DELETEs hold different
    // DAY keys, but BOTH need the shared 'user|energia|recount' key, so
    // their recount phases cannot interleave).
    H.store.wellnessRows = [
      { id: 'wl-a', userId: 'user-1', date: new Date(noon(DAY_3)) },
      { id: 'wl-b', userId: 'user-1', date: new Date(noon(DAY_2)) },
      { id: 'wl-c', userId: 'user-1', date: new Date(noon(DAY_1)) },
    ];
    H.store.streak = 3;

    // $executeRaw applies the very statements the route emits to the store.
    H.MOCK_TX.$executeRaw.mockImplementation(
      async (strings: TemplateStringsArray, ...params: unknown[]) => {
        const sql = strings.join(' ');
        if (sql.includes('pg_advisory_xact_lock')) return 1;
        if (sql.includes('"xp" = GREATEST(0, "xp" - 10)')) {
          H.store.xp = Math.max(0, H.store.xp - 10);
          return 1;
        }
        if (sql.includes('"streak" = GREATEST(0, "streak" - 1)')) {
          H.store.streak = Math.max(0, H.store.streak - 1);
          return 1;
        }
        if (sql.includes('"streak" = GREATEST(0, "streak" +')) {
          H.store.streak = Math.max(0, H.store.streak + (params[0] as number));
          return 1;
        }
        return 1;
      },
    );

    // Live reads model the transaction's own snapshot.
    H.MOCK_TX.wellnessLog.findMany.mockImplementation(async () =>
      H.store.wellnessRows.map((r) => ({ date: r.date })),
    );
    H.MOCK_TX.nutritionLog.findMany.mockResolvedValue([]);
    H.empireProgressFindUnique.mockImplementation(async () => ({ streak: H.store.streak }));
    H.MOCK_TX.wellnessLog.delete.mockImplementation(async ({ where }: { where: { id: string } }) => {
      H.store.wellnessRows = H.store.wellnessRows.filter((r) => r.id !== where.id);
      return {};
    });
    H.MOCK_DB.wellnessLog.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      H.store.wellnessRows.find((r) => r.id === where.id) ?? null,
    );

    // Serialize transactions exactly like the advisory locks would.
    let tail: Promise<unknown> = Promise.resolve();
    H.MOCK_DB.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
      const run = tail.then(() => fn(H.MOCK_TX));
      tail = run.then(() => undefined, () => undefined);
      return run;
    });

    // Two concurrent historic DELETEs (different day keys, shared recount key).
    const [resA, resB] = await Promise.all([deleteWellness('wl-a'), deleteWellness('wl-b')]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    // DELETE wl-a → remaining {D-2, D-1} → expected 2 → delta −1 (3→2)
    // DELETE wl-b → remaining {D-1}    → expected 1 → delta −1 (2→1)
    expect(H.store.streak).toBe(1);
    expect(recountStreakUpdates()).toHaveLength(2);

    // Repeated DELETE of the same log: the row no longer exists → 404, and
    // the streak is NOT touched a second time.
    const resAgain = await deleteWellness('wl-a');
    expect(resAgain.status).toBe(404);
    expect(H.store.streak).toBe(1);
    expect(recountStreakUpdates()).toHaveLength(2);
  });

  it('8. DST primavera (23 h) — los días 03-28 y 03-29 siguen siendo consecutivos para el recount', async () => {
    // Chain {03-27, 03-28, 03-29} stored 3; today is the 23-hour day
    // 2026-03-29. Deleting 03-27 leaves {03-28, 03-29} — consecutive despite
    // the spring transition (day stepping via addDaysToDateKey, noon-UTC).
    H.state.todayKey = SPRING_TODAY;
    expect(getMadridDateKey(new Date('2026-03-29T10:00:00Z'))).toBe(SPRING_TODAY);

    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog('2026-03-27T10:00:00Z'));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(
      remainingWellnessDays('2026-03-28', '2026-03-29'),
    );
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    const updates = recountStreakUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].params[0]).toBe(-1); // 3 → 2

    // Sanity: the deleted day's window is the REAL Madrid natural day (23 h
    // on the transition day is the day ITSELF; here the deleted day is a
    // normal 24 h day before the transition).
    const { start, end } = madridDayBoundaries('2026-03-27');
    expect((end.getTime() - start.getTime()) / 3600000).toBe(24);
  });

  it('9. DST otoño (25 h) — la cadena cruza 2026-10-25 contándolo como UN día', async () => {
    // Chain {10-24, 10-25 (25 h), 10-26} stored 3. Deleting 10-24 leaves
    // {10-25, 10-26} → expected 2 → delta −1. The 25-hour day must count as
    // exactly ONE chain step, never two (a fixed-24h walk would misalign).
    H.state.todayKey = AUTUMN_TODAY;

    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog('2026-10-24T10:00:00Z'));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(
      remainingWellnessDays('2026-10-25', '2026-10-26'),
    );
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    const updates = recountStreakUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].params[0]).toBe(-1);

    // The 25-hour day really spans 25 h — and is still ONE Madrid day key.
    const { start, end } = madridDayBoundaries('2026-10-25');
    expect((end.getTime() - start.getTime()) / 3600000).toBe(25);
    expect(getMadridDateKey(new Date('2026-10-25T22:30:00Z'))).toBe('2026-10-25');
  });

  it('10. el recount NO toca el XP — la única sentencia de XP sigue siendo el revert F-2 del día vacío', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_2)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_1, DAY_0));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    // Exactly one XP statement: the pre-existing F-2 day-empty revert.
    expect(energiaXpDecrements()).toHaveLength(1);
    expect(energiaXpDecrements()[0].sql).toContain('GREATEST(0, "xp" - 10)');

    // The recount statement touches ONLY the streak — never XP, and it is
    // never an empireProgress.upsert (no create path, no absolute write).
    for (const u of recountStreakUpdates()) {
      expect(u.sql).not.toContain('"xp"');
      expect(u.sql).toContain('"streak"');
    }
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('11. el DELETE no desbloquea logros ni completa retos — el recount no es una acción gamificada', async () => {
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_2)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_1, DAY_0));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const res = await deleteWellness();
    expect(res.status).toBe(200);

    expect(H.evaluateAchievementsMock).not.toHaveBeenCalled();
    expect(H.challengeMock).not.toHaveBeenCalled();

    // Mirrored for nutrition.
    vi.clearAllMocks();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_DB.nutritionLog.findUnique.mockResolvedValue(ownedNutritionLog(noon(DAY_2)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue([]);
    H.MOCK_TX.nutritionLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_1, DAY_0));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const resN = await deleteNutrition();
    expect(resN.status).toBe(200);
    expect(H.evaluateAchievementsMock).not.toHaveBeenCalled();
    expect(H.challengeMock).not.toHaveBeenCalled();
  });

  it('12. E-0.1 sobre la caché reconstruida — el POST en continuidad hereda la base corregida (+1) y el hueco hace SET 1', async () => {
    // Phase A — DELETE histórico corrige la caché inflada 3 → 1 (delta −2):
    // the chain really is just {D-1} after the bridge D-2 disappears.
    H.MOCK_DB.wellnessLog.findUnique.mockResolvedValue(ownedWellnessLog(noon(DAY_2)));
    H.MOCK_TX.wellnessLog.findMany.mockResolvedValue(remainingWellnessDays(DAY_1));
    H.empireProgressFindUnique.mockResolvedValue({ streak: 3 });

    const delRes = await deleteWellness();
    expect(delRes.status).toBe(200);
    expect(recountStreakUpdates()[0].params[0]).toBe(-2);

    // Phase B — POST of today in CONTINUITY (yesterday D-1 is active): E-0.1
    // takes the increment branch (+1), which the DB applies to the
    // RECOUNTED base (1 → 2). Before H-5 the base was the inflated 3 → 4.
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValueOnce(null) // same-day other log
      .mockResolvedValueOnce({ id: 'wl-y' }); // yesterday D-1 active
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);

    const postRes = await postWellness();
    expect(postRes.status).toBe(200);

    const continuityCall = H.empireProgressUpsert.mock.calls.at(-1) as any[];
    expect(continuityCall[0].update.xp).toEqual({ increment: 10 });
    expect(continuityCall[0].update.streak).toEqual({ increment: 1 });

    // Phase C — POST of a GAP day (yesterday has NO activity): E-0.1's
    // absolute SET 1 re-anchors the chain instead of incrementing a stale
    // base — composing with (never fighting) the recount's relative delta.
    H.empireProgressUpsert.mockClear();
    H.MOCK_TX.wellnessLog.findFirst.mockResolvedValue(null);
    H.MOCK_TX.nutritionLog.findFirst.mockResolvedValue(null);

    const gapRes = await postWellness();
    expect(gapRes.status).toBe(200);

    const gapCall = H.empireProgressUpsert.mock.calls.at(-1) as any[];
    expect(gapCall[0].update.xp).toEqual({ increment: 10 });
    expect(gapCall[0].update.streak).toBe(1);
  });
});
