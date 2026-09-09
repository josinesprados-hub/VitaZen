/**
 * G-10 — F-3: the Journal daily quota (H-05, 5 entries/day, +20 XP each)
 * must use the canonical Europe/Madrid NATURAL day —
 * madridDayBoundaries(todayKey).end — instead of `startOfMadridDay + 24h`.
 *
 * Original defect (confirmed by the G-10 audit at f1113a5):
 *   src/app/api/journal/route.ts (POST quota window):
 *     todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
 *   A Europe/Madrid calendar day is NOT always 24 hours long:
 *     - Autumn DST (2026-10-25, 25-hour day): start+24h landed at 23:00
 *       Madrid of the SAME day. Entries written during the final hour
 *       (23:00–24:00 Madrid) escaped the quota window of BOTH days
 *       (after day-25's buggy end, before day-26's start), so a user
 *       could post unlimited entries in that hour and each still paid
 *       +20 XP — the only reproducible extra-XP vector left open.
 *     - Spring DST (2026-03-29, 23-hour day): start+24h extended 1 hour
 *       INTO the next day (00:00–01:00 Madrid of 2026-03-30), wrongly
 *       counting the first hour of day 30 against day 29's quota. No
 *       extra-XP vector (it over-applies the quota), but still wrong.
 *
 * Fix (this commit): the quota window is exactly
 *     [madridDayBoundaries(todayKey).start, madridDayBoundaries(todayKey).end)
 * — the true Madrid natural day. On normal days it equals start+24h.
 * XP is untouched: +20 per valid entry, max 5 entries/day (100 XP/day).
 *
 * Test strategy (same conventions as gamification-g03/g09):
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   fire-and-forget side effects; the quota COUNT window passed to Prisma
 *   is captured and asserted. Since F-7 the count runs INSIDE the
 *   transaction (after the advisory lock), so it is mocked/captured on the
 *   transaction client — the asserted window/XP semantics are unchanged.
 * - getTodayDateKey is mocked (mutable state) at BOTH specifier paths
 *   (@/lib/dates and @/lib/deterministic) — the relative re-export inside
 *   deterministic.ts must not bypass the mock. getMadridDateKey,
 *   startOfMadridDay and madridDayBoundaries remain REAL (Europe/Madrid
 *   via Intl) so the DST arithmetic is exercised for real.
 * - No sleeps, no fake timers: "the last hour of 2026-10-25" is proven
 *   by instant arithmetic against the captured window, not by waiting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMadridDateKey, madridDayBoundaries } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic route tests ────

const DAY_SPRING = '2026-03-29'; // 23-hour day in Europe/Madrid
const DAY_NORMAL = '2026-09-07'; // ordinary 24-hour day (CEST)
const DAY_AUTUMN = '2026-10-25'; // 25-hour day in Europe/Madrid

// Madrid instants under test (UTC encodings):
//   23:30 Madrid on 2026-10-25 = 22:30Z (CET, UTC+1, after the autumn shift)
const AUTUMN_LAST_HOUR = '2026-10-25T22:30:00Z';
//   00:00 Madrid on 2026-10-26 = 23:00Z on 2026-10-25 — the TRUE end of day 25
const AUTUMN_TRUE_END_UTC = '2026-10-25T23:00:00.000Z';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const state = { todayKey: '2026-10-25' };

  const empireProgressUpsert = vi.fn().mockResolvedValue({});

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    journalEntry: {
      // F-7: the quota count runs inside the transaction (after the advisory
      // lock) — each test pins the number of entries "already" today.
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'je-1',
        ...data,
      })),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
    journalEntry: {
      // No longer used by POST (F-7 moved the quota count into the tx);
      // kept so a regression back to a pre-transaction count is visible.
      count: vi.fn().mockResolvedValue(0),
    },
  };

  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });
  const evaluateAchievementsMock = vi.fn().mockResolvedValue([]);

  return {
    state,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
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

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/journal', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function postEntry(): Promise<Response> {
  const { POST } = await import('@/app/api/journal/route');
  return POST(makeRequest({ title: 'Entrada de prueba' }) as any) as unknown as Response;
}

interface CapturedCountArg {
  where: { userId: string; createdAt: { gte: Date; lt: Date } };
}

/** The quota window the route passed to the Prisma count, as ISO strings + span in hours. */
function capturedWindow(): { gte: string; lt: string; spanHours: number } {
  // F-7: the deciding count is the one inside the transaction.
  const calls = H.MOCK_TX.journalEntry.count.mock.calls as unknown as [CapturedCountArg][];
  expect(calls.length).toBeGreaterThan(0);
  const { where } = calls[calls.length - 1][0];
  const gte = where.createdAt.gte.toISOString();
  const lt = where.createdAt.lt.toISOString();
  const spanHours = (where.createdAt.lt.getTime() - where.createdAt.gte.getTime()) / 3_600_000;
  return { gte, lt, spanHours };
}

