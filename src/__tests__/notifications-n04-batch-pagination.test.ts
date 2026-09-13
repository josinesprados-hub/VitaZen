// ═════════════════════════════════════════════════════════════════════
// FASE 18 — N-04: STABLE KEYSET PAGINATION FOR BATCH PROCESSES
// ═════════════════════════════════════════════════════════════════════
//
// Batch selectors used fixed `take` (100 reminders / 500 weekly recap)
// with NO orderBy and NO cursor. Once eligible users exceeded the cap,
// an arbitrary-but-stable subset was selected on every run while users
// beyond the cap were never processed (daily crons run once a day; the
// weekly recap claim is per (userId, weekKey) so a missed week is lost
// forever for that user).
//
// Fix: runKeysetBatch() + orderBy on a unique field + cursor + skip:1.
//
// Test strategy: the mocked findMany implements REAL keyset semantics
// (orderBy asc, cursor seek, skip:1 exclusion, take) over an in-memory
// dataset, so pagination correctness is verified against actual cursor
// behavior — not just call counts.
//
// Spec cases (per affected batch — daily, checkin, reflection, weekly):
//   1. fewer users than page size        → all processed
//   2. exactly page size                 → all processed exactly once
//   3. more users than one page          → every page processed
//   4. more than 500 users               → all processed (weekly: 1250)
//   5. user beyond the old fixed limit   → now processed
//   6. stable order between pages        → chained cursors, orderBy asc
//   7. no user repeated                  → set equality, zero duplicates
//   8. partial last page                 → processed correctly
//   9. zero users                        → clean termination
//  10. repeated run                      → no duplicate sends (idempotency)
//  11. records mutated mid-batch         → safe behavior (keyset guards)
//  12. existing filters untouched        → where clauses preserved
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Keyset-semantics mock: real orderBy/cursor/skip/take behavior ───

type Row = { [k: string]: any };

interface KeysetQuery {
  where?: Record<string, unknown>;
  orderBy?: Record<string, string>;
  cursor?: Record<string, string>;
  skip?: number;
  take?: number;
}

/**
 * Builds a vi.fn that mimics Prisma keyset pagination over a mutable
 * dataset: ascending sort on `key`, cursor seek, skip:1 exclusion, take.
 * `where` filtering is delegated to `applyWhere` (the mock simulates a
 * database that has already evaluated complex filters; simple scalar
 * flags are evaluated on every call so mid-batch mutations behave like
 * the real database).
 */
function makeKeysetFinder(getRows: () => Row[], key: string, applyWhere?: (where: Record<string, unknown> | undefined, rows: Row[]) => Row[]) {
  return vi.fn(async (args: KeysetQuery) => {
    let rows = getRows();
    if (applyWhere) rows = applyWhere(args.where, rows);
    rows = [...rows].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
    if (args.cursor && args.cursor[key] !== undefined) {
      const idx = rows.findIndex(r => r[key] === args.cursor![key]);
      if (idx === -1) throw new Error(`mock: cursor "${args.cursor[key]}" not found`);
      // skip: 1 — the cursor row itself is excluded from the next page
      rows = rows.slice(idx + (args.skip ?? 0));
    }
    if (args.take !== undefined && args.take !== null) {
      rows = rows.slice(0, args.take);
    }
    return rows;
  });
}

/** Scalar-equality where evaluation (flags like pushEnabled: true). */
function scalarWhere(where: Record<string, unknown> | undefined, rows: Row[]): Row[] {
  return rows.filter(row =>
    Object.entries(where ?? {}).every(([k, v]) =>
      (v === null || typeof v !== 'object') ? row[k] === v : true
    )
  );
}

const USERS_PAGE = 100;   // reminders BATCH_SIZE
const WEEKLY_PAGE = 500;  // weekly recap page size

function makeUsers(n: number): Array<{ id: string; email: string }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `u-${String(i + 1).padStart(5, '0')}`,
    email: `user-${String(i + 1).padStart(5, '0')}@example.com`,
  }));
}

// ─── Shared mock state, rebuilt per test ───

let CURRENT_DB: any;
vi.mock('@/lib/db', () => ({
  get db() { return CURRENT_DB; },
}));

// Shared reminder-gate mocks (deterministic; timezone windows are pinned
// per-suite via fake Date).
let _canSend: ReturnType<typeof vi.fn>;
let _sendNotification: ReturnType<typeof vi.fn>;

