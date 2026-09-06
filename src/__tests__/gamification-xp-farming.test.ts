/**
 * FASE 14 — G-01/G-02: XP farming vector closure tests
 *
 * G-01 — POST /api/onboarding:
 *   The +25 XP bonus must be awarded EXACTLY ONCE per user. The gate is an
 *   atomic compare-and-swap on the user row (UPDATE ... WHERE
 *   onboardingCompleted = false): exactly one concurrent/sequential request
 *   can flip the flag and claim the XP; all others match 0 rows and award
 *   +0 XP.
 *
 * G-02 — POST /api/wellness and POST /api/nutrition:
 *   New writes must respect the approved backdating window in
 *   Europe/Madrid: today, yesterday and the day before yesterday are
 *   allowed; older dates and any future date are rejected (400) BEFORE any
 *   DB read/write. Historical records are never touched by this check.
 *
 * Test strategy:
 * - Route-level tests mock @/lib/db, @/lib/auth, @/lib/rate-limit and the
 *   fire-and-forget side effects (same pattern as prod04-session-readonly).
 * - The date-window policy is a pure function (checkLogDateWindow) fed with
 *   explicit Madrid date keys, so DST/boundaries are tested deterministically.
 * - getTodayDateKey is mocked at the unified dates module; getMadridDateKey
 *   and madridDayBoundaries remain REAL (Europe/Madrid via Intl).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkLogDateWindow } from '@/lib/log-date-window';
import { getMadridDateKey, getTodayDateKey } from '@/lib/deterministic';
import { getTodayDateKey as getTodayDateKeyFromDates, daysBetweenDateKeys } from '@/lib/dates';

// ─── Fixed "today" (Madrid) for deterministic route tests ────

const MOCK_TODAY_KEY = '2026-09-07';

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const MOCK_TODAY_KEY_HOISTED = '2026-09-07';

  const empireProgressUpsert = vi.fn().mockResolvedValue({});
  const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

  const MOCK_TX = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    user: {
      updateMany: userUpdateMany,
      update: vi.fn().mockResolvedValue({}),
    },
    onboardingData: {
      upsert: vi.fn().mockResolvedValue({
        goals: '[]',
        primaryFocus: 'mente',
        stressLevel: 3,
        energyLevel: 3,
        focusLevel: 3,
        initialHabits: '[]',
      }),
    },
    habitLog: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    wellnessLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'wl-1', ...create })),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    nutritionLog: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => ({ id: 'nl-1', ...create })),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    empireProgress: {
      upsert: empireProgressUpsert,
    },
  };

  const MOCK_DB = {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(MOCK_TX)),
  };

  const getAuthUserMock = vi.fn();
  const getAuthUserBasicMock = vi.fn();
  const rateLimitMock = vi.fn().mockResolvedValue({ limited: false });

  return {
    MOCK_TODAY_KEY: MOCK_TODAY_KEY_HOISTED,
    MOCK_DB,
    MOCK_TX,
    empireProgressUpsert,
    userUpdateMany,
    getAuthUserMock,
    getAuthUserBasicMock,
    rateLimitMock,
  };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: H.getAuthUserMock,
  getAuthUserBasic: H.getAuthUserBasicMock,
}));

vi.mock('@/lib/analytics-server', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
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
  onEnergiaChange: vi.fn().mockResolvedValue(undefined),
}));

// Mock ONLY "today"; keep the real Madrid conversion utilities.
// The routes import getTodayDateKey via @/lib/deterministic, which
// re-exports from ./dates. Mock BOTH specifier paths so the override
// is guaranteed to reach every importer (the relative re-export inside
// deterministic.ts must not bypass the mock).
vi.mock('@/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dates')>();
  return {
    ...actual,
    getTodayDateKey: () => H.MOCK_TODAY_KEY,
  };
});

vi.mock('@/lib/deterministic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/deterministic')>();
  return {
    ...actual,
    getTodayDateKey: () => H.MOCK_TODAY_KEY,
  };
});

// ─── Helpers ─────────────────────────────────────────────────

function makeJsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const ONBOARDING_VALID_BODY = {
  primaryFocus: 'mente',
  stressLevel: 2,
  energyLevel: 4,
  focusLevel: 3,
};

const WELLNESS_VALID_BODY = {
  date: '2026-09-07',
  mood: 4,
  energy: 3,
  sleep: 4,
  stress: 2,
};

const NUTRITION_VALID_BODY = {
  date: '2026-09-07',
  water: 6,
  calories: 2100,
  meals: 'Desayuno y comida',
};

// ─── G-01 ────────────────────────────────────────────────────

describe('G-01 — POST /api/onboarding awards +25 XP exactly once', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserMock.mockResolvedValue({ id: 'user-1', name: null, email: 'user@test.com' });
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
    H.userUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('1. first valid onboarding → +25 XP to the focus empire', async () => {
    H.userUpdateMany.mockResolvedValue({ count: 1 });
    const { POST } = await import('@/app/api/onboarding/route');
    const res = await POST(makeJsonRequest('/api/onboarding', ONBOARDING_VALID_BODY) as any);
    expect(res.status).toBe(200);

    // The gate is the atomic CAS on the user row.
    expect(H.MOCK_TX.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', onboardingCompleted: false },
      data: { onboardingCompleted: true },
    });
    // XP awarded exactly once, same formula as before (+25).
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_empire: { userId: 'user-1', empire: 'mente' } },
        update: { xp: { increment: 25 } },
        create: { userId: 'user-1', empire: 'mente', xp: 25, streak: 0 },
      }),
    );
  });

  it('2. second onboarding POST (flag already true) → +0 XP, same response', async () => {
    H.userUpdateMany.mockResolvedValue({ count: 0 });
    const { POST } = await import('@/app/api/onboarding/route');
    const res = await POST(makeJsonRequest('/api/onboarding', ONBOARDING_VALID_BODY) as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('3. two simultaneous requests → exactly +25 XP total (CAS outcome)', async () => {
    // Simulates the database's atomic compare-and-swap: the first
    // transaction flips the flag (count=1); the concurrent duplicate
    // serializes on the row lock and matches 0 rows (count=0).
    H.userUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { POST } = await import('@/app/api/onboarding/route');
    await Promise.all([
      POST(makeJsonRequest('/api/onboarding', ONBOARDING_VALID_BODY) as any),
      POST(makeJsonRequest('/api/onboarding', ONBOARDING_VALID_BODY) as any),
    ]);
    // Both requests ran the gated UPDATE; only one claimed the XP.
    expect(H.MOCK_TX.user.updateMany).toHaveBeenCalledTimes(2);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
  });

  it('4. manual replay of the POST after completion → +0 XP every time', async () => {
    const { POST } = await import('@/app/api/onboarding/route');
    for (let i = 0; i < 5; i++) {
      H.userUpdateMany.mockResolvedValue({ count: 0 });
      const res = await POST(makeJsonRequest('/api/onboarding', ONBOARDING_VALID_BODY) as any);
      expect(res.status).toBe(200);
    }
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('5. invalid payload (missing fields) → 400, no transaction, no XP', async () => {
    const { POST } = await import('@/app/api/onboarding/route');
    const res = await POST(makeJsonRequest('/api/onboarding', { stressLevel: 3 }) as any);
    expect(res.status).toBe(400);
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('6. invalid primaryFocus → 400 before any XP path', async () => {
    const { POST } = await import('@/app/api/onboarding/route');
    const res = await POST(makeJsonRequest('/api/onboarding', { ...ONBOARDING_VALID_BODY, primaryFocus: 'poder' }) as any);
    expect(res.status).toBe(400);
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });
});

// ─── G-02: canary + pure policy ──────────────────────────────

describe('G-02 — canary: mocked "today" reaches every importer', () => {
  it('getTodayDateKey from @/lib/deterministic returns the fixed key', () => {
    expect(getTodayDateKey()).toBe(MOCK_TODAY_KEY);
  });

  it('getTodayDateKey from @/lib/dates returns the fixed key', () => {
    expect(getTodayDateKeyFromDates()).toBe(MOCK_TODAY_KEY);
  });
});

describe('G-02 — checkLogDateWindow policy (Europe/Madrid date keys)', () => {
  it('allows today', () => {
    expect(checkLogDateWindow('2026-09-07', '2026-09-07')).toEqual({ ok: true });
  });

  it('allows yesterday', () => {
    expect(checkLogDateWindow('2026-09-06', '2026-09-07')).toEqual({ ok: true });
  });

  it('allows the day before yesterday (anteayer)', () => {
    expect(checkLogDateWindow('2026-09-05', '2026-09-07')).toEqual({ ok: true });
  });

  it('rejects three days back', () => {
    expect(checkLogDateWindow('2026-09-04', '2026-09-07')).toEqual({ ok: false, reason: 'too_old' });
  });

  it('rejects far past (e.g., 90 days back)', () => {
    expect(checkLogDateWindow('2026-06-09', '2026-09-07')).toEqual({ ok: false, reason: 'too_old' });
  });

  it('rejects future date (+1 day)', () => {
    expect(checkLogDateWindow('2026-09-08', '2026-09-07')).toEqual({ ok: false, reason: 'future' });
  });

  it('rejects far future date', () => {
    expect(checkLogDateWindow('2027-01-01', '2026-09-07')).toEqual({ ok: false, reason: 'future' });
  });

  it('month boundary: Feb 27 is allowed, Feb 26 rejected when today is Mar 1', () => {
    expect(checkLogDateWindow('2026-02-27', '2026-03-01')).toEqual({ ok: true });
    expect(checkLogDateWindow('2026-02-26', '2026-03-01')).toEqual({ ok: false, reason: 'too_old' });
  });

  it('year boundary: Dec 30 allowed, Dec 29 rejected when today is Jan 1', () => {
    expect(checkLogDateWindow('2025-12-30', '2026-01-01')).toEqual({ ok: true });
    expect(checkLogDateWindow('2025-12-29', '2026-01-01')).toEqual({ ok: false, reason: 'too_old' });
  });

  it('DST fall-back day (2026-10-25): Oct 24 is exactly 2 days back → allowed', () => {
    expect(daysBetweenDateKeys('2026-10-24', '2026-10-26')).toBe(2);
    expect(checkLogDateWindow('2026-10-24', '2026-10-26')).toEqual({ ok: true });
  });

  it('DST spring-forward day (2026-03-29): Mar 26 rejected, Mar 27 allowed', () => {
    expect(daysBetweenDateKeys('2026-03-26', '2026-03-29')).toBe(3);
    expect(checkLogDateWindow('2026-03-26', '2026-03-29')).toEqual({ ok: false, reason: 'too_old' });
    expect(checkLogDateWindow('2026-03-27', '2026-03-29')).toEqual({ ok: true });
  });
});

// ─── G-02: Madrid day mapping (real conversion, no mocking) ──

describe('G-02 — getMadridDateKey around day changes (Europe/Madrid)', () => {
  it('maps midday instants to the same Madrid day', () => {
    expect(getMadridDateKey(new Date('2026-09-07T10:00:00Z'))).toBe('2026-09-07');
  });

  it('day changes at 22:00 UTC in summer (CEST, UTC+2)', () => {
    expect(getMadridDateKey(new Date('2026-09-07T21:59:00Z'))).toBe('2026-09-07');
    expect(getMadridDateKey(new Date('2026-09-07T22:00:00Z'))).toBe('2026-09-08');
  });

  it('day changes at 23:00 UTC in winter (CET, UTC+1)', () => {
    expect(getMadridDateKey(new Date('2026-01-15T22:59:00Z'))).toBe('2026-01-15');
    expect(getMadridDateKey(new Date('2026-01-15T23:00:00Z'))).toBe('2026-01-16');
  });

  it('spring-forward night (2026-03-29): 01:00 UTC is already 03:00 CEST', () => {
    expect(getMadridDateKey(new Date('2026-03-29T01:00:00Z'))).toBe('2026-03-29');
  });

  it('fall-back night (2026-10-25): both 00:30Z and 01:30Z are Oct 25 in Madrid', () => {
    expect(getMadridDateKey(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25');
    expect(getMadridDateKey(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25');
  });

  it('policy composes with mapping: "yesterday" at 00:30 Madrid night is allowed', () => {
    // Server "today" = 2026-09-08 (after Madrid midnight), client sends
    // yesterday's date → allowed (2nd day of the window is actually -1).
    const key = getMadridDateKey(new Date('2026-09-07T22:00:00Z')); // = 2026-09-08 00:00 Madrid
    expect(key).toBe('2026-09-08');
    expect(checkLogDateWindow(key, '2026-09-08')).toEqual({ ok: true });
  });

  it('policy composes with mapping: late-evening UTC instant that is tomorrow in Madrid → future', () => {
    // 2026-09-07T23:30Z = 2026-09-08 01:30 Madrid → future relative to Madrid today.
    const key = getMadridDateKey(new Date('2026-09-07T23:30:00Z'));
    expect(key).toBe('2026-09-08');
    expect(checkLogDateWindow(key, '2026-09-07')).toEqual({ ok: false, reason: 'future' });
  });
});

// ─── G-02: route-level wellness ──────────────────────────────

describe('G-02 — POST /api/wellness enforces the date window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. today → 200, +10 XP on first creation', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', WELLNESS_VALID_BODY) as any);
    expect(res.status).toBe(200);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_empire: { userId: 'user-1', empire: 'energia' } },
        update: expect.objectContaining({ xp: { increment: 10 } }),
      }),
    );
  });

  it('2. yesterday → allowed, XP awarded', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', { ...WELLNESS_VALID_BODY, date: '2026-09-06' }) as any);
    expect(res.status).toBe(200);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
  });

  it('3. day before yesterday → allowed, XP awarded', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', { ...WELLNESS_VALID_BODY, date: '2026-09-05' }) as any);
    expect(res.status).toBe(200);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
  });

  it('4. three days back → 400, no XP, no DB transaction', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', { ...WELLNESS_VALID_BODY, date: '2026-09-04' }) as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Date cannot be more than 2 days in the past' });
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('5. far past (arbitrary backdating) → 400 before any write', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', { ...WELLNESS_VALID_BODY, date: '2026-01-01' }) as any);
    expect(res.status).toBe(400);
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
  });

  it('6. future date → 400 "Date cannot be in the future"', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', { ...WELLNESS_VALID_BODY, date: '2026-09-08' }) as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Date cannot be in the future' });
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
  });

  it('7. malformed date → 400 Invalid date format, no XP', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', { ...WELLNESS_VALID_BODY, date: 'not-a-date' }) as any);
    expect(res.status).toBe(400);
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('8. duplicate same-date POST (log exists) → content updated, no XP duplication', async () => {
    H.MOCK_TX.wellnessLog.findUnique.mockResolvedValue({ id: 'wl-1' });
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', WELLNESS_VALID_BODY) as any);
    expect(res.status).toBe(200);
    // Content upsert still happens (update path)...
    expect(H.MOCK_TX.wellnessLog.upsert).toHaveBeenCalledTimes(1);
    // ...but XP/streak are NOT awarded again.
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('9. UTC late-evening instant that is tomorrow in Madrid → rejected as future', async () => {
    const { POST } = await import('@/app/api/wellness/route');
    const res = await POST(makeJsonRequest('/api/wellness', { ...WELLNESS_VALID_BODY, date: '2026-09-07T23:30:00Z' }) as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Date cannot be in the future' });
  });
});

// ─── G-02: route-level nutrition ─────────────────────────────

describe('G-02 — POST /api/nutrition enforces the date window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    H.MOCK_DB.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(H.MOCK_TX));
    H.getAuthUserBasicMock.mockResolvedValue({ id: 'user-1', plan: 'free', firebaseUid: 'fb-1', email: 'user@test.com' });
    H.rateLimitMock.mockResolvedValue({ limited: false });
  });

  it('1. today → 200, +10 XP on first creation', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeJsonRequest('/api/nutrition', NUTRITION_VALID_BODY) as any);
    expect(res.status).toBe(200);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_empire: { userId: 'user-1', empire: 'energia' } },
        update: expect.objectContaining({ xp: { increment: 10 } }),
      }),
    );
  });

  it('2. yesterday → allowed, XP awarded', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeJsonRequest('/api/nutrition', { ...NUTRITION_VALID_BODY, date: '2026-09-06' }) as any);
    expect(res.status).toBe(200);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
  });

  it('3. day before yesterday → allowed, XP awarded', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeJsonRequest('/api/nutrition', { ...NUTRITION_VALID_BODY, date: '2026-09-05' }) as any);
    expect(res.status).toBe(200);
    expect(H.empireProgressUpsert).toHaveBeenCalledTimes(1);
  });

  it('4. three days back → 400, no XP, no DB transaction', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeJsonRequest('/api/nutrition', { ...NUTRITION_VALID_BODY, date: '2026-09-04' }) as any);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Date cannot be more than 2 days in the past' });
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('5. future date → 400, no transaction', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeJsonRequest('/api/nutrition', { ...NUTRITION_VALID_BODY, date: '2026-09-10' }) as any);
    expect(res.status).toBe(400);
    expect(H.MOCK_DB.$transaction).not.toHaveBeenCalled();
  });

  it('6. malformed date → 400, no XP', async () => {
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeJsonRequest('/api/nutrition', { ...NUTRITION_VALID_BODY, date: '   ' }) as any);
    expect(res.status).toBe(400);
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });

  it('7. duplicate same-date POST (log exists) → content updated, no XP duplication', async () => {
    H.MOCK_TX.nutritionLog.findUnique.mockResolvedValue({ id: 'nl-1' });
    const { POST } = await import('@/app/api/nutrition/route');
    const res = await POST(makeJsonRequest('/api/nutrition', NUTRITION_VALID_BODY) as any);
    expect(res.status).toBe(200);
    expect(H.MOCK_TX.nutritionLog.upsert).toHaveBeenCalledTimes(1);
    expect(H.empireProgressUpsert).not.toHaveBeenCalled();
  });
});