function xpIncrements(): number[] {
  return H.empireProgressUpsert.mock.calls.map(
    (c: any[]) => (c[0]?.update?.xp as { increment: number })?.increment,
  );
}

// ─── Sanity: real Europe/Madrid anchors (Intl-backed) ────────

describe('F-3 — anclas reales de Europe/Madrid', () => {
  it('la última hora del 25 es día 25: 22:30Z → 23:30 Madrid (día 25), 22:00Z → 23:00 Madrid (día 25)', () => {
    expect(getMadridDateKey(new Date(AUTUMN_LAST_HOUR))).toBe(DAY_AUTUMN);
    expect(getMadridDateKey(new Date('2026-10-25T22:00:00Z'))).toBe(DAY_AUTUMN);
  });

  it('2026-10-26 00:00 Madrid (2026-10-25T23:00Z) ya es día 26', () => {
    expect(getMadridDateKey(new Date(AUTUMN_TRUE_END_UTC))).toBe('2026-10-26');
  });

  it('primavera: 21:30Z → 23:30 Madrid del día 29; 22:00Z → 00:00 Madrid del día 30', () => {
    expect(getMadridDateKey(new Date('2026-03-29T21:30:00Z'))).toBe(DAY_SPRING);
    expect(getMadridDateKey(new Date('2026-03-29T22:00:00Z'))).toBe('2026-03-30');
  });
});

// ─── F-3 — POST /api/journal quota window ────────────────────