vi.mock('@/lib/notifications/service', () => ({
  get sendNotification() { return (_sendNotification as any); },
}));
vi.mock('@/lib/notifications/scheduler', () => ({
  canSendNotification: (...a: unknown[]) => (_canSend as any)(...a),
  isInQuietHours: () => false,
  getUserTodayStart: () => new Date('2026-07-15T00:00:00.000Z'),
}));
vi.mock('@/lib/notifications/reminders/reflection', async (importOriginal) => {
  // Partial mock: keep the REAL processReflectionBatch/sendReflectionReminder,
  // but stub the activity/checkin lookups that daily.ts and checkin.ts import
  // from this module. The real reflection batch path uses its own internal
  // helpers, which hit db.dailyCheckin / db.analyticsEvent in the mocked db.
  const actual = await importOriginal<typeof import('@/lib/notifications/reminders/reflection')>();
  return {
    ...actual,
    isUserCurrentlyActive: vi.fn().mockResolvedValue(false),
    hasCheckedInToday: vi.fn().mockResolvedValue(false),
  };
});

// ─── Reminder harnesses (daily | checkin | reflection) ───

interface ReminderState {
  users: Array<{ id: string; email: string }>;
  prefs: Array<{ userId: string; timezone: string; pushEnabled: boolean }>;
  /** Called after the FIRST keyset page has been fetched (mid-batch mutation hook). */
  mutateAfterFirstPage?: () => void;
}

interface BatchHandle {
  findManyCalls: () => KeysetQuery[];
  processedIds: () => string[];
  sentIds: () => string[];
  sent: number;
  skipped: number;
  errors: number;
  total: number;
  details: Array<{ userId: string; sent: boolean; reason?: string }>;
  [k: string]: unknown;
}

function buildReminderDb(state: ReminderState, mode: 'daily' | 'pref') {
  const usersWithToken = new Set(state.users.map(u => u.id));
  const prefByUser = new Map(state.prefs.map(p => [p.userId, p]));

  let fetchCount = 0;
  const wrapWithMutationHook = (finder: ReturnType<typeof makeKeysetFinder>) =>
    vi.fn(async (args: KeysetQuery) => {
      fetchCount++;
      // Apply mid-batch mutations BEFORE the 2nd fetch, so they take
      // effect on every page after the first one (like a real opt-out
      // happening while the batch is running).
      if (fetchCount === 2 && state.mutateAfterFirstPage) state.mutateAfterFirstPage();
      return finder(args);
    });

  if (mode === 'daily') {
    // Keyset selection runs on User; prefs are an in-list join.
    const userFindMany = wrapWithMutationHook(makeKeysetFinder(() => state.users as Row[], 'id'));
    return {
      user: { findMany: userFindMany },
      notificationPreference: {
        findMany: vi.fn(async (args: any) => {
          const ids: string[] = args.where.userId.in;
          return state.prefs.filter(p => ids.includes(p.userId) && p.pushEnabled);
        }),
        findUnique: vi.fn(async (args: any) => prefByUser.get(args.where.userId) ?? null),
      },
      pushToken: {
        groupBy: vi.fn(async (args: any) => {
          const ids: string[] = args.where.userId.in;
          return ids.filter(id => usersWithToken.has(id)).map(userId => ({ userId, _count: { id: 1 } }));
        }),
      },
      dailyCheckin: { findUnique: vi.fn(async () => null) },
      analyticsEvent: { findFirst: vi.fn(async () => null) },
      _keyset: userFindMany,
    };
  }

  // mode === 'pref' (checkin / reflection): keyset selection runs on
  // NotificationPreference itself (unique userId).
  const prefFindMany = wrapWithMutationHook(
    makeKeysetFinder(() => state.prefs as Row[], 'userId', scalarWhere)
  );
  return {
    user: { findMany: vi.fn(async () => []) },
    notificationPreference: {
      findMany: prefFindMany,
      findUnique: vi.fn(async (args: any) => prefByUser.get(args.where.userId) ?? null),
    },
    pushToken: {
      groupBy: vi.fn(async (args: any) => {
        const ids: string[] = args.where.userId.in;
        return ids.filter(id => usersWithToken.has(id)).map(userId => ({ userId, _count: { id: 1 } }));
      }),
    },
    dailyCheckin: { findUnique: vi.fn(async () => null) },
    analyticsEvent: { findFirst: vi.fn(async () => null) },
    _keyset: prefFindMany,
  };
}

