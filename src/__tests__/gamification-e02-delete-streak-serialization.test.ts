/**
 * FASE 15 — E-0.2 (F-NEW-2): the DELETE /api/habits streak decision must be
 * made from a POST-LOCK read, never from the pre-lock snapshot.
 *
 * The transition audit found that DELETE read the habit row BEFORE opening
 * the advisory-locked transaction and used that snapshot's lastCompletedAt
 * to decide the H-12 empire-streak revert. Any PATCH or undo that committed
 * inside that window was invisible to the decision:
 *
 *   - under-decrement: PATCH completes the habit inside the window (empire
 *     streak +1); DELETE deletes the row but its stale snapshot says "never
 *     completed" → the increment is never reverted and the stored streak
 *     stays inflated.
 *   - over-decrement: UNDO reverts inside the window (streak −1, anchor
 *     null); DELETE's stale snapshot still says "completed today" → it
 *     reverts AGAIN → double decrement of one increment.
 *
 * Fix: DELETE re-reads the habit row INSIDE the advisory lock (same
 * user|disciplina|<Madrid day> family PATCH and undo already use) and
 * decides from that authoritative read. The pre-lock read survives only as
 * a UX fast-path 404 and never participates in the decision. todayDateKey
 * is now computed inside the transaction like PATCH/undo do, so the lock
 * seed cannot fragment near Madrid midnight.
 *
 * How these tests force the interleaving deterministically:
 *   - a shared stateful mock DB models the real rows (habit, sibling habits,
 *     EmpireProgress) and applies every write so arithmetic is observable;
 *   - a one-shot latch holds the DELETE transaction BEFORE the lock (i.e.
 *     right after the pre-lock read), the test commits a PATCH or undo
 *     against the shared state, then releases DELETE — the exact race
 *     window, with no timers and no flakiness;
 *   - the pre-lock read and the post-lock read return DIFFERENT values, so
 *     every assertion pins the decision to the post-lock one: on the pre-fix
 *     code these tests fail, on the fixed code they pass;
 *   - an event log proves the order preLockRead → lock → freshRead → delete
 *     → streak write inside DELETE.
 *
 * XP invariance is asserted explicitly: DELETE emits NO xp SQL in any
 * scenario; only PATCH (+10, paying gate) and undo (−10, mirror gate) move
 * EmpireProgress.xp, exactly as before this fix.
 *
 * getTodayDateKey is mocked at BOTH specifier paths (route code imports it
 * from @/lib/deterministic, a re-export of @/lib/dates); every other Madrid
 * helper stays REAL and "today" is anchored to the real Madrid clock at
 * runtime, so PATCH's internal new Date() always lands on the mocked today
 * — the suite is clock-relative and deterministic on any run date,
 * including DST transition days (M3/M4 pin specific transition dates).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// ─── Hoisted stateful mock DB + call log ─────────────────────

const H = vi.hoisted(() => {
  const state = {
    todayKey: '', // set in beforeAll from the REAL Madrid clock
    habit: null as Record<string, any> | null,
    others: [] as Array<Record<string, any>>,
    empire: { xp: 100, streak: 5 },
  };

  const calls = {
    events: [] as string[],
    preLockReads: 0,
    freshReads: 0,
    lockSeeds: [] as string[],
    streakDecrements: 0,
    xpWrites: [] as number[],
    deletes: 0,
    rawSql: [] as string[],
  };

  // One-shot latch: holds the NEXT $transaction call before it runs, so the
  // DELETE handler parks right after its pre-lock read (the race window).
  const latch = { armed: false, release: null as null | (() => void) };

  const realDates: any = {}; // stashed actual '@/lib/dates'

  function reset() {
    state.habit = null;
    state.others = [];
    state.empire = { xp: 100, streak: 5 };
    calls.events.length = 0;
    calls.preLockReads = 0;
    calls.freshReads = 0;
    calls.lockSeeds.length = 0;
    calls.streakDecrements = 0;
    calls.xpWrites.length = 0;
    calls.deletes = 0;
    calls.rawSql.length = 0;
    latch.armed = false;
    latch.release = null;
  }

  function inWindow(t: Date | null, gte?: Date, lt?: Date): boolean {
    if (!t) return false;
    const ms = t.getTime();
    if (gte && ms < gte.getTime()) return false;
    if (lt && ms >= lt.getTime()) return false;
    return true;
  }

  const TX = {
    $executeRaw: vi.fn(async (sql: any, ...vals: any[]) => {
      const text = Array.isArray(sql) ? sql.join('?') : String(sql);
      calls.rawSql.push(text);
      if (text.includes('pg_advisory_xact_lock')) {
        calls.lockSeeds.push(vals[0]);
        calls.events.push('lock');
        return 1;
      }
      if (text.includes('EmpireProgress') && text.includes('streak')) {
        calls.streakDecrements += 1;
        state.empire.streak = Math.max(0, state.empire.streak - 1);
        calls.events.push('streakDecrement');
        return 1;
      }
      if (text.includes('EmpireProgress') && text.includes('xp')) {
        calls.xpWrites.push(-10);
        state.empire.xp = Math.max(0, state.empire.xp - 10);
        calls.events.push('xpWrite');
        return 1;
      }
      return 1;
    }),

    $queryRaw: vi.fn(async (sql: any, ...vals: any[]) => {
      const text = Array.isArray(sql) ? sql.join('?') : String(sql);
      if (text.includes('FOR UPDATE')) {
        calls.events.push('forUpdate');
        const habitId = vals[0];
        const row =
          state.habit?.id === habitId
            ? state.habit
            : state.others.find((r) => r.id === habitId) ?? null;
        return row ? [{ ...row }] : [];
      }
      return [];
    }),

    habitLog: {
      findFirst: vi.fn(async (args: any) => {
        const where = args?.where ?? {};
        if (typeof where.id === 'string') {
          // E-0.2 fresh read INSIDE the lock (DELETE): authoritative state.
          calls.freshReads += 1;
          calls.events.push('freshRead');
          const row = state.habit?.id === where.id ? state.habit : null;
          return row ? { ...row } : null;
        }
        // Window query (other-completed-today / any-completion-yesterday).
        calls.events.push('windowQuery');
        const rows = [state.habit, ...state.others].filter(Boolean) as Array<Record<string, any>>;
        const notId = where.id?.not;
        const gte = where.lastCompletedAt?.gte;
        const lt = where.lastCompletedAt?.lt;
        for (const row of rows) {
          if (notId && row.id === notId) continue;
          const t = row.lastCompletedAt ? new Date(row.lastCompletedAt) : null;
          if (!inWindow(t, gte, lt)) continue;
          return { id: row.id };
        }
        return null;
      }),

      update: vi.fn(async (args: any) => {
        calls.events.push('update');
        const row =
          state.habit?.id === args.where.id
            ? state.habit
            : state.others.find((r) => r.id === args.where.id);
        if (row) {
          Object.assign(row, args.data);
          return { ...row };
        }
        return {};
      }),

      deleteMany: vi.fn(async (args: any) => {
        calls.events.push('delete');
        if (state.habit && state.habit.id === args?.where?.id) {
          calls.deletes += 1;
          state.habit = null;
          return { count: 1 };
        }
        return { count: 0 };
      }),
    },

    empireProgress: {
      upsert: vi.fn(async (args: any) => {
        const u = args?.update ?? {};
        calls.events.push('upsert');
        state.empire.xp += u?.xp?.increment ?? 0;
        if (u?.streak && typeof u.streak === 'object' && typeof u.streak.increment === 'number') {
          state.empire.streak += u.streak.increment;
        } else if (typeof u?.streak === 'number') {
          state.empire.streak = u.streak;
        }
        return {};
      }),
    },
  };

  const DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      if (latch.armed) {
        latch.armed = false;
        await new Promise<void>((resolve) => {
          latch.release = resolve;
        });
      }
      return fn(TX);
    }),
    habitLog: {
      findFirst: vi.fn(async (args: any) => {
        // Pre-lock read (DELETE fast-path 404 check) — state at read time.
        calls.preLockReads += 1;
        calls.events.push('preLockRead');
        const id = args?.where?.id;
        const row = state.habit && state.habit.id === id ? state.habit : null;
        return row ? { ...row } : null;
      }),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return { state, calls, latch, realDates, reset, TX, DB, getAuthUserBasicMock, rateLimitMock };
});

vi.mock('@/lib/db', () => ({ db: H.DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
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

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onHabitChange: vi.fn().mockResolvedValue(undefined),
}));

// Mock ONLY "today" (both specifier paths); Madrid conversions stay real.
vi.mock('@/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dates')>();
  Object.assign(H.realDates, actual);
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

// ─── Handlers under test (dynamic import, after mocks) ───────

type Handler = (request: unknown) => Promise<Response>;
let PATCH: Handler;
let DELETE: Handler;
let UNDO: Handler;

beforeAll(async () => {
  const route = await import('@/app/api/habits/route');
  const undo = await import('@/app/api/habits/undo/route');
  PATCH = route.PATCH as Handler;
  DELETE = route.DELETE as Handler;
  UNDO = undo.POST as Handler;
  // Anchor "today" to the REAL Madrid clock: PATCH stamps new Date() on
  // completion, whose Madrid key then always equals the mocked todayKey.
  H.state.todayKey = H.realDates.getTodayDateKey();
});

beforeEach(() => {
  vi.clearAllMocks();
  H.reset();
  H.state.todayKey = H.realDates.getTodayDateKey();
  H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'FREE' });
});

// ─── Helpers ─────────────────────────────────────────────────

function req(method: 'PATCH' | 'DELETE' | 'POST', path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const TODAY = () => H.state.todayKey;
const lockSeed = () => 'user-1|disciplina|' + TODAY();

function shiftKey(days: number): string {
  return H.realDates.addDaysToDateKey(TODAY(), days);
}

function madridTime(dateKey: string, hoursAfterMidnight: number): Date {
  return new Date(H.realDates.startOfMadridDay(dateKey).getTime() + hoursAfterMidnight * 3600 * 1000);
}

function habitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Leer 20 minutos',
    description: null,
    frequency: 'daily',
    streak: 2,
    lastCompletedAt: null as Date | null,
    createdAt: madridTime(TODAY(), 12 + 24 * -3), // 3 Madrid days ago at noon → pays
    updatedAt: madridTime(TODAY(), 12 + 24 * -3),
    ...overrides,
  };
}

function armLatch() {
  H.latch.armed = true;
}

async function waitLatchArmed() {
  await vi.waitFor(() => {
    if (!H.latch.release) throw new Error('DELETE transaction not parked at the latch yet');
  });
}

function releaseLatch() {
  H.latch.release?.();
}

// ─── Tests ───────────────────────────────────────────────────

describe('E-0.2 — DELETE decides from the POST-LOCK read (F-NEW-2)', () => {
  describe('A — normal DELETE (no interleaving; stale snapshot == fresh read)', () => {
    it('A1: never-completed habit → row removed, streak untouched, lock→freshRead→delete order', async () => {
      H.state.habit = habitRow();
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });

      expect(H.calls.deletes).toBe(1);
      expect(H.calls.streakDecrements).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });

      // The critical read happened AFTER the lock, exactly once.
      const ev = H.calls.events;
      expect(ev.indexOf('lock')).toBeGreaterThanOrEqual(0);
      expect(ev.indexOf('lock')).toBeLessThan(ev.indexOf('freshRead'));
      expect(ev.indexOf('freshRead')).toBeLessThan(ev.indexOf('delete'));
      expect(H.calls.freshReads).toBe(1);
      expect(H.calls.lockSeeds).toEqual([lockSeed()]);
    });

    it('A2: habit completed yesterday (not today) → no revert', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(shiftKey(-1), 12) });
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(H.calls.deletes).toBe(1);
      expect(H.calls.streakDecrements).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
    });

    it('A3: habit completed today but another habit also completed today → no revert', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });
      H.state.others = [habitRow({ id: 'habit-2', lastCompletedAt: madridTime(TODAY(), 13) })];
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(H.calls.streakDecrements).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
    });

    it('A4: habit completed today as the SOLE completion → exactly one revert (H-12 kept)', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(H.calls.streakDecrements).toBe(1);
      expect(H.state.empire.streak).toBe(4); // 5 → 4
      expect(H.state.empire.xp).toBe(100); // untouched
      expect(H.calls.rawSql.filter((s) => s.includes('"xp"'))).toEqual([]);
    });

    it('A5: unknown habit → 404 before any transaction work', async () => {
      H.state.habit = habitRow();
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-nope' }));
      expect(res.status).toBe(404);
      expect(H.calls.lockSeeds).toEqual([]);
      expect(H.calls.freshReads).toBe(0);
      expect(H.calls.deletes).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
    });
  });

  describe('B — the decision follows the POST-LOCK read when the snapshot went stale', () => {
    it('B1 (PATCH → DELETE): completion committed inside the race window IS reverted', async () => {
      // DELETE parks after its pre-lock read (habit never completed).
      H.state.habit = habitRow();
      H.state.others = [habitRow({ id: 'habit-y', lastCompletedAt: madridTime(shiftKey(-1), 12) })];
      armLatch();
      const p = DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      await waitLatchArmed();
      expect(H.calls.preLockReads).toBe(1);

      // PATCH completes the habit while DELETE holds a stale "null" snapshot.
      const pres = await PATCH(req('PATCH', '/api/habits', { habitId: 'habit-1' }));
      expect(pres.status).toBe(200);
      expect(H.state.empire.xp).toBe(110); // +10 paying
      expect(H.state.empire.streak).toBe(6); // 5 → 6 (yesterday anchor → increment)

      releaseLatch();
      const res = await p;
      expect(res.status).toBe(200);

      // The post-lock read saw the completion → the revert RAN exactly once.
      expect(H.calls.streakDecrements).toBe(1);
      expect(H.state.empire.streak).toBe(5); // increment fully reverted
      expect(H.state.empire.xp).toBe(110); // DELETE never touches XP
      expect(H.calls.freshReads).toBe(1);

      const ev = H.calls.events;
      expect(ev.indexOf('preLockRead')).toBeLessThan(ev.indexOf('upsert')); // PATCH committed first
      expect(ev.indexOf('lock')).toBeLessThan(ev.indexOf('freshRead')); // read under the lock
      expect(ev.indexOf('freshRead')).toBeLessThan(ev.indexOf('delete'));
      expect(ev.indexOf('delete')).toBeLessThan(ev.indexOf('streakDecrement'));
    });

    it('B2 (UNDO → DELETE): an already-reverted completion is NOT reverted again', async () => {
      // DELETE parks after its pre-lock read (habit completed today).
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12), streak: 3 });
      armLatch();
      const p = DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      await waitLatchArmed();
      expect(H.calls.preLockReads).toBe(1);

      // UNDO reverts first: streak −1, XP −10, anchor null.
      const ures = await UNDO(req('POST', '/api/habits/undo', { habitId: 'habit-1' }));
      expect(ures.status).toBe(200);
      expect(H.state.empire.streak).toBe(4); // 5 → 4
      expect(H.state.empire.xp).toBe(90); // 100 → 90

      releaseLatch();
      const res = await p;
      expect(res.status).toBe(200);

      // The post-lock read saw lastCompletedAt = null → NO second revert.
      expect(H.calls.streakDecrements).toBe(1); // only undo's
      expect(H.state.empire.streak).toBe(4);
      expect(H.calls.deletes).toBe(1);
      expect(H.calls.xpWrites).toEqual([-10]); // only undo's XP write
      expect(H.calls.freshReads).toBe(1);
    });
  });

  describe('C/D — serialization against PATCH and UNDO', () => {
    it('C: DELETE commits first, then PATCH the same habit → serialized 404', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });
      const dres = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(dres.status).toBe(200);
      expect(H.calls.streakDecrements).toBe(1);

      const pres = await PATCH(req('PATCH', '/api/habits', { habitId: 'habit-1' }));
      expect(pres.status).toBe(404);
      expect(H.state.empire.streak).toBe(4);
      expect(H.state.empire.xp).toBe(100);
    });

    it('D: undo outside the period is rejected (too_old), then DELETE proceeds without revert', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(shiftKey(-3), 12), streak: 7 });
      const ures = await UNDO(req('POST', '/api/habits/undo', { habitId: 'habit-1' }));
      expect(ures.status).toBe(400);

      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(H.calls.deletes).toBe(1);
      expect(H.calls.streakDecrements).toBe(0); // completed 3 days ago, not today
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
    });
  });

  describe('E/F — DELETE first, then sibling operations stay coherent', () => {
    it('E: DELETE then PATCH a sibling habit — revert + fresh increment compose correctly', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });
      H.state.others = [
        habitRow({ id: 'habit-y', lastCompletedAt: madridTime(shiftKey(-1), 12) }),
        habitRow({ id: 'habit-z' }),
      ];

      const dres = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(dres.status).toBe(200);
      expect(H.state.empire.streak).toBe(4); // today's sole increment reverted

      const pres = await PATCH(req('PATCH', '/api/habits', { habitId: 'habit-z' }));
      expect(pres.status).toBe(200);
      expect(H.state.empire.streak).toBe(5); // yesterday anchor → increment
      expect(H.state.empire.xp).toBe(110); // habit-z created 3 days ago → pays
    });

    it('F: DELETE then UNDO the same habit → serialized 404, no double changes', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });
      const dres = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(dres.status).toBe(200);

      const ures = await UNDO(req('POST', '/api/habits/undo', { habitId: 'habit-1' }));
      expect(ures.status).toBe(404);
      expect(H.calls.streakDecrements).toBe(1); // only DELETE's revert
      expect(H.calls.xpWrites).toEqual([]); // undo never ran
      expect(H.state.empire).toEqual({ xp: 100, streak: 4 });
    });
  });

  describe('G — realistic controlled concurrency', () => {
    it('G1: two racing DELETEs — winner reverts once, loser re-reads under the lock and does nothing', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });

      armLatch();
      const p1 = DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      await waitLatchArmed();

      const p2 = DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' })); // one-shot latch consumed
      const r2 = await p2;
      expect(r2.status).toBe(200);
      expect(H.calls.streakDecrements).toBe(1); // winner already reverted

      releaseLatch();
      const r1 = await p1;
      expect(r1.status).toBe(200);

      expect(H.calls.deletes).toBe(1); // the row is deleted exactly once
      expect(H.calls.streakDecrements).toBe(1); // reverted exactly once
      expect(H.state.empire.streak).toBe(4);
      expect(H.calls.freshReads).toBe(2); // both re-read under the lock; loser saw null
      const ev = H.calls.events;
      expect(ev.indexOf('lock')).toBeLessThan(ev.indexOf('freshRead'));
    });

    it('G2: PATCH → UNDO → PATCH → DELETE storm — final state consistent', async () => {
      H.state.habit = habitRow(); // never completed at snapshot time
      H.state.others = [habitRow({ id: 'habit-y', lastCompletedAt: madridTime(shiftKey(-1), 12) })];

      armLatch();
      const p = DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      await waitLatchArmed();

      // 1) PATCH completes (+10 XP, streak 5→6).
      const p1 = await PATCH(req('PATCH', '/api/habits', { habitId: 'habit-1' }));
      expect(p1.status).toBe(200);
      expect(H.state.empire).toEqual({ xp: 110, streak: 6 });

      // 2) UNDO reverts that completion (−10 XP, streak 6→5, anchor null).
      const u1 = await UNDO(req('POST', '/api/habits/undo', { habitId: 'habit-1' }));
      expect(u1.status).toBe(200);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });

      // 3) PATCH completes again (+10 XP, streak 5→6).
      const p2 = await PATCH(req('PATCH', '/api/habits', { habitId: 'habit-1' }));
      expect(p2.status).toBe(200);
      expect(H.state.empire).toEqual({ xp: 110, streak: 6 });

      // 4) DELETE finally takes the lock: the completion it sees is reverted.
      releaseLatch();
      const res = await p;
      expect(res.status).toBe(200);

      expect(H.calls.streakDecrements).toBe(2); // undo's + delete's — exactly one per reverted completion
      expect(H.state.empire.streak).toBe(5);
      expect(H.state.empire.xp).toBe(110); // legitimate completion XP survives the delete (G-04)
      expect(H.calls.xpWrites).toEqual([-10]); // DELETE emitted no XP write
    });

    it('G3: PATCH, UNDO and DELETE all serialize on the SAME canonical advisory-lock seed', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });

      const pres = await PATCH(req('PATCH', '/api/habits', { habitId: 'habit-1' }));
      expect(pres.status).toBe(400); // already completed today — but the lock WAS taken first

      const ures = await UNDO(req('POST', '/api/habits/undo', { habitId: 'habit-1' }));
      expect(ures.status).toBe(200);

      const dres = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(dres.status).toBe(200);

      expect(H.calls.lockSeeds).toEqual([lockSeed(), lockSeed(), lockSeed()]);
      // End state: undo reverted the completion (−10 XP, streak −1), delete
      // found anchor null and did NOT revert again.
      expect(H.state.empire).toEqual({ xp: 90, streak: 4 });
    });
  });

  describe('H — XP invariance', () => {
    it('H1: DELETE emits no XP SQL in any branch and never moves EmpireProgress.xp', async () => {
      // Branch 1: revert taken.
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });
      await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(H.calls.rawSql.filter((s) => s.toLowerCase().includes('xp'))).toEqual([]);
      expect(H.state.empire.xp).toBe(100);

      // Branch 2: no revert (habit completed yesterday).
      H.reset();
      H.state.habit = habitRow({ lastCompletedAt: madridTime(shiftKey(-1), 12) });
      await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(H.calls.rawSql.filter((s) => s.toLowerCase().includes('xp'))).toEqual([]);
      expect(H.state.empire.xp).toBe(100);

      // Branch 3: nothing to delete (already gone under the lock).
      H.reset();
      await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(H.calls.rawSql.filter((s) => s.toLowerCase().includes('xp'))).toEqual([]);
      expect(H.state.empire.xp).toBe(100);
    });

    it('H2: deleteMany count=0 defense — no revert without a real delete (G-04 guard kept)', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 12) });
      H.TX.habitLog.deleteMany.mockResolvedValueOnce({ count: 0 });
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(H.calls.streakDecrements).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
    });
  });

  describe('M — Europe/Madrid day semantics (real helpers, no start+24h)', () => {
    it('M1: completion at 00:30 Madrid today (22:30Z prev UTC day) → revert applies', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(TODAY(), 0.5) });
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      // A UTC-day comparison would call this "yesterday" and skip the revert.
      expect(H.calls.streakDecrements).toBe(1);
      expect(H.state.empire.streak).toBe(4);
    });

    it('M2: completion at 23:30 Madrid yesterday → no revert', async () => {
      H.state.habit = habitRow({ lastCompletedAt: madridTime(shiftKey(-1), 23.5) });
      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(H.calls.streakDecrements).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
    });

    it('M3: autumn DST 25h day — the today-window uses the TRUE Madrid end (no start+24h)', async () => {
      H.state.todayKey = '2026-10-25'; // DST ends: 25-hour Madrid day
      // 22:30Z = 23:30 Madrid CET — inside [22:00Z Oct 24, 23:00Z Oct 25).
      const lateEvening = new Date(Date.UTC(2026, 9, 25, 22, 30));
      H.state.habit = habitRow({ lastCompletedAt: lateEvening });
      H.state.others = [habitRow({ id: 'habit-2', lastCompletedAt: lateEvening })];

      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      // start+24h would end the window at 22:00Z and MISS habit-2 → wrong revert.
      expect(H.calls.streakDecrements).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
      expect(H.calls.lockSeeds).toEqual(['user-1|disciplina|2026-10-25']);
    });

    it('M4: spring DST 23h day — same window exactness', async () => {
      H.state.todayKey = '2026-03-29'; // DST starts: 23-hour Madrid day
      // 21:30Z = 23:30 Madrid CEST — inside [23:00Z Mar 28, 22:00Z Mar 29).
      const lateEvening = new Date(Date.UTC(2026, 2, 29, 21, 30));
      H.state.habit = habitRow({ lastCompletedAt: lateEvening });
      H.state.others = [habitRow({ id: 'habit-2', lastCompletedAt: lateEvening })];

      const res = await DELETE(req('DELETE', '/api/habits', { habitId: 'habit-1' }));
      expect(res.status).toBe(200);
      expect(H.calls.streakDecrements).toBe(0);
      expect(H.state.empire).toEqual({ xp: 100, streak: 5 });
      expect(H.calls.lockSeeds).toEqual(['user-1|disciplina|2026-03-29']);
    });
  });
});