describe('F-3 — la cuota de Journal usa el día natural Europe/Madrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.state.todayKey = DAY_AUTUMN;
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.MOCK_TX.journalEntry.count.mockResolvedValue(0);
    H.MOCK_DB.journalEntry.count.mockClear();
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. otoño 2026-10-25 (25 h): la ventana acaba en la medianoche Madrid real (23:00Z), no en start+24h (22:00Z)', async () => {
    H.state.todayKey = DAY_AUTUMN;
    const res = await postEntry();
    expect(res.status).toBe(200);

    const w = capturedWindow();
    // Buggy end would be 2026-10-25T22:00:00.000Z (start + 24h).
    expect(w.gte).toBe('2026-10-24T22:00:00.000Z');
    expect(w.lt).toBe('2026-10-25T23:00:00.000Z');
    expect(w.spanHours).toBe(25);

    // The last millisecond inside the window is still day 25; the end itself
    // is midnight of day 26.
    expect(getMadridDateKey(new Date(new Date(w.lt).getTime() - 1))).toBe(DAY_AUTUMN);
    expect(getMadridDateKey(new Date(w.lt))).toBe('2026-10-26');

    // The fix does not change XP: a valid entry still pays +20.
    expect(xpIncrements()).toEqual([20]);
  });

  it('2. última hora del 25: una entrada a las 23:30 Madrid cuenta para el día 25 y la sexta es rechazada sin XP', async () => {
    H.state.todayKey = DAY_AUTUMN;

    // The instant is INSIDE the captured day-25 window (this hour escaped
    // under start+24h, whose end was 22:00Z < 22:30Z).
    const t = new Date(AUTUMN_LAST_HOUR);
    expect(getMadridDateKey(t)).toBe(DAY_AUTUMN);

    // 5th entry of the day: accepted and paid.
    H.MOCK_TX.journalEntry.count.mockResolvedValueOnce(4);
    const res5 = await postEntry();
    expect(res5.status).toBe(200);
    const w = capturedWindow();
    expect(t.getTime()).toBeGreaterThanOrEqual(new Date(w.gte).getTime());
    expect(t.getTime()).toBeLessThan(new Date(w.lt).getTime());
    expect(xpIncrements()).toEqual([20]);

    // 6th entry (same Madrid day, final hour): quota rejects without XP.
    H.MOCK_TX.journalEntry.count.mockResolvedValueOnce(5);
    const res6 = await postEntry();
    expect(res6.status).toBe(429);
    expect(xpIncrements()).toEqual([20]); // unchanged — no second payout
  });

  it('3. primavera 2026-03-29 (23 h): la ventana acaba en la medianoche real (22:00Z) y no se extiende al día 30', async () => {
    H.state.todayKey = DAY_SPRING;
    const res = await postEntry();
    expect(res.status).toBe(200);

    const w = capturedWindow();
    // Buggy end would be 2026-03-29T23:00:00.000Z (start + 24h, 1 h into day 30).
    expect(w.gte).toBe('2026-03-28T23:00:00.000Z');
    expect(w.lt).toBe('2026-03-29T22:00:00.000Z');
    expect(w.spanHours).toBe(23);

    expect(getMadridDateKey(new Date(new Date(w.lt).getTime() - 1))).toBe(DAY_SPRING);
    expect(getMadridDateKey(new Date(w.lt))).toBe('2026-03-30');
  });

  it('4. día normal de 24 h: la ventana canónica coincide con start+24h (sin regresión)', async () => {
    H.state.todayKey = DAY_NORMAL;
    const res = await postEntry();
    expect(res.status).toBe(200);

    const w = capturedWindow();
    expect(w.gte).toBe('2026-09-06T22:00:00.000Z');
    expect(w.lt).toBe('2026-09-07T22:00:00.000Z');
    expect(w.spanHours).toBe(24);
  });

  it('5. medianoche del 26 (23:00Z del 25): día 25 agotado → 429; día 26 abre ventana nueva con +20 XP', async () => {
    // Day 25 exhausted (5 entries already exist) — the 429 fires even though
    // the "real clock" is irrelevant: the quota keys off the Madrid day.
    H.state.todayKey = DAY_AUTUMN;
    H.MOCK_TX.journalEntry.count.mockResolvedValueOnce(5);
    const resExhausted = await postEntry();
    expect(resExhausted.status).toBe(429);
    expect(xpIncrements()).toEqual([]);

    // The true end of day 25 is exactly the start of day 26's window.
    const day25 = madridDayBoundaries(DAY_AUTUMN);
    const day26 = madridDayBoundaries('2026-10-26');
    expect(day25.end.toISOString()).toBe(AUTUMN_TRUE_END_UTC);
    expect(day26.start.toISOString()).toBe(AUTUMN_TRUE_END_UTC);

    // First entry of day 26: fresh quota, +20 XP, window starts at the exact
    // instant that closed day 25 (no gap, no overlap).
    H.state.todayKey = '2026-10-26';
    H.MOCK_TX.journalEntry.count.mockResolvedValueOnce(0);
    const res26 = await postEntry();
    expect(res26.status).toBe(200);

    const w = capturedWindow();
    expect(w.gte).toBe(AUTUMN_TRUE_END_UTC);
    expect(w.lt).toBe('2026-10-26T23:00:00.000Z');
    expect(w.spanHours).toBe(24);
    expect(xpIncrements()).toEqual([20]);
  });
});