async function runDailyHarness(state: ReminderState): Promise<BatchHandle> {
  const db = buildReminderDb(state, 'daily');
  CURRENT_DB = db;
  const { processDailyBatch } = await import('@/lib/notifications/reminders/daily');
  const result = await processDailyBatch();
  return {
    ...result,
    findManyCalls: () => db._keyset.mock.calls.map((c: any[]) => c[0]),
    processedIds: () => result.details.map(d => d.userId),
    sentIds: () => result.details.filter(d => d.sent).map(d => d.userId),
  };
}

async function runPrefHarness(mod: 'checkin' | 'reflection', state: ReminderState): Promise<BatchHandle> {
  const db = buildReminderDb(state, 'pref');
  CURRENT_DB = db;
  const m = mod === 'checkin'
    ? await import('@/lib/notifications/reminders/checkin')
    : await import('@/lib/notifications/reminders/reflection');
  const result = mod === 'checkin'
    ? await (m as any).processCheckinBatch()
    : await (m as any).processReflectionBatch();
  return {
    ...result,
    findManyCalls: () => db._keyset.mock.calls.map((c: any[]) => c[0]),
    processedIds: () => result.details.map(d => d.userId),
    sentIds: () => result.details.filter(d => d.sent).map(d => d.userId),
  };
}

const runCheckinHarness = (s: ReminderState) => runPrefHarness('checkin', s);
const runReflectionHarness = (s: ReminderState) => runPrefHarness('reflection', s);

// ─── Weekly recap harness ───

let _resendSend: ReturnType<typeof vi.fn>;
let _claims: Set<string> | null;

vi.mock('@/lib/insights', () => ({
  gatherData: vi.fn(async () => ({})),
  generateWeeklyInsights: vi.fn(async () => ({
    summary: {
      weekLabel: '2026-W29',
      score: 70,
      totalActivities: 3,
      checkins: { count: 2 },
      habits: { completed: 1 },
      meditation: { sessions: 1 },
      journal: { entries: 1 },
    },
    insights: [],
  })),
}));
vi.mock('@/lib/emotional-state', () => ({
  getEmotionalState: vi.fn(async () => ({
    statusLabel: 'Equilibrado',
    metrics: { energy: { value: 60 }, consistency: { value: 60 } },
  })),
}));
vi.mock('@/lib/streaks', () => ({
  currentHabitStreak: vi.fn(() => 0),
}));
vi.mock('@/lib/emails/weekly-recap', () => ({
  weeklyRecapEmail: vi.fn(() => ({ subject: 'Tu semana', html: '<p/>', text: 'p' })),
}));
vi.mock('@/lib/resend', () => ({
  resend: {
    get emails() {
      return { get send() { return _resendSend; } };
    },
  },
}));

