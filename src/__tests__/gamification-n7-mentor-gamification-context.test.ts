/**
 * N-7 — Mentor IA: real achievements & challenges context.
 *
 * Before N-7 the Mentor (POST /api/ai/chat → buildMentorContext) received
 * check-ins, habits, meditations, journals, empire progress (PREMIUM only),
 * wellness, finance, patterns… but NEVER achievements or challenges — the
 * FASE 14 audit flagged exactly this gap ("no recibe retos/logros en
 * contexto").
 *
 * What N-7 adds (src/lib/mentor-context.ts):
 *   1. Three userId-scoped, individually fail-safe queries inside the main
 *      Promise.all: unlocked achievements (Achievement table), today's
 *      challenge (UserChallenge of the current Madrid day, SAME
 *      startOfTodayMadrid() key the GET route and the reward path use) and
 *      the recently completed history (completedAt within the last 7 Madrid
 *      days). Read-only: the Mentor never creates, completes or unlocks.
 *   2. A gamification block in the prompt built ONLY from real server data:
 *      titles resolved through the canonical ACHIEVEMENTS defs (unknown keys
 *      skipped, never invented), empires through CHALLENGE_CATEGORY_TO_EMPIRE
 *      (the N-5 mapping; unknown categories fail closed with NO empire).
 *   3. Explicit usage rules appended to the system prompt when gamification
 *      data exists, so the mentor uses the state honestly: recognize recent
 *      unlocks, propose the pending challenge as a concrete action, never
 *      claim a completion that is not recorded, never repeat a completed one.
 *
 * Test strategy (project pattern from g06/f7):
 * - Route-level and lib-level tests mock @/lib/db, @/lib/auth, @/lib/groq,
 *   @/lib/limits, @/lib/rate-limit and every side-effect engine.
 * - The clock is FROZEN with fake Date timers (2026-09-07 noon UTC → Madrid
 *   day 2026-09-07); every Madrid conversion (startOfTodayMadrid,
 *   startOf7DaysAgoMadrid, daysAgo…) stays REAL — the same determinism the
 *   rest of the gamification suite relies on. No sleeps, no timers, no LLM.
 * - "Real use" evidence is deterministic: the captured system prompt that
 *   reaches the Groq layer must contain the real data AND the usage rules —
 *   the response-generation layer receives both.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startOfMadridDay, startOf7DaysAgoMadrid } from '@/lib/dates';
import { CHALLENGE_CATEGORY_TO_EMPIRE, EMPIRE_LABELS } from '@/lib/challenge-empire';

// ─── Fixed "today" (Madrid) for deterministic tests ──────────

const DAY_1 = '2026-09-07'; // Monday, frozen "today" (CEST, UTC+2)

// instants whose Madrid day is unambiguous (September = CEST):
// 10:00Z → 12:00 Madrid of the same calendar day.
function noonUTC(offsetFromDay1: number): Date {
  return new Date(Date.UTC(2026, 8, 7 + offsetFromDay1, 10, 0, 0));
}

// The exact instant the Mentor must query today's challenge with — the same
// key GET /api/challenges and challenge-auto-complete use. Computed from a
// FIXED dateKey, so it does not depend on the clock.
const START_OF_TODAY = startOfMadridDay(DAY_1);

// ─── Mock setup (hoisted) ────────────────────────────────────

const H = vi.hoisted(() => {
  const groqCreate = vi.fn();
  const getAuthUserMock = vi.fn();
  const checkAILimitMock = vi.fn();

  const MOCK_DB = {
    $transaction: vi.fn(async (arg: unknown) =>
      Array.isArray(arg)
        ? Promise.all(arg as Promise<unknown>[])
        : (arg as (tx: unknown) => unknown)(MOCK_DB),
    ),
    $queryRaw: vi.fn().mockResolvedValue([{ key: BigInt(1) }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    // tables consumed by buildMentorContext
    dailyCheckin: { findMany: vi.fn().mockResolvedValue([]) },
    habitLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null), // G-06 premium streak gate
    },
    meditationSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null), // G-06 premium streak gate
    },
    journalEntry: { findMany: vi.fn().mockResolvedValue([]) },
    aIThread: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    empireProgress: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Test', plan: 'FREE' }) },
    onboardingData: { findUnique: vi.fn().mockResolvedValue(null) },
    wellnessLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null), // G-06 premium streak gate
    },
    financeLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null), // G-06 premium streak gate
    },
    nutritionLog: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null), // G-06 premium streak gate
    },
    monthlyClosure: { findMany: vi.fn().mockResolvedValue([]) },
    emotionalDashboardState: { findUnique: vi.fn().mockResolvedValue(null) },
    // N-7 gamification sources
    achievement: { findMany: vi.fn().mockResolvedValue([]) },
    userChallenge: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    // tables consumed by the chat route
    aIMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      count: vi.fn().mockResolvedValue(2),
    },
  };

  return { groqCreate, getAuthUserMock, checkAILimitMock, MOCK_DB };
});

vi.mock('@/lib/db', () => ({ db: H.MOCK_DB }));

vi.mock('@/lib/auth', () => ({
  getAuthUser: H.getAuthUserMock,
  getAuthUserBasic: vi.fn(),
}));

vi.mock('@/lib/groq', () => ({
  groq: { chat: { completions: { create: H.groqCreate } } },
  GROQ_MODEL: 'test-model',
  SYSTEM_PROMPTS: { FREE: 'BASE_PROMPT_FREE', PREMIUM: 'BASE_PROMPT_PREMIUM' },
}));

vi.mock('@/lib/limits', () => ({
  getDailyLimit: vi.fn(() => 10),
  checkAILimit: H.checkAILimitMock,
  rollbackAILimit: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ limited: false }),
  RATE_LIMITS: { 'ai:chat': 30 },
  rateLimitedResponse: vi.fn(),
}));

vi.mock('@/lib/analytics-server', () => ({ trackEvent: vi.fn() }));

vi.mock('@/lib/understanding/engine', () => ({
  getUnderstandingContext: vi.fn().mockResolvedValue({ adaptationSnippet: null }),
  extractAndPersist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/decision/engine', () => ({
  optimizeContext: vi.fn((systemPrompt: string) => ({ systemPrompt })),
}));

vi.mock('@/lib/reasoning/engine', () => ({
  reason: vi.fn(() => ({ instructionSnippet: null })),
}));

vi.mock('@/lib/observability/api-timing', () => ({
  withTiming: vi.fn((_name: unknown, handler: unknown) => handler),
}));

vi.mock('@/lib/observability/server-logger', () => ({
  serverLog: { error: vi.fn(), apiError: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ─── Shared helpers ──────────────────────────────────────────

function achievementRow(key: string, unlockedAt: Date, userId = 'user-1') {
  return { id: `ach-${key}-${userId}`, userId, key, unlockedAt };
}

function challengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uc-1',
    userId: 'user-1',
    challengeId: 'ch-1',
    completed: false,
    completedAt: null as Date | null,
    date: START_OF_TODAY,
    challenge: {
      id: 'ch-1',
      category: 'salud',
      title: 'Bebe 3 litros de agua',
      description: 'Hidratación básica',
      difficulty: 'easy',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    ...overrides,
  };
}

const THREAD_ROW = { id: 'thread-1', userId: 'user-1', title: 'Chat activo', archived: false };

// buildMentorContext derives ctx.plan from db.user.findUnique (the same DB
// user getAuthUser reads in production) — PREMIUM scenarios must set it.
function setUserPlan(plan: 'FREE' | 'PREMIUM', userId = 'user-1') {
  H.MOCK_DB.user.findUnique.mockImplementation(async (args: { where: { id: string } }) => ({
    name: 'Test',
    plan: args?.where?.id === userId ? plan : 'FREE',
  }));
}

function resetDb() {
  vi.clearAllMocks();
  H.MOCK_DB.dailyCheckin.findMany.mockResolvedValue([]);
  H.MOCK_DB.habitLog.findMany.mockResolvedValue([]);
  H.MOCK_DB.habitLog.findFirst.mockResolvedValue(null);
  H.MOCK_DB.meditationSession.findMany.mockResolvedValue([]);
  H.MOCK_DB.meditationSession.findFirst.mockResolvedValue(null);
  H.MOCK_DB.journalEntry.findMany.mockResolvedValue([]);
  H.MOCK_DB.aIThread.findMany.mockResolvedValue([]);
  H.MOCK_DB.aIThread.findFirst.mockResolvedValue(THREAD_ROW);
  H.MOCK_DB.aIThread.update.mockResolvedValue({});
  H.MOCK_DB.empireProgress.findMany.mockResolvedValue([]);
  H.MOCK_DB.user.findUnique.mockResolvedValue({ name: 'Test', plan: 'FREE' });
  H.MOCK_DB.onboardingData.findUnique.mockResolvedValue(null);
  H.MOCK_DB.wellnessLog.findMany.mockResolvedValue([]);
  H.MOCK_DB.wellnessLog.findFirst.mockResolvedValue(null);
  H.MOCK_DB.financeLog.findMany.mockResolvedValue([]);
  H.MOCK_DB.financeLog.findFirst.mockResolvedValue(null);
  H.MOCK_DB.nutritionLog.findMany.mockResolvedValue([]);
  H.MOCK_DB.nutritionLog.findFirst.mockResolvedValue(null);
  H.MOCK_DB.monthlyClosure.findMany.mockResolvedValue([]);
  H.MOCK_DB.emotionalDashboardState.findUnique.mockResolvedValue(null);
  H.MOCK_DB.achievement.findMany.mockResolvedValue([]);
  H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(null);
  H.MOCK_DB.userChallenge.findMany.mockResolvedValue([]);
  H.MOCK_DB.aIMessage.findMany.mockResolvedValue([]);
  H.MOCK_DB.aIMessage.create.mockResolvedValue({ id: 'msg-1' });
  H.MOCK_DB.aIMessage.count.mockResolvedValue(2);
  H.MOCK_DB.$queryRaw.mockResolvedValue([{ key: BigInt(1) }]);
  H.MOCK_DB.$executeRaw.mockResolvedValue(1);
  H.groqCreate.mockResolvedValue({ choices: [{ message: { content: 'Respuesta del mentor.' } }] });
  H.getAuthUserMock.mockResolvedValue({ id: 'user-1', plan: 'FREE', firebaseUid: 'fb-1', email: 'u@test.com' });
  H.checkAILimitMock.mockResolvedValue({ allowed: true, remaining: 9 });
}

beforeEach(() => {
  resetDb();
  // Freeze ONLY Date (timers stay real → promises/awaits unaffected).
  // Noon UTC → Madrid date key 2026-09-07 on every run, DST included.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-07T12:00:00.000Z') });
});

afterEach(() => {
  vi.useRealTimers();
});

// ═══════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════

describe('N-7 — achievements reach the Mentor from real server data', () => {
  it('A1. unlocked achievements are received with real titles/categories, most recent first', async () => {
    setUserPlan('PREMIUM');
    H.MOCK_DB.achievement.findMany.mockResolvedValue([
      achievementRow('meditation_first', noonUTC(0)),   // hoy
      achievementRow('checkin_7', noonUTC(-1)),          // ayer
      achievementRow('journal_10', noonUTC(-2)),         // hace 2 días
    ]);

    const { buildMentorContext } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');

    expect(ctx.gamification).not.toBeNull();
    expect(ctx.gamification!.achievements.totalUnlocked).toBe(3);
    expect(ctx.gamification!.achievements.recent.map(a => a.title)).toEqual([
      'Primer Silencio',      // meditation_first — canonical def title
      'Semana Consciente',    // checkin_7
      'Voces que Vuelven',    // journal_10
    ]);
    expect(ctx.gamification!.achievements.recent.map(a => a.category)).toEqual([
      'meditation', 'checkin', 'journal',
    ]);
  });

  it('A2. locked achievements are never presented as unlocked', async () => {
    setUserPlan('PREMIUM');
    H.MOCK_DB.achievement.findMany.mockResolvedValue([
      achievementRow('meditation_first', noonUTC(0)),
    ]);

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');
    const prompt = formatContextForPrompt(ctx);

    // the unlocked one appears…
    expect(prompt).toContain('Primer Silencio');
    expect(prompt).toContain('Logros desbloqueados: 1 de 45');
    // …every locked title stays out (journal_100 "Memoria Viva" was NEVER unlocked)
    expect(prompt).not.toContain('Memoria Viva');
    expect(prompt).not.toContain('Voces que Vuelven');
  });

  it('A3. an unlocked hidden achievement is presented with its real title', async () => {
    setUserPlan('PREMIUM');
    H.MOCK_DB.achievement.findMany.mockResolvedValue([
      achievementRow('hidden_streak_7_checkin', noonUTC(0)),
    ]);

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');
    const prompt = formatContextForPrompt(ctx);

    expect(ctx.gamification!.achievements.recent[0].title).toBe('Siete Mañanas');
    expect(prompt).toContain('Siete Mañanas');
  });

  it('A4. absence of achievements works (gamification degrades, never invents)', async () => {
    const { buildMentorContext, formatContextForPrompt, buildContextualSystemPrompt } = await import('@/lib/mentor-context');

    const ctx = await buildMentorContext('user-1', 'FREE');
    expect(ctx.gamification).toBeNull();

    const prompt = formatContextForPrompt(ctx);
    expect(prompt).not.toContain('Logros');
    expect(prompt).not.toContain('Reto de hoy');

    // No gamification data → no usage rules either (nothing to use)
    const systemPrompt = buildContextualSystemPrompt('BASE_PROMPT_FREE', ctx);
    expect(systemPrompt).not.toContain('GAMIFICACIÓN (logros y retos)');
  });

  it('A5. the achievements query is always scoped to the authenticated userId', async () => {
    const { buildMentorContext } = await import('@/lib/mentor-context');
    await buildMentorContext('user-1', 'FREE');

    expect(H.MOCK_DB.achievement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
  });

  it('A6. no achievement of user B can reach the context of user A', async () => {
    setUserPlan('PREMIUM', 'user-1');
    setUserPlan('PREMIUM', 'user-2');
    H.MOCK_DB.achievement.findMany.mockImplementation(async (args: { where: { userId: string } }) =>
      args?.where?.userId === 'user-1'
        ? [achievementRow('journal_10', noonUTC(-2), 'user-1')]
        : [achievementRow('meditation_10', noonUTC(-1), 'user-2')],
    );

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');

    const ctxA = await buildMentorContext('user-1', 'PREMIUM');
    const promptA = formatContextForPrompt(ctxA);
    expect(promptA).toContain('Voces que Vuelven');     // user-1's real unlock
    expect(promptA).not.toContain('Calma Reencontrada'); // user-2's unlock

    const ctxB = await buildMentorContext('user-2', 'PREMIUM');
    const promptB = formatContextForPrompt(ctxB);
    expect(promptB).toContain('Calma Reencontrada');
    expect(promptB).not.toContain('Voces que Vuelven');
  });
});

// ═══════════════════════════════════════════════════════════
// CHALLENGES
// ═══════════════════════════════════════════════════════════

describe('N-7 — challenges reach the Mentor with real state and N-5 mapping', () => {
  it('C1. a pending challenge appears as pending, with category and reward empire', async () => {
    setUserPlan('PREMIUM');
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(challengeRow({ completed: false }));

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');
    const prompt = formatContextForPrompt(ctx);

    expect(prompt).toContain('Reto de hoy: "Bebe 3 litros de agua"');
    expect(prompt).toContain('categoría salud');
    expect(prompt).toContain('suma al imperio Energía'); // N-5: salud → energia
    expect(prompt).toContain('Aún pendiente.');
    expect(prompt).not.toContain('Ya completado');
  });

  it('C2. a completed challenge appears as completed — the mentor cannot ask to redo it', async () => {
    setUserPlan('PREMIUM');
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(
      challengeRow({ completed: true, completedAt: noonUTC(0) }),
    );

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');
    const prompt = formatContextForPrompt(ctx);

    expect(prompt).toContain('Reto de hoy: "Bebe 3 litros de agua"');
    expect(prompt).toContain('Ya completado hoy.');
    expect(prompt).not.toContain('Aún pendiente');
  });

  it('C3. absence of a challenge today works (lazy assignment untouched)', async () => {
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(null);
    H.MOCK_DB.userChallenge.findMany.mockResolvedValue([]);

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');
    const prompt = formatContextForPrompt(ctx);

    expect(ctx.gamification).toBeNull();
    expect(prompt).not.toContain('Reto de hoy');
  });

  it('C4. recent completed challenges are listed with their reward empire', async () => {
    setUserPlan('PREMIUM');
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(null);
    H.MOCK_DB.userChallenge.findMany.mockResolvedValue([
      challengeRow({
        id: 'uc-2', challengeId: 'ch-2', completed: true, completedAt: noonUTC(-1),
        challenge: { id: 'ch-2', category: 'productividad', title: 'Zero inbox', description: '', difficulty: 'medium', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      }),
      challengeRow({
        id: 'uc-3', challengeId: 'ch-3', completed: true, completedAt: noonUTC(-2),
        challenge: { id: 'ch-3', category: 'mentalidad', title: 'Conversación incómoda pendiente', description: '', difficulty: 'hard', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      }),
    ]);

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'PREMIUM');
    const prompt = formatContextForPrompt(ctx);

    expect(prompt).toContain('Retos completados en los últimos días');
    expect(prompt).toContain('"Zero inbox" (imperio Crecimiento)');    // productividad → crecimiento
    expect(prompt).toContain('"Conversación incómoda pendiente" (imperio Mente)'); // mentalidad → mente
  });

  it('C5. the N-5 mapping is honored for all five challenge categories — and fail-closed for unknown ones', async () => {
    setUserPlan('PREMIUM');
    const CASES: Array<{ category: string; empireLabel: string }> = [
      { category: 'disciplina', empireLabel: 'Disciplina' },
      { category: 'habitos', empireLabel: 'Disciplina' },
      { category: 'mentalidad', empireLabel: 'Mente' },
      { category: 'productividad', empireLabel: 'Crecimiento' },
      { category: 'salud', empireLabel: 'Energía' },
    ];

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');

    for (const { category, empireLabel } of CASES) {
      H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(
        challengeRow({ challenge: { ...challengeRow().challenge, category } }),
      );
      const ctx = await buildMentorContext('user-1', 'PREMIUM');
      const prompt = formatContextForPrompt(ctx);

      expect(ctx.gamification!.currentChallenge!.empireLabel).toBe(empireLabel);
      expect(prompt).toContain(`suma al imperio ${empireLabel}`);
      // alignment with the canonical mapping (the source the reward path pays)
      expect(EMPIRE_LABELS[CHALLENGE_CATEGORY_TO_EMPIRE[category]]).toBe(empireLabel);
    }

    // fail-closed: a category outside the N-5 mapping names NO empire
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(
      challengeRow({ challenge: { ...challengeRow().challenge, category: 'riqueza' } }),
    );
    const ctx = await buildMentorContext('user-1', 'PREMIUM');
    const prompt = formatContextForPrompt(ctx);
    expect(ctx.gamification!.currentChallenge!.empireLabel).toBeNull();
    expect(prompt).not.toContain('suma al imperio');
  });

  it('C6. today\u2019s challenge is queried with the exact Madrid-day key of the reward path', async () => {
    const { buildMentorContext } = await import('@/lib/mentor-context');
    await buildMentorContext('user-1', 'FREE');

    // evaluated INSIDE the test, under the frozen clock
    const expected7dAgo = startOf7DaysAgoMadrid();

    expect(H.MOCK_DB.userChallenge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', date: START_OF_TODAY }),
      }),
    );
    // recent history window: completedAt within the last 7 Madrid days
    expect(H.MOCK_DB.userChallenge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          completed: true,
          completedAt: { gte: expected7dAgo },
        }),
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════
// USO REAL — the gamification data reaches the response layer
// ═══════════════════════════════════════════════════════════

describe('N-7 — the system prompt carries the data AND the usage rules', () => {
  it('U1. usage rules are appended when gamification data exists', async () => {
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(challengeRow({ completed: false }));

    const { buildMentorContext, buildContextualSystemPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');
    const systemPrompt = buildContextualSystemPrompt('BASE_PROMPT_FREE', ctx);

    expect(systemPrompt).toContain('GAMIFICACIÓN (logros y retos)');
    expect(systemPrompt).toContain('No inventes logros ni retos');
    expect(systemPrompt).toContain('nunca afirmes que esta persona completó algo que no aparece ahí');
    expect(systemPrompt).toContain('no sugieras completarlo de nuevo');
    expect(systemPrompt).toContain('Menciona logros o retos solo cuando aporten algo real');
  });

  it('U2. no gamification data → no gamification rules (lean prompt)', async () => {
    const { buildMentorContext, buildContextualSystemPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');
    expect(ctx.gamification).toBeNull();

    const systemPrompt = buildContextualSystemPrompt('BASE_PROMPT_FREE', ctx);
    expect(systemPrompt).not.toContain('GAMIFICACIÓN (logros y retos)');
  });

  it('U3. end-to-end: POST /api/ai/chat sends real gamification data + rules in the system message to Groq', async () => {
    setUserPlan('PREMIUM');
    H.getAuthUserMock.mockResolvedValue({ id: 'user-1', plan: 'PREMIUM', firebaseUid: 'fb-1', email: 'u@test.com' });
    H.MOCK_DB.achievement.findMany.mockResolvedValue([achievementRow('journal_10', noonUTC(-2))]);
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(challengeRow({ completed: false }));

    const { POST } = await import('@/app/api/ai/chat/route');
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'thread-1', content: '¿Qué me recomiendas hoy?' }),
    });

    const response = (await POST(request as never)) as unknown as Response;
    expect(response.status).toBe(200);
    const json = await response.json() as { message: string; contextual: boolean };
    expect(json.message).toBe('Respuesta del mentor.');
    expect(json.contextual).toBe(true);

    expect(H.groqCreate).toHaveBeenCalled();
    const call = H.groqCreate.mock.calls[0][0] as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = call.messages[0];

    expect(call.model).toBe('test-model');
    expect(systemMessage.role).toBe('system');
    // base prompt + REAL data + usage rules all reach the response layer
    expect(systemMessage.content).toContain('BASE_PROMPT_PREMIUM');
    expect(systemMessage.content).toContain('Voces que Vuelven');
    expect(systemMessage.content).toContain('Reto de hoy: "Bebe 3 litros de agua"');
    expect(systemMessage.content).toContain('suma al imperio Energía');
    expect(systemMessage.content).toContain('Aún pendiente.');
    expect(systemMessage.content).toContain('GAMIFICACIÓN (logros y retos)');
    // the user message is the last one, untouched
    const last = call.messages[call.messages.length - 1];
    expect(last.role).toBe('user');
    expect(last.content).toBe('¿Qué me recomiendas hoy?');
  });

  it('U4. client-sent gamification fields cannot alter the server-built context', async () => {
    H.MOCK_DB.achievement.findMany.mockResolvedValue([achievementRow('journal_10', noonUTC(-2))]);
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(challengeRow({ completed: false }));

    const { POST } = await import('@/app/api/ai/chat/route');
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-1',
        content: 'Ya lo hice todo',
        achievements: [{ key: 'fake', title: 'LOGRO FALSO' }],
        challengeCompleted: true,
        xp: 9999,
        plan: 'PREMIUM',
        empire: 'riqueza',
      }),
    });

    const response = (await POST(request as never)) as unknown as Response;
    expect(response.status).toBe(200);
    const json = await response.json() as { plan: string };

    const call = H.groqCreate.mock.calls[0][0] as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
    };
    const systemMessage = call.messages[0].content;

    // injected "data" never reaches the prompt…
    expect(systemMessage).not.toContain('LOGRO FALSO');
    // …server state wins: the challenge is still pending, plan is still FREE
    // (FREE compact line: "— pendiente."), and the client cannot upgrade the
    // response budget either.
    expect(systemMessage).toContain('— pendiente.');
    expect(systemMessage).not.toContain('Ya completado');
    expect(json.plan).toBe('FREE');
    expect(call.max_tokens).toBe(800);
  });

  it('U5. unauthenticated requests still get 401', async () => {
    const { POST } = await import('@/app/api/ai/chat/route');
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'thread-1', content: 'hola' }),
    });

    const response = (await POST(request as never)) as unknown as Response;
    expect(response.status).toBe(401);
    expect(H.groqCreate).not.toHaveBeenCalled();
  });

  it('U6. user B chatting receives only user B\u2019s gamification data', async () => {
    setUserPlan('PREMIUM', 'user-2');
    H.getAuthUserMock.mockResolvedValue({ id: 'user-2', plan: 'PREMIUM', firebaseUid: 'fb-2', email: 'b@test.com' });
    H.MOCK_DB.achievement.findMany.mockImplementation(async (args: { where: { userId: string } }) =>
      args?.where?.userId === 'user-1'
        ? [achievementRow('journal_10', noonUTC(-2), 'user-1')]
        : [achievementRow('meditation_10', noonUTC(-1), 'user-2')],
    );

    const { POST } = await import('@/app/api/ai/chat/route');
    const request = new Request('http://localhost/api/ai/chat', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token-b', 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: 'thread-1', content: 'hola' }),
    });

    const response = (await POST(request as never)) as unknown as Response;
    expect(response.status).toBe(200);

    const call = H.groqCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemMessage = call.messages[0].content;
    expect(systemMessage).toContain('Calma Reencontrada');   // user-2's unlock
    expect(systemMessage).not.toContain('Voces que Vuelven'); // user-1's unlock
  });
});

// ═══════════════════════════════════════════════════════════
// FALLBACKS — optional gamification reads must never break the Mentor
// ═══════════════════════════════════════════════════════════

describe('N-7 — fail-safe degradation', () => {
  it('F1. a failing achievements read keeps the challenge data (and vice versa)', async () => {
    H.MOCK_DB.achievement.findMany.mockRejectedValue(new Error('achievements read failed'));
    H.MOCK_DB.userChallenge.findFirst.mockResolvedValue(challengeRow({ completed: false }));

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');
    const prompt = formatContextForPrompt(ctx);

    expect(ctx.gamification).not.toBeNull();
    expect(ctx.gamification!.achievements.totalUnlocked).toBe(0);
    expect(prompt).not.toContain('Logros');
    expect(prompt).toContain('Reto de hoy: "Bebe 3 litros de agua"');
    expect(prompt).toContain('pendiente.');
  });

  it('F2. failing challenge reads keep the achievements data', async () => {
    H.MOCK_DB.achievement.findMany.mockResolvedValue([achievementRow('journal_10', noonUTC(-2))]);
    H.MOCK_DB.userChallenge.findFirst.mockRejectedValue(new Error('challenge read failed'));
    H.MOCK_DB.userChallenge.findMany.mockRejectedValue(new Error('history read failed'));

    const { buildMentorContext, formatContextForPrompt } = await import('@/lib/mentor-context');
    const ctx = await buildMentorContext('user-1', 'FREE');
    const prompt = formatContextForPrompt(ctx);

    expect(ctx.gamification!.currentChallenge).toBeNull();
    expect(ctx.gamification!.achievements.totalUnlocked).toBe(1);
    expect(prompt).toContain('Logros: 1 desbloqueados, el más reciente "Voces que Vuelven" (diario).');
    expect(prompt).not.toContain('Reto de hoy');
  });
});
