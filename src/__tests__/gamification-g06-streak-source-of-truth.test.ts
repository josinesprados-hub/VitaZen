/**
 * FASE 14 — G-06: unify the streak source of truth.
 *
 * Root cause fixed: two streak families coexisted. STORED counters
 * (HabitLog.streak, EmpireProgress.streak) are incremented on activity and
 * never touched by inactivity, and several consumers read them naked —
 * presenting a FROZEN value as the "current streak" days or weeks after the
 * last real action (dashboard "12d", disciplina "🔥 20", weekly recap,
 * Mentor prompt, achievements). CALCULATED streaks (calcStreakFromKeys)
 * were always current but only existed for modules with per-day history.
 *
 * Source of truth implemented (src/lib/streaks.ts):
 *     current = isAlive(lastRealActivity) ? storedCount : 0
 * with aliveness ALWAYS derived from real activity (never from the counter,
 * never from a cron, never from a page visit), using the same Madrid grace
 * windows the write paths already enforce (daily: today/yesterday — the
 * calcStreakFromKeys grace; weekly < 14d; monthly < 60d — H-8 windows).
 * Stored fields remain as caches; nothing is rewritten; history is intact.
 *
 * The 23 mandatory G-06 tests:
 *   1–4   calcStreakFromKeys: basic/broken/inactive/resumed (pure activity)
 *   5     stored habit streak obsolete does not prevail
 *   6     stored EmpireProgress.streak obsolete does not prevail
 *   7     multiple habits (one active today, one stale) never mix semantics
 *   8     per-habit individual streak (GET /api/habits)
 *   9     global disciplina/mente/riqueza/energia streaks (GET /api/empire)
 *   10    weekly recap uses the current streak
 *   11    Mentor uses the current streak
 *   12    streak achievements receive the correct value
 *   13    DST spring (23h Madrid day) boundaries
 *   14    DST autumn (25h Madrid day) boundaries
 *   15    Madrid midnight boundaries (CEST/CET) on normal days
 *   16    query after days without opening the app (no cron needed)
 *   17    concurrent completions keep coherence (advisory lock)
 *   18    undo keeps streak coherence
 *   19    delete keeps streak coherence (G-04 semantics kept)
 *   20    regression G-01: onboarding +25 XP exactly once
 *   21    regression G-02: approved backdating window
 *   22    regression G-03: meditation XP once per Madrid day
 *   23    regression G-04: fresh habit completion pays 0 XP
 *
 * Test strategy (same as G-03/G-04): route-level tests mock @/lib/db,
 * @/lib/auth, @/lib/rate-limit and the fire-and-forget side effects.
 * getTodayDateKey is mocked (mutable) at BOTH specifier paths; every other
 * Madrid conversion (startOfMadridDay, madridDayBoundaries,
 * addDaysToDateKey, daysBetweenDateKeys, getMadridDateKey) stays REAL.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_0 = '2026-09-06'; // Sunday  (day before yesterday)
const DAY_1 = '2026-09-07'; // Monday  (fixed "today")
const DAY_2 = '2026-09-08'; // Tuesday (tomorrow relative to DAY_1)

function dayKey(offsetFromDay1: number): string {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1)).toISOString().slice(0, 10);
}

// Instants whose Madrid day is unambiguous (September = CEST, UTC+2):
// 10:00Z → 12:00 Madrid of the same calendar day.
function noonUTC(offsetFromDay1: number): Date {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1, 10, 0, 0));
}

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-09-07' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValue([]),
    habitLog: {
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
      update: vi.fn(),
    },
    meditationSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    onboardingData: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    habitLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
    },
    empireProgress: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    meditationSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    financeLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    wellnessLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    nutritionLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
    },
    dailyCheckin: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    journalEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    aIThread: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ name: 'Test', plan: 'free' }),
    },
    monthlyClosure: {
      count: vi.fn().mockResolvedValue(0),
    },
    achievement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userChallenge: {
      count: vi.fn().mockResolvedValue(0),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const getAuthUserMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
    getAuthUserBasicMock,
    getAuthUserMock,
    rateLimitMock,
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
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/challenge-auto-complete', () => ({
  tryAutoCompleteChallenge: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/widgets/triggers', () => ({
  onHabitChange: vi.fn().mockResolvedValue(undefined),
  onMeditationChange: vi.fn().mockResolvedValue(undefined),
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
}));

// Mock ONLY "today" (mutable so day-change tests can advance the clock);
// keep the real Madrid conversion utilities (startOfMadridDay,
// madridDayBoundaries, addDaysToDateKey, daysBetweenDateKeys, calcStreak*).
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

// ─── Shared helpers ──────────────────────────────────────────

import { calcStreakFromKeys } from '@/lib/dates';
import {
  currentHabitStreak,
  currentMaxHabitStreak,
  gateEmpireStreak,
  isHabitStreakAlive,
} from '@/lib/streaks';
import { madridDayBoundaries, startOfMadridDay } from '@/lib/dates';
import { checkLogDateWindow } from '@/lib/log-date-window';
import { addDaysToDateKey } from '@/lib/dates';

function makeRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function habitRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'habit-1',
    userId: 'user-1',
    name: 'Leer 20 minutos',
    description: null,
    frequency: 'daily',
    streak: 0,
    lastCompletedAt: null,
    createdAt: noonUTC(-2), // created before today → paying completion
    updatedAt: noonUTC(-2),
    ...overrides,
  };
}

function rawSqlCalls(): string[] {
  return H.MOCK_TX.$executeRaw.mock.calls.map((c: any[]) => (c[0] as string[]).join(' '));
}
function empireSqlCalls(): string[] {
  return rawSqlCalls().filter((sql) => sql.includes('EmpireProgress'));
}
function lockCalls(): any[][] {
  return H.MOCK_TX.$executeRaw.mock.calls.filter((c: any[]) =>
    (c[0] as string[]).join(' ').includes('pg_advisory_xact_lock'),
  );
}
function xpIncrements(): number[] {
  return H.empireProgressUpsert.mock.calls.map(
    (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
  );
}

function defaultAuth() {
  H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
  H.getAuthUserMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
  H.rateLimitMock.mockResolvedValue({ limited: false });
}

// ─── Tests 1–4: calcStreakFromKeys — the pure activity-derived streak ──
//
// F-5A FIX (test determinism): calcStreakFromKeys resolves "today" through
// the REAL internal getTodayDateKey of dates.ts (a vi.mock of the exported
// specifier cannot redirect that internal binding), so these tests were
// accidentally coupled to the system clock: with DAY_1 hardcoded to
// 2026-09-07 they passed only when the suite ran on 2026-09-07. The clock is
// now pinned with Vitest fake timers faking ONLY Date (timers stay real, so
// promises/awaits are unaffected): noon UTC of 2026-09-07 → Madrid date key
// 2026-09-07 = DAY_1 for every run. The clock is restored after each test.

describe('G-06 — calcStreakFromKeys derives the streak from real activity (Europe/Madrid)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-07T12:00:00.000Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. three consecutive active days → streak 3 (CASE 1)', () => {
    const activeDays = new Set([dayKey(-2), dayKey(-1), dayKey(0)]);
    expect(calcStreakFromKeys(activeDays)).toBe(3);
  });

  it('2. no activity on day 4, query on day 5 → 0, not 3 (CASE 2)', () => {
    // Active on Madrid days 1,2,3 (dayKey -4..-2). Day 4 (yesterday) had NO
    // activity and today (day 5) has none either: the chain is dead.
    const activeDays = new Set([dayKey(-4), dayKey(-3), dayKey(-2)]);
    expect(calcStreakFromKeys(activeDays)).toBe(0);
  });

  it('3. several days of inactivity → 0 (CASE 3)', () => {
    const activeDays = new Set([dayKey(-9), dayKey(-8), dayKey(-7)]);
    expect(calcStreakFromKeys(activeDays)).toBe(0);
  });

  it('4. resuming after a break → streak restarts at 1 (CASE 3/4)', () => {
    const activeDays = new Set([dayKey(-4), dayKey(-3), dayKey(-2), dayKey(0)]);
    expect(calcStreakFromKeys(activeDays)).toBe(1);
  });
});

// ─── Tests 5–6: stored counters never prevail over real activity ──

describe('G-06 — stored streaks are caches gated by real activity (src/lib/streaks.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
  });

  it('5. stored habit streak 20 with the last completion 5 days ago → current 0 (CASE 4)', () => {
    const stored = { streak: 20, lastCompletedAt: noonUTC(-5), frequency: 'daily' };
    expect(isHabitStreakAlive(stored.lastCompletedAt, stored.frequency)).toBe(false);
    expect(currentHabitStreak(stored)).toBe(0);
    // While the chain is alive the stored count is the honest cache:
    expect(currentHabitStreak({ streak: 20, lastCompletedAt: noonUTC(0), frequency: 'daily' })).toBe(20);
    expect(currentHabitStreak({ streak: 20, lastCompletedAt: noonUTC(-1), frequency: 'daily' })).toBe(20);
    // Frequency-aware grace windows (H-8 continuation rules):
    expect(currentHabitStreak({ streak: 5, lastCompletedAt: noonUTC(-10), frequency: 'weekly' })).toBe(5);
    expect(currentHabitStreak({ streak: 5, lastCompletedAt: noonUTC(-15), frequency: 'weekly' })).toBe(0);
    expect(currentHabitStreak({ streak: 5, lastCompletedAt: noonUTC(-59), frequency: 'monthly' })).toBe(5);
    expect(currentHabitStreak({ streak: 5, lastCompletedAt: noonUTC(-60), frequency: 'monthly' })).toBe(0);
    // Max across habits skips dead chains:
    expect(currentMaxHabitStreak([
      { streak: 20, lastCompletedAt: noonUTC(-5), frequency: 'daily' },
      { streak: 3, lastCompletedAt: noonUTC(0), frequency: 'daily' },
    ])).toBe(3);
  });

  it('6. stored EmpireProgress.streak obsolete does not prevail (CASE 4/6)', () => {
    // Last real activity 2+ Madrid days ago → the frozen counter is NOT current.
    expect(gateEmpireStreak(20, noonUTC(-5))).toBe(0);
    expect(gateEmpireStreak(20, noonUTC(-2))).toBe(0);
    // Yesterday with the day still open → grace, same as calcStreakFromKeys.
    expect(gateEmpireStreak(20, noonUTC(-1))).toBe(20);
    expect(gateEmpireStreak(20, noonUTC(0))).toBe(20);
    // No activity at all → 0 regardless of the stored value.
    expect(gateEmpireStreak(20, null)).toBe(0);
    // Never negative.
    expect(gateEmpireStreak(-3, noonUTC(0))).toBe(0);
  });
});

// ─── Tests 13–15: Europe/Madrid day boundaries and DST ─────────

describe('G-06 — madridDayBoundaries is exact on DST transitions and Madrid midnights', () => {
  it('13. spring transition: 2026-03-29 is a 23-hour Madrid day (CASE 6)', () => {
    const { start, end } = madridDayBoundaries('2026-03-29');
    expect(start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3600000).toBe(23);
  });

  it('14. autumn transition: 2026-10-25 is a 25-hour Madrid day (CASE 6)', () => {
    const { start, end } = madridDayBoundaries('2026-10-25');
    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect((end.getTime() - start.getTime()) / 3600000).toBe(25);
  });

  it('15. normal days: start/end are the true Madrid midnights (CEST and CET)', () => {
    // Summer (CEST, UTC+2): Madrid midnight = 22:00 UTC of the previous day.
    const summer = madridDayBoundaries('2026-09-08');
    expect(summer.start.toISOString()).toBe('2026-09-07T22:00:00.000Z');
    expect(summer.end.toISOString()).toBe('2026-09-08T22:00:00.000Z');
    // Winter (CET, UTC+1): Madrid midnight = 23:00 UTC of the previous day.
    const winter = madridDayBoundaries('2026-01-15');
    expect(winter.start.toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(winter.end.toISOString()).toBe('2026-01-15T23:00:00.000Z');
    // The end is ALWAYS the start of the next Madrid day (24h here) —
    // and on the transition days the tests above prove 23h/25h spans.
    expect(summer.end.getTime()).toBe(startOfMadridDay(addDaysToDateKey('2026-09-08', 1)).getTime());
    expect((summer.end.getTime() - summer.start.getTime()) / 3600000).toBe(24);
  });
});

// ─── Test 21: regression G-02 — approved backdating window ─────

describe('G-06 — regression G-02: log date window (today/yesterday/day-before only)', () => {
  it('21. future dates and >2 days back stay rejected; the approved window stays open', () => {
    expect(checkLogDateWindow(DAY_1, DAY_1)).toEqual({ ok: true });
    expect(checkLogDateWindow(DAY_0, DAY_1)).toEqual({ ok: true });
    expect(checkLogDateWindow('2026-09-05', DAY_1)).toEqual({ ok: true }); // day before yesterday
    expect(checkLogDateWindow('2026-09-04', DAY_1)).toEqual({ ok: false, reason: 'too_old' });
    expect(checkLogDateWindow(DAY_2, DAY_1)).toEqual({ ok: false, reason: 'future' });
  });
});

// ─── Tests 7, 16: GET /api/dashboard/streaks ────────────────────

describe('G-06 — GET /api/dashboard/streaks presents only activity-true streaks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    // F-5A FIX (test determinism): same fake clock as tests 1–4 — the streak
    // helpers resolve "today" through the internal real getTodayDateKey, so
    // the suite must pin the system Date to DAY_1 noon UTC instead of relying
    // on the wall clock. Restored after each test.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-07T12:00:00.000Z') });
    defaultAuth();
    H.MOCK_DB.meditationSession.findMany.mockResolvedValue([]);
    H.MOCK_DB.habitLog.findMany.mockResolvedValue([]);
    H.MOCK_DB.journalEntry.findMany.mockResolvedValue([]);
    H.MOCK_DB.dailyCheckin.findMany.mockResolvedValue([]);
    H.MOCK_DB.wellnessLog.findMany.mockResolvedValue([]);
    H.MOCK_DB.nutritionLog.findMany.mockResolvedValue([]);
  });

  it('7. two habits (one alive today, one stale for a month) → habitStreak is the ALIVE one (CASE 5)', async () => {
    H.MOCK_DB.meditationSession.findMany.mockResolvedValue([{ completedAt: noonUTC(0) }]);
    H.MOCK_DB.habitLog.findMany.mockResolvedValue([
      { streak: 12, lastCompletedAt: noonUTC(0), frequency: 'daily' },   // completed today
      { streak: 45, lastCompletedAt: noonUTC(-30), frequency: 'daily' }, // frozen 30 days ago
    ]);

    const { GET } = await import('@/app/api/dashboard/streaks/route');
    const res = await GET(makeRequest('/api/dashboard/streaks', 'GET') as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    // The stored 45 must NOT masquerade as current; the alive 12 wins.
    expect(data.habitStreak).toBe(12);
    expect(data.meditationStreak).toBe(1);
  });

  it('16. user inactive for days queries the dashboard → every streak reads 0 with no cron (CASE 7)', async () => {
    // All activity exists but is weeks old; nothing has been "reset" in the DB.
    H.MOCK_DB.meditationSession.findMany.mockResolvedValue([{ completedAt: noonUTC(-20) }]);
    H.MOCK_DB.habitLog.findMany.mockResolvedValue([
      { streak: 30, lastCompletedAt: noonUTC(-25), frequency: 'daily' },
    ]);
    H.MOCK_DB.journalEntry.findMany.mockResolvedValue([{ createdAt: noonUTC(-18) }]);
    H.MOCK_DB.dailyCheckin.findMany.mockResolvedValue([{ date: noonUTC(-22) }]);
    H.MOCK_DB.wellnessLog.findMany.mockResolvedValue([{ date: noonUTC(-15) }]);
    H.MOCK_DB.nutritionLog.findMany.mockResolvedValue([{ date: noonUTC(-15) }]);

    const { GET } = await import('@/app/api/dashboard/streaks/route');
    const res = await GET(makeRequest('/api/dashboard/streaks', 'GET') as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.meditationStreak).toBe(0);
    expect(data.habitStreak).toBe(0);
    expect(data.journalStreak).toBe(0);
    expect(data.checkinStreak).toBe(0);
    expect(data.wellnessStreak).toBe(0);
    expect(data.nutritionStreak).toBe(0);
    expect(data.generalStreak).toBe(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

// ─── Test 8: GET /api/habits — individual per-habit streaks ─────

describe('G-06 — GET /api/habits returns per-habit CURRENT streaks (CASE 5/8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    defaultAuth();
  });

  it('8. alive daily shows its count; stale daily reads 0; weekly inside its window stays alive', async () => {
    H.MOCK_DB.habitLog.findMany.mockResolvedValue([
      habitRow({ id: 'h1', streak: 3, lastCompletedAt: noonUTC(0), frequency: 'daily' }),
      habitRow({ id: 'h2', streak: 20, lastCompletedAt: noonUTC(-5), frequency: 'daily' }),
      habitRow({ id: 'h3', streak: 4, lastCompletedAt: noonUTC(-10), frequency: 'weekly' }),
    ]);

    const { GET } = await import('@/app/api/habits/route');
    const res = await GET(makeRequest('/api/habits', 'GET') as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.habits[0].streak).toBe(3);   // completed today → alive
    expect(data.habits[1].streak).toBe(0);   // completed 5 days ago → dead (stored 20 not imposed)
    expect(data.habits[2].streak).toBe(4);   // weekly, 10 days ago < 14 → still extendable
  });
});

// ─── Test 9: GET /api/empire — per-empire global streaks ────────

describe('G-06 — GET /api/empire gates each stored empire streak by its real activity (CASE 5/9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    defaultAuth();
    H.MOCK_DB.empireProgress.findMany.mockResolvedValue([
      { empire: 'disciplina', xp: 250, streak: 8 },
      { empire: 'mente', xp: 90, streak: 5 },
      { empire: 'riqueza', xp: 40, streak: 3 },
      { empire: 'energia', xp: 30, streak: 4 },
      { empire: 'crecimiento', xp: 55, streak: 0 },
    ]);
    // Same day definitions the write paths use:
    H.MOCK_DB.habitLog.findFirst.mockResolvedValue({ lastCompletedAt: noonUTC(-1) });      // yesterday
    H.MOCK_DB.meditationSession.findFirst.mockResolvedValue({ completedAt: noonUTC(-6) }); // 6 days ago
    H.MOCK_DB.financeLog.findFirst.mockResolvedValue({ createdAt: noonUTC(-1) });          // yesterday
    H.MOCK_DB.wellnessLog.findFirst.mockResolvedValue({ date: noonUTC(-1) });              // yesterday
    H.MOCK_DB.nutritionLog.findFirst.mockResolvedValue(null);
  });

  it('9. alive chains keep their count; stale mente reads 0; XP untouched', async () => {
    const { GET } = await import('@/app/api/empire/route');
    const res = await GET(makeRequest('/api/empire', 'GET') as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    const byEmpire = Object.fromEntries(data.empires.map((e: any) => [e.empire, e]));
    expect(byEmpire.disciplina.streak).toBe(8); // any habit completed yesterday → alive
    expect(byEmpire.mente.streak).toBe(0);      // last meditation 6 days ago → frozen 5 dies
    expect(byEmpire.riqueza.streak).toBe(3);    // last finance log yesterday (createdAt) → alive
    expect(byEmpire.energia.streak).toBe(4);    // last wellness log yesterday (date) → alive
    expect(byEmpire.crecimiento.streak).toBe(0); // no streak write path exists
    // XP economy untouched by G-06:
    expect(byEmpire.disciplina.xp).toBe(250);
    expect(byEmpire.mente.xp).toBe(90);
  });
});

// ─── Test 10: weekly recap uses the current streak ──────────────

describe('G-06 — weekly recap (insights engine) uses the current streak (CASE 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
  });

  it('10. topStreak skips dead chains; bestEmpireStreak skips stale empires', async () => {
    const { generateWeeklyInsights } = await import('@/lib/insights');

    const result = await generateWeeklyInsights('user-1', 'FREE', {
      thisWeekCheckins: [], prevWeekCheckins: [],
      thisWeekHabits: [], prevWeekHabits: [],
      allHabits: [
        { name: 'Lecturas', streak: 12, lastCompletedAt: noonUTC(0), frequency: 'daily' },
        { name: 'Inglés', streak: 9, lastCompletedAt: noonUTC(-20), frequency: 'daily' },
      ],
      thisWeekMeditations: [], prevWeekMeditations: [],
      thisWeekJournals: [], prevWeekJournals: [],
      thisWeekWellness: [], prevWeekWellness: [],
      thisWeekNutrition: [], prevWeekNutrition: [],
      thisWeekFinance: [], prevWeekFinance: [],
      empireProgress: [
        { empire: 'mente', xp: 60, streak: 5 },
        { empire: 'riqueza', xp: 30, streak: 3 },
      ],
      totalActiveHabits: 2,
      lastMeditation: { completedAt: noonUTC(-6) },                        // mente dead
      lastFinance: { createdAt: noonUTC(-1) },                             // riqueza alive
      lastWellness: null, lastNutrition: null,
      lastHabitCompletion: { lastCompletedAt: noonUTC(0) },                // disciplina alive
    });

    expect(result.summary.habits.topStreak).toBe(12);
    expect(result.summary.habits.topHabit).toBe('Lecturas'); // the 9-day dead chain is skipped
    expect(result.summary.streaks.bestEmpireStreak).toBe(3);
    expect(result.summary.streaks.bestEmpireName).toBe('Finanzas'); // EMPIRE_NAMES['riqueza']
  });
});

// ─── Test 11: Mentor context uses the current streak ────────────

describe('G-06 — Mentor context quotes only activity-true streaks (CASE 5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    defaultAuth();
    H.MOCK_DB.dailyCheckin.findMany.mockResolvedValue([]);
    H.MOCK_DB.meditationSession.findMany.mockResolvedValue([]);
    H.MOCK_DB.journalEntry.findMany.mockResolvedValue([]);
    H.MOCK_DB.aIThread.findMany.mockResolvedValue([]);
    H.MOCK_DB.user.findUnique.mockResolvedValue({ name: 'Test', plan: 'free' });
    H.MOCK_DB.habitLog.findMany.mockResolvedValue([
      habitRow({ id: 'a', name: 'Leer', streak: 12, lastCompletedAt: noonUTC(0), frequency: 'daily' }),
      habitRow({ id: 'b', name: 'Correr', streak: 40, lastCompletedAt: noonUTC(-30), frequency: 'daily' }),
    ]);
  });

  it('11. frozen chains are excluded from the prompt; the alive count is quoted', async () => {
    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');

    const ctx = await buildMentorContext('user-1', 'FREE');
    expect(ctx.habitStreaks).toHaveLength(1);
    expect(ctx.habitStreaks[0].name).toBe('Leer');
    expect(ctx.habitStreaks[0].streak).toBe(12);

    const prompt = formatContextForPrompt(ctx);
    expect(prompt).toContain('12 días');
    expect(prompt).not.toContain('40');
  });
});

// ─── Test 12: streak achievements receive the correct value ─────

describe('G-06 — streak achievements read the CURRENT max habit streak (CASE 4/12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    defaultAuth();
  });

  it('12. habits_steady_14 / hidden_habit_steady_30 use the alive chain, not the frozen 45', async () => {
    H.MOCK_DB.habitLog.count.mockResolvedValue(2);
    H.MOCK_DB.habitLog.findMany.mockResolvedValue([
      { streak: 16, lastCompletedAt: noonUTC(0), frequency: 'daily' },   // alive 16
      { streak: 45, lastCompletedAt: noonUTC(-40), frequency: 'daily' }, // dead
    ]);

    const { calculateProgress } = await import('@/lib/achievements');
    const progress = await calculateProgress('user-1');

    expect(progress.habits_first).toBe(1);
    expect(progress.habits_5).toBe(2);
    expect(progress.habits_steady_14).toBe(14);       // min(16, 14)
    expect(progress.hidden_habit_steady_30).toBe(16); // NOT 30 (frozen 45 would say 30)
  });
});

// ─── Tests 17–19, 23: habit write paths keep their coherence ────

describe('G-06 — habit write paths keep streak coherence under concurrency (G-04 semantics intact)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    defaultAuth();
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null); // first completion of the day
    H.MOCK_TX.$queryRaw.mockResolvedValue([]);
    H.MOCK_TX.habitLog.update.mockResolvedValue({});
  });

  it('17. two concurrent completions serialize: one +1, the other already_completed (CASE 5)', async () => {
    const v1 = habitRow({ streak: 0, lastCompletedAt: null });
    H.MOCK_TX.$queryRaw.mockResolvedValueOnce([v1]);
    H.MOCK_TX.habitLog.update.mockResolvedValueOnce({ ...v1, streak: 1, lastCompletedAt: noonUTC(0) });
    const { PATCH } = await import('@/app/api/habits/route');

    const r1 = await PATCH(makeRequest('/api/habits', 'PATCH', { habitId: 'habit-1' }) as any);
    expect(r1.status).toBe(200);

    // Second request arrives after the first committed: SELECT FOR UPDATE
    // now sees lastCompletedAt = today → blocked, no second increment.
    const v2 = { ...v1, streak: 1, lastCompletedAt: noonUTC(0) };
    H.MOCK_TX.$queryRaw.mockResolvedValueOnce([v2]);
    const r2 = await PATCH(makeRequest('/api/habits', 'PATCH', { habitId: 'habit-1' }) as any);
    expect(r2.status).toBe(400);

    // One advisory lock per completion request; empire streak modified once.
    // G-07 FIX: first completion with no yesterday activity (mocked) → the
    // global streak is explicitly SET to 1 (was: blind { increment: 1 }).
    expect(lockCalls()).toHaveLength(2);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    expect((H.empireProgressUpsert.mock.calls[0][0].update as any).streak).toEqual(1);
  });

  it('18. undo decrements habit + empire streak and answers with the CURRENT streak', async () => {
    const habit = habitRow({ streak: 3, lastCompletedAt: noonUTC(0) });
    H.MOCK_TX.$queryRaw.mockResolvedValue([habit]);
    H.MOCK_TX.habitLog.update.mockResolvedValue({ ...habit, streak: 2, lastCompletedAt: noonUTC(-1) });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null); // it was the only completion today

    const { POST: UNDO } = await import('@/app/api/habits/undo/route');
    const res = await UNDO(makeRequest('/api/habits/undo', 'POST', {
      habitId: 'habit-1',
      previousLastCompletedAt: noonUTC(-1).toISOString(),
    }) as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    // Restored lastCompletedAt is yesterday → chain still alive → current 2.
    expect(data.habit.streak).toBe(2);
    expect(H.MOCK_TX.habitLog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ streak: 2 }) }),
    );
    // Empire streak decremented atomically (sole completion of today).
    const empireStreakDecrement = empireSqlCalls().find((s) => s.includes('GREATEST(0, "streak" - 1)'));
    expect(empireStreakDecrement).toBeTruthy();
    expect(lockCalls()).toHaveLength(1);
  });

  it('19. delete of the sole completion of today decrements the empire streak and NEVER touches XP', async () => {
    const row = habitRow({ streak: 4, lastCompletedAt: noonUTC(0) });
    H.MOCK_DB.habitLog.findFirst.mockResolvedValue(row);
    H.MOCK_TX.habitLog.deleteMany.mockResolvedValue({ count: 1 });
    H.MOCK_TX.habitLog.findFirst.mockResolvedValue(null); // no other habit completed today

    const { DELETE } = await import('@/app/api/habits/route');
    const res = await DELETE(makeRequest('/api/habits', 'DELETE', { habitId: 'habit-1' }) as any);
    expect(res.status).toBe(200);

    const empireStmts = empireSqlCalls();
    expect(empireStmts).toHaveLength(1);
    expect(empireStmts[0]).toContain('GREATEST(0, "streak" - 1)');
    expect(empireStmts[0].toLowerCase()).not.toContain('xp'); // G-04: history XP stays
  });

  it('23. regression G-04: a habit created TODAY pays 0 XP (streak still increments)', async () => {
    const fresh = habitRow({ streak: 0, lastCompletedAt: null, createdAt: new Date('2026-09-07T08:00:00Z') });
    H.MOCK_TX.$queryRaw.mockResolvedValue([fresh]);
    H.MOCK_TX.habitLog.update.mockResolvedValue({ ...fresh, streak: 1, lastCompletedAt: noonUTC(0) });

    const { PATCH } = await import('@/app/api/habits/route');
    const res = await PATCH(makeRequest('/api/habits', 'PATCH', { habitId: 'habit-1' }) as any);
    expect(res.status).toBe(200);

    expect(xpIncrements()).toEqual([0]); // anti-farming gate intact
    // G-07 FIX: no yesterday activity (mocked) → explicit set to 1.
    expect((H.empireProgressUpsert.mock.calls[0][0].update as any).streak).toEqual(1);
  });
});

// ─── Test 20: regression G-01 — onboarding +25 XP exactly once ──

describe('G-06 — regression G-01: onboarding bonus stays once-only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    defaultAuth();
    H.MOCK_TX.user.updateMany.mockResolvedValue({ count: 1 });
  });

  it('20. replaying the onboarding POST awards +25 XP only on the atomic claim', async () => {
    H.MOCK_TX.user.updateMany
      .mockResolvedValueOnce({ count: 1 })  // first request flips the flag
      .mockResolvedValueOnce({ count: 0 }); // replay matches 0 rows
    H.MOCK_TX.onboardingData.upsert.mockResolvedValue({
      goals: '["cuidarme"]',
      primaryFocus: 'mente',
      stressLevel: 2,
      energyLevel: 3,
      focusLevel: 4,
      initialHabits: '[]',
    });
    const { POST } = await import('@/app/api/onboarding/route');

    const body = { goals: ['cuidarme'], primaryFocus: 'mente', stressLevel: 2, energyLevel: 3, focusLevel: 4, initialHabits: [] };
    const r1 = await POST(makeRequest('/api/onboarding', 'POST', body) as any);
    const r2 = await POST(makeRequest('/api/onboarding', 'POST', body) as any);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert.mock.calls[0][0].update).toEqual({ xp: { increment: 25 } });
  });
});

// ─── Test 22: regression G-03 — meditation XP once per Madrid day ──

describe('G-06 — regression G-03: meditation XP/streak once per Madrid day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_1;
    defaultAuth();
    H.MOCK_TX.meditationSession.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 's1', ...data, completedAt: noonUTC(0),
    }));
  });

  it('22. first session of the day pays +15 and +1 streak; a repeat pays +0 and no streak', async () => {
    H.MOCK_TX.meditationSession.findFirst
      .mockResolvedValueOnce(null)   // first POST: no other session today
      .mockResolvedValueOnce({ id: 's0' }); // second POST: another session exists today

    const { POST } = await import('@/app/api/meditation/route');
    const body = { duration: 10, type: 'mindfulness' };
    const r1 = await POST(makeRequest('/api/meditation', 'POST', body) as any);
    const r2 = await POST(makeRequest('/api/meditation', 'POST', body) as any);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    expect(xpIncrements()).toEqual([15, 0]); // G-03 daily cap intact
    const firstUpdate = H.empireProgressUpsert.mock.calls[0][0].update as any;
    const secondUpdate = H.empireProgressUpsert.mock.calls[1][0].update as any;
    expect(firstUpdate.streak).toEqual({ increment: 1 });
    expect(secondUpdate.streak).toBeUndefined();
    expect(lockCalls()).toHaveLength(2); // advisory lock per POST (G-03)
  });
});