async function runWeeklyHarness(state: {
  eligible: Array<{ id: string; email: string; name: string | null; plan: string }>;
}): Promise<BatchHandle & { claims: Set<string>; sentEmails: () => string[] }> {
  const claims = _claims ?? new Set<string>();
  const keysetFind = makeKeysetFinder(() => state.eligible as Row[], 'id');
  const db = {
    user: { findMany: keysetFind },
    habitLog: { findMany: vi.fn(async () => []) },
    weeklyEmailLog: {
      create: vi.fn(async (args: any) => {
        const k = `${args.data.userId}|${args.data.weekKey}`;
        if (claims.has(k)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        claims.add(k);
        return args;
      }),
      deleteMany: vi.fn(async (args: any) => {
        claims.delete(`${args.where.userId}|${args.where.weekKey}`);
        return { count: 1 };
      }),
    },
  };
  CURRENT_DB = db;
  const { sendWeeklyRecaps } = await import('@/lib/weekly-recap-sender');
  const result = await sendWeeklyRecaps();
  return {
    // Map the weekly result onto the shared BatchHandle shape
    ...result,
    total: result.totalEligible,
    details: [],
    findManyCalls: () => keysetFind.mock.calls.map((c: any[]) => c[0]),
    processedIds: () => db.weeklyEmailLog.create.mock.calls.map((c: any[]) => c[0].data.userId),
    sentIds: () => _resendSend.mock.calls.map((c: any[]) => {
      const local = (c[0].to as string).split('@')[0]; // "user-00042"
      return `u-${local.split('-')[1]}`;               // "u-00042"
    }),
    sentEmails: () => _resendSend.mock.calls.map((c: any[]) => c[0].to),
    claims,
  };
}

// ─── Suite factory: the 12 spec cases against one batch harness ───

type Harness = (state: ReminderState) => Promise<BatchHandle>;

function defineSpecSuite(batch: string, run: Harness, pageSize: number, weeklyStyle: boolean, flagField?: 'checkinReminders' | 'reflectionReminders', keyField: 'id' | 'userId' = 'userId') {
  const prefsFor = (users: Array<{ id: string }>): ReminderState['prefs'] =>
    users.map(u => ({
      userId: u.id,
      timezone: 'Europe/Madrid',
      pushEnabled: true,
      ...(flagField ? { [flagField]: true } : {}),
    })) as ReminderState['prefs'];

  describe(`N-04 — ${batch}`, () => {
    it('1. fewer users than page size → all processed in a single page', async () => {
      const users = makeUsers(pageSize - 5);
      const res = await run({ users, prefs: prefsFor(users) });
      expect(res.findManyCalls().length).toBe(1);
      expect(new Set(res.processedIds())).toEqual(new Set(users.map(u => u.id)));
    });

    it('2. exactly page size → all processed exactly once (clean follow-up page)', async () => {
      const users = makeUsers(pageSize);
      const res = await run({ users, prefs: prefsFor(users) });
      expect(res.findManyCalls().length).toBe(2); // full page + empty terminator
      const processed = res.processedIds();
      expect(processed.length).toBe(users.length);
      expect(new Set(processed)).toEqual(new Set(users.map(u => u.id)));
    });

    it('3. more users than one page → every page processed until exhaustion', async () => {
      const users = makeUsers(pageSize * 2 + 50);
      const res = await run({ users, prefs: prefsFor(users) });
      expect(res.findManyCalls().length).toBe(3); // 2 full + 1 partial (partial ends the scan)
      expect(new Set(res.processedIds())).toEqual(new Set(users.map(u => u.id)));
    });

    it('4. more than 500 users → all processed across pages', async () => {
      const n = weeklyStyle ? 1250 : 520;
      const users = makeUsers(n);
      const res = await run({ users, prefs: prefsFor(users) });
      expect(res.processedIds().length).toBe(n);
      expect(new Set(res.processedIds())).toEqual(new Set(users.map(u => u.id)));
    });

    it('5. user beyond the old fixed limit → now processed', async () => {
      const users = makeUsers(pageSize + 100);
      const beyond = users[pageSize + 50].id; // strictly after the old cap
      const res = await run({ users, prefs: prefsFor(users) });
      expect(res.processedIds()).toContain(beyond);
      expect(res.sentIds().length).toBe(users.length);
    });

    it('6. stable order between pages → chained cursors, ascending unique key, skip:1', async () => {
      const users = makeUsers(pageSize * 2 + 30);
      const res = await run({ users, prefs: prefsFor(users) });
      const calls = res.findManyCalls();
      expect(calls.length).toBeGreaterThanOrEqual(3);

      const key = keyField;
      // First page: no cursor, orderBy ascending on the unique field
      expect(calls[0].cursor).toBeUndefined();
      expect(calls[0].orderBy).toEqual({ [key]: 'asc' });
      expect(calls[0].take).toBe(pageSize);

      // Every subsequent page: cursor == last key of previous FULL page,
      // skip: 1 (cursor row excluded), same ascending order.
      const allIds = users.map(u => u.id);
      for (let i = 1; i < calls.length; i++) {
        const prev = calls[i - 1];
        const prevCursor: string | undefined = prev.cursor?.[key];
        // Rows that followed the previous cursor, in key order
        const startIndex = prevCursor ? allIds.indexOf(prevCursor) + 1 : 0;
        const prevRows = allIds.slice(startIndex, startIndex + pageSize);
        expect(prevRows.length).toBe(pageSize); // only full pages chain a cursor
        expect(calls[i].cursor).toEqual({ [key]: prevRows[prevRows.length - 1] });
        expect(calls[i].skip).toBe(1);
        expect(calls[i].orderBy).toEqual({ [key]: 'asc' });
      }
    });

    it('7. no user is processed twice', async () => {
      const users = makeUsers(pageSize * 2 + 7);
      const res = await run({ users, prefs: prefsFor(users) });
      const processed = res.processedIds();
      expect(new Set(processed).size).toBe(processed.length);
    });

    it('8. partial last page → fully processed', async () => {
      const users = makeUsers(pageSize * 2 + 11);
      const res = await run({ users, prefs: prefsFor(users) });
      const tail = users.slice(pageSize * 2); // 11 remaining
      const processed = new Set(res.processedIds());
      for (const u of tail) expect(processed.has(u.id)).toBe(true);
      expect(res.processedIds().length).toBe(users.length);
    });

    it('9. zero users → clean termination with empty result', async () => {
      const res = await run({ users: [], prefs: [] });
      expect(res.findManyCalls().length).toBe(1);
      expect(res.processedIds().length).toBe(0);
      expect(res.sent).toBe(0);
      expect(res.errors).toBe(0);
      if (weeklyStyle) {
        expect(res.totalEligible).toBe(0);
      } else {
        expect(res.skipped).toBe(0);
      }
    });

    it('10. repeated run → no duplicate sends (existing idempotency intact)', async () => {
      const users = makeUsers(pageSize + 3);
      const state = { users, prefs: prefsFor(users) };

      if (weeklyStyle) {
        const eligible = users.map(u => ({ ...u, name: null, plan: 'FREE' }));
        const first = await runWeeklyHarness({ eligible });
        expect(first.sent).toBe(users.length);
        _claims = first.claims; // persisted WeeklyEmailLog rows from run 1
        const second = await runWeeklyHarness({ eligible });
        expect(second.sent).toBe(0);
        expect(second.idempotentSkips).toBe(users.length);
        _claims = null;
      } else {
        const first = await run(state);
        expect(first.sentIds().length).toBe(users.length);
        // Second run the same day: the scheduler gate reports duplicate
        _canSend.mockResolvedValue({ allowed: false, reason: 'duplicate' });
        _sendNotification.mockClear();
        const second = await run(state);
        expect(second.sent).toBe(0);
        expect(_sendNotification).not.toHaveBeenCalled(); // no duplicate push
        _canSend.mockResolvedValue({ allowed: true });
      }
    });

    it('11. records inserted/removed mid-batch → safe, no repeats, no infinite loop', async () => {
      if (weeklyStyle) {
        const users = makeUsers(pageSize * 2);
        const eligible = users.map(u => ({ ...u, name: null, plan: 'FREE' }));
        const claims = new Set<string>();
        let fetchCount = 0;
        const keysetFind = makeKeysetFinder(() => eligible as Row[], 'id');
        const wrapped = vi.fn(async (args: KeysetQuery) => {
          const rows = await keysetFind(args);
          fetchCount++;
          if (fetchCount === 2) {
            // Insert AFTER the current cursor → picked up on the next page
            eligible.push({ id: 'u-zzzzz-new-after', email: 'new-after@example.com', name: null, plan: 'FREE' });
            // Insert BEFORE the cursor → keyset never looks back; it will
            // be picked up by the NEXT run (no repeat, no loop)
            eligible.push({ id: 'u-00000-before', email: 'before@example.com', name: null, plan: 'FREE' });
          }
          return rows;
        });
        CURRENT_DB = {
          user: { findMany: wrapped },
          habitLog: { findMany: vi.fn(async () => []) },
          weeklyEmailLog: {
            create: vi.fn(async (args: any) => {
              const k = `${args.data.userId}|${args.data.weekKey}`;
              if (claims.has(k)) { const e: any = new Error('dup'); e.code = 'P2002'; throw e; }
              claims.add(k);
              return args;
            }),
            deleteMany: vi.fn(async () => ({ count: 1 })),
          },
        };
        const { sendWeeklyRecaps } = await import('@/lib/weekly-recap-sender');
        const result = await sendWeeklyRecaps();
        // all original users + the after-cursor insert processed
        expect(result.totalEligible).toBe(users.length + 1);
        const emailed = _resendSend.mock.calls.map((c: any[]) => c[0].to);
        expect(emailed).toContain('new-after@example.com');
        expect(emailed).not.toContain('before@example.com');
        expect(new Set(emailed).size).toBe(emailed.length); // no duplicates
      } else {
        // A user opts out between page fetches → they fall out of the
        // where clause and are safely skipped; a new user inserted after
        // the cursor IS picked up; no repeats; the loop terminates.
        const users = makeUsers(pageSize * 2);
        const victim = users[pageSize + 5].id;
        const state: ReminderState = { users, prefs: prefsFor(users) };
        state.mutateAfterFirstPage = () => {
          // opt-out: remove the candidate row (the DB would filter it out)
          const pi = state.prefs.findIndex(p => p.userId === victim);
          if (pi >= 0) state.prefs.splice(pi, 1);
          const ui = state.users.findIndex(u => u.id === victim);
          if (ui >= 0) state.users.splice(ui, 1);
          // insert after the cursor → must appear on a later page
          state.users.push({ id: 'u-zzzzz-new', email: 'new@example.com' });
          state.prefs.push({
            userId: 'u-zzzzz-new',
            timezone: 'Europe/Madrid',
            pushEnabled: true,
            ...(flagField ? { [flagField]: true } : {}),
          } as ReminderState['prefs'][number]);
        };
        const res = await run(state);
        expect(res.processedIds()).not.toContain(victim);           // opted out → skipped
        expect(res.processedIds()).toContain('u-zzzzz-new');        // late insert → processed
        expect(new Set(res.processedIds()).size).toBe(res.processedIds().length); // no repeats
        const expected = users.filter(u => u.id !== victim).map(u => u.id).concat('u-zzzzz-new');
        expect(new Set(res.processedIds())).toEqual(new Set(expected));
      }
    });

    it('12. existing eligibility filters preserved in the paged query', async () => {
      const users = makeUsers(5);
      const res = await run({ users, prefs: prefsFor(users) });
      const where = res.findManyCalls()[0].where as Record<string, any>;

      if (weeklyStyle) {
        expect(where.weeklyEmailSummary).toBe(true);
        expect(where.emailVerified).toBe(true);
        expect(Array.isArray(where.OR)).toBe(true);
        expect(where.OR.length).toBe(5);
        for (const branch of where.OR) {
          const some = Object.values(branch)[0] as any;
          const inner = Object.values(some)[0] as any;
          const cond = Object.values(inner)[0] as any;
          expect(cond.gte).toBeInstanceOf(Date);
        }
      } else if (batch === 'daily-reminder') {
        expect(where).toEqual({ dailyReminders: true });
      } else if (batch === 'checkin-reminder') {
        expect(where).toEqual({ pushEnabled: true, checkinReminders: true });
      } else if (batch === 'reflection-reminder') {
        expect(where).toEqual({ pushEnabled: true, reflectionReminders: true });
      }
    });
  });
}

// ─── Timezone windows: pin the clock to each batch's send window ───
// 2026-07-15 is CEST (UTC+2) in Madrid:
//   daily      12:00–15:00 local → 11:00 UTC = 13:00 local ✓
//   checkin    07:00–10:00 local → 05:30 UTC = 07:30 local ✓
//   reflection 18:00–21:00 local → 16:30 UTC = 18:30 local ✓
// Only `Date` is faked; setTimeout is stubbed to run immediately so the
// per-user rate-limit delays don't slow the suite.

function pinClock(isoUtc: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(isoUtc));
  vi.stubGlobal('setTimeout', (cb: () => void) => { cb(); return 0 as unknown as ReturnType<typeof setTimeout>; });
}

// ─── Instantiate the spec suite for each affected batch ───

describe('FASE 18 — N-04 batch pagination (notifications/reminders/recaps)', () => {
  beforeEach(() => {
    _canSend = vi.fn().mockResolvedValue({ allowed: true });
    _sendNotification = vi.fn().mockResolvedValue({ success: true, logId: 'log-1' });
    _resendSend = vi.fn().mockResolvedValue({ data: { id: 'resend-1' } });
    _claims = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    CURRENT_DB = undefined;
  });

  describe('daily reminder batch (fixed take was 100, User table)', () => {
    beforeEach(() => pinClock('2026-07-15T11:00:00Z'));
    defineSpecSuite('daily-reminder', runDailyHarness, USERS_PAGE, false, undefined, 'id');
  });

  describe('checkin reminder batch (fixed take was 100, NotificationPreference table)', () => {
    beforeEach(() => pinClock('2026-07-15T05:30:00Z'));
    defineSpecSuite('checkin-reminder', runCheckinHarness, USERS_PAGE, false, 'checkinReminders');
  });

  describe('reflection reminder batch (fixed take was 100, NotificationPreference table)', () => {
    beforeEach(() => pinClock('2026-07-15T16:30:00Z'));
    defineSpecSuite('reflection-reminder', runReflectionHarness, USERS_PAGE, false, 'reflectionReminders');
  });

  describe('weekly recap batch (fixed take was 500, User table)', () => {
    beforeEach(() => pinClock('2026-07-15T10:00:00Z'));
    defineSpecSuite(
      'weekly-recap',
      (state) => runWeeklyHarness({ eligible: state.users.map(u => ({ ...u, name: null, plan: 'FREE' })) }),
      WEEKLY_PAGE,
      true,
      undefined,
      'id'
    );
  });
});
