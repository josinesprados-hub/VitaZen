// ═══════════════════════════════════════════
// VITAZEN — ACHIEVEMENT SYSTEM
// ═══════════════════════════════════════════
// Shared definitions, progress calculation,
// and auto-unlock logic.
//
// Design principles:
// - Human, silent, rare, natural
// - Slow pacing: quick / medium / long milestones
// - Hidden achievements for long-term discovery
// - No gamification: no XP, no points, no streaks, no rewards
// - "algo se recordó" — not "ganaste un premio"
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { getMadridDateKey, getTodayDateKey, daysBetweenDateKeys, calcStreakFromKeys } from '@/lib/dates';
import { currentMaxHabitStreak } from '@/lib/streaks';

// ─── Types ───────────────────────────────────────────────

export interface AchievementDef {
  key: string;
  title: string;
  description: string;
  category: string;   // meditation | journal | wellness | habits | nutrition | finance | checkin | general
  icon: string;       // lucide icon name
  target: number;
  hidden: boolean;    // true = not shown until near-unlock or unlocked
}

export interface AchievementWithProgress extends AchievementDef {
  current: number;
  percent: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

// ─── 45 Achievement Definitions ──────────────────────────
// 27 visible + 18 hidden
// Rhythm: 1 (first) → 10-15 (early) → 30-50 (medium) → 100-200 (long)
// Hidden: depth, balance, return, rare moments

export const ACHIEVEMENTS: AchievementDef[] = [
  // ═══ VISIBLE (27) ═══

  // Meditación (4)
  { key: 'meditation_first', title: 'Primer Silencio', description: 'Tu primera pausa consciente', category: 'meditation', icon: 'Wind', target: 1, hidden: false },
  { key: 'meditation_10', title: 'Calma Reencontrada', description: '10 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 10, hidden: false },
  { key: 'meditation_30', title: 'Silencio Habitual', description: '30 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 30, hidden: false },
  { key: 'meditation_100', title: 'Respiración Profunda', description: '100 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 100, hidden: false },

  // Diario (4)
  { key: 'journal_first', title: 'Primera Página', description: 'Tu primera reflexión escrita', category: 'journal', icon: 'BookOpen', target: 1, hidden: false },
  { key: 'journal_10', title: 'Voces que Vuelven', description: '10 entradas en tu diario', category: 'journal', icon: 'BookOpen', target: 10, hidden: false },
  { key: 'journal_30', title: 'Rastro Escrito', description: '30 entradas en tu diario', category: 'journal', icon: 'BookOpen', target: 30, hidden: false },
  { key: 'journal_100', title: 'Memoria Viva', description: '100 entradas en tu diario', category: 'journal', icon: 'BookOpen', target: 100, hidden: false },

  // Bienestar (3)
  { key: 'wellness_first', title: 'Primer Escucha', description: 'Tu primer registro de bienestar', category: 'wellness', icon: 'Heart', target: 1, hidden: false },
  { key: 'wellness_15', title: 'Observación Constante', description: '15 registros de bienestar', category: 'wellness', icon: 'Heart', target: 15, hidden: false },
  { key: 'wellness_50', title: 'Consciencia Asentada', description: '50 registros de bienestar', category: 'wellness', icon: 'Heart', target: 50, hidden: false },

  // Hábitos (3)
  { key: 'habits_first', title: 'Primer Compromiso', description: 'Tu primer hábito registrado', category: 'habits', icon: 'CheckCircle', target: 1, hidden: false },
  { key: 'habits_5', title: 'Ritmo Interior', description: '5 hábitos activos', category: 'habits', icon: 'CheckCircle', target: 5, hidden: false },
  { key: 'habits_steady_14', title: 'Constancia Tranquila', description: '14 días seguidos en un hábito', category: 'habits', icon: 'Flame', target: 14, hidden: false },

  // Nutrición (3)
  { key: 'nutrition_first', title: 'Atención al Cuerpo', description: 'Tu primer registro alimentario', category: 'nutrition', icon: 'Utensils', target: 1, hidden: false },
  { key: 'nutrition_15', title: 'Cuerpo Escuchado', description: '15 registros de nutrición', category: 'nutrition', icon: 'Utensils', target: 15, hidden: false },
  { key: 'nutrition_50', title: 'Cuidado Sostenido', description: '50 registros de nutrición', category: 'nutrition', icon: 'Utensils', target: 50, hidden: false },

  // Finanzas (4)
  { key: 'finance_first', title: 'Primer Registro', description: 'Tu primer movimiento financiero', category: 'finance', icon: 'Wallet', target: 1, hidden: false },
  { key: 'finance_income_first', title: 'Entró Algo', description: 'Tu primer ingreso registrado', category: 'finance', icon: 'PiggyBank', target: 1, hidden: false },
  { key: 'finance_20', title: 'Memoria Económica', description: '20 registros financieros', category: 'finance', icon: 'Wallet', target: 20, hidden: false },
  { key: 'finance_50', title: 'Trayectoria Clara', description: '50 registros financieros', category: 'finance', icon: 'Wallet', target: 50, hidden: false },

  // General / Check-in / Cierres (6)
  { key: 'checkin_first', title: 'Primer Despertar', description: 'Tu primer check-in diario', category: 'checkin', icon: 'Sun', target: 1, hidden: false },
  { key: 'checkin_7', title: 'Semana Consciente', description: '7 check-ins diarios', category: 'checkin', icon: 'Sun', target: 7, hidden: false },
  { key: 'checkin_30', title: 'Mes Presente', description: '30 check-ins diarios', category: 'checkin', icon: 'Sun', target: 30, hidden: false },
  { key: 'empire_all', title: 'Cinco Caminos', description: 'Actividad en los 5 imperios', category: 'general', icon: 'Crown', target: 5, hidden: false },
  { key: 'monthly_closure_first', title: 'Primer Cierre', description: 'Tu primer cierre mensual', category: 'general', icon: 'Calendar', target: 1, hidden: false },
  { key: 'monthly_closure_3', title: 'Tiempo Reflexionado', description: '3 cierres mensuales', category: 'general', icon: 'Calendar', target: 3, hidden: false },

  // ═══ HIDDEN (18) ═══
  // Not shown until unlocked or near-unlock (>75% progress)
  // These feel rare, temporal, human — about depth, balance, and passage of time

  // Tiempo y presencia (2)
  { key: 'hidden_one_year', title: 'Un Año Contigo', description: '365 días desde tu primer paso en VitaZen', category: 'general', icon: 'Clock', target: 365, hidden: true },
  { key: 'hidden_six_months_present', title: 'Medio Año Presente', description: 'Actividad en 6 meses distintos', category: 'general', icon: 'Clock', target: 6, hidden: true },

  // Profundidad: ir más allá de la superficie (5)
  { key: 'hidden_gratitude_10', title: 'Gratitud Escrita', description: '10 entradas de diario con gratitud', category: 'journal', icon: 'Sparkles', target: 10, hidden: true },
  { key: 'hidden_finance_context_10', title: 'Contexto Humano', description: '10 registros financieros con contexto personal', category: 'finance', icon: 'MessageCircle', target: 10, hidden: true },
  { key: 'hidden_meditation_3_types', title: 'Varias Calmas', description: '3 tipos de meditación distintos', category: 'meditation', icon: 'Layers', target: 3, hidden: true },
  { key: 'hidden_wellness_all_moods', title: 'Toda la Escala', description: 'Registrar los 5 estados de ánimo posibles', category: 'wellness', icon: 'Eye', target: 5, hidden: true },
  { key: 'hidden_habit_steady_30', title: 'Hábito Interior', description: '30 días seguidos en un hábito', category: 'habits', icon: 'Mountain', target: 30, hidden: true },

  // Ritmo largo: constancia que se asienta con el tiempo (5)
  { key: 'hidden_checkin_100', title: 'Cien Mañanas', description: '100 check-ins diarios', category: 'checkin', icon: 'Sunrise', target: 100, hidden: true },
  { key: 'hidden_journal_200', title: 'Escritura Constante', description: '200 entradas en el diario', category: 'journal', icon: 'BookOpen', target: 200, hidden: true },
  { key: 'hidden_meditation_200', title: 'Práctica Asentada', description: '200 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 200, hidden: true },
  { key: 'hidden_wellness_100', title: 'Observación Profunda', description: '100 registros de bienestar', category: 'wellness', icon: 'Heart', target: 100, hidden: true },
  { key: 'hidden_nutrition_100', title: 'Cuerpo Atendido', description: '100 registros de nutrición', category: 'nutrition', icon: 'Leaf', target: 100, hidden: true },

  // Equilibrio y momentos (6)
  { key: 'hidden_finance_both_5', title: 'Dos Direcciones', description: '5 ingresos y 5 gastos registrados', category: 'finance', icon: 'TrendingUp', target: 5, hidden: true },
  { key: 'hidden_monthly_closure_6', title: 'Reflexión Acumulada', description: '6 cierres mensuales', category: 'general', icon: 'Moon', target: 6, hidden: true },
  { key: 'hidden_empire_balance', title: 'Equilibrio Vivo', description: '3 imperios con nivel 5 o más', category: 'general', icon: 'Compass', target: 3, hidden: true },
  { key: 'hidden_comeback', title: 'Regreso', description: 'Volviste tras una pausa larga', category: 'general', icon: 'RotateCcw', target: 1, hidden: true },
  { key: 'hidden_streak_7_checkin', title: 'Siete Mañanas', description: '7 check-ins consecutivos', category: 'checkin', icon: 'Zap', target: 7, hidden: true },
  { key: 'hidden_finance_100', title: 'Trayectoria Económica', description: '100 registros financieros', category: 'finance', icon: 'Wallet', target: 100, hidden: true },
];

// ─── Lookup helpers ──────────────────────────────────────

const achievementMap = new Map(ACHIEVEMENTS.map(a => [a.key, a]));

export function getAchievementDef(key: string): AchievementDef | undefined {
  return achievementMap.get(key);
}

export function getVisibleAchievements(): AchievementDef[] {
  return ACHIEVEMENTS.filter(a => !a.hidden);
}

export function getHiddenAchievements(): AchievementDef[] {
  return ACHIEVEMENTS.filter(a => a.hidden);
}

// ─── Progress Calculation ────────────────────────────────
// G-05: progress is computed by per-domain COLLECTORS. Each collector owns
// the queries and formulas for one family of achievements, so an action that
// touches one domain only pays for that domain's queries.
//   - calculateProgress()      → runs EVERY collector (full evaluation).
//   - evaluateAchievements()   → runs only the requested domains (selective).
// The formulas are the same as the previous monolithic implementation — only
// the execution boundaries changed. Each collector uses Promise.allSettled so
// a single failing query (missing table, Neon timeout) degrades only its own
// achievements to 0 instead of crashing the whole function.

type Settled<T> = PromiseFulfilledResult<T> | PromiseRejectedResult;

function fulfilled<T>(result: Settled<T>, fallback: T): T {
  // If PrismaPg returns null for a "fulfilled" query (driver adapter bug
  // with select/include), fall through to the fallback. This prevents
  // TypeError when accessing properties on null (e.g. null[0].field).
  if (result.status === 'fulfilled' && result.value != null) return result.value;
  return fallback;
}

// ─── Achievement Domains (G-05) ──────────────────────────
// Disjoint groups whose union is exactly the 45 achievement keys (asserted by
// tests). A domain maps 1:1 to the metric families an action can change:
//   - 'empire' is driven by XP grants, so every XP-awarding action evaluates
//     it together with its own domain (empire_all / hidden_empire_balance).
//   - 'time' has NO triggering action: hidden_one_year depends only on
//     user.createdAt, so it is only computed on the full path (GET /logros).

export type AchievementDomain =
  | 'meditation'
  | 'journal'
  | 'wellness'
  | 'habits'
  | 'nutrition'
  | 'finance'
  | 'checkin'
  | 'closure'
  | 'empire'
  | 'time';

export const DOMAIN_ACHIEVEMENT_KEYS: Record<AchievementDomain, string[]> = {
  meditation: ['meditation_first', 'meditation_10', 'meditation_30', 'meditation_100', 'hidden_meditation_3_types', 'hidden_meditation_200'],
  journal: ['journal_first', 'journal_10', 'journal_30', 'journal_100', 'hidden_gratitude_10', 'hidden_journal_200'],
  wellness: ['wellness_first', 'wellness_15', 'wellness_50', 'hidden_wellness_all_moods', 'hidden_wellness_100'],
  habits: ['habits_first', 'habits_5', 'habits_steady_14', 'hidden_habit_steady_30'],
  nutrition: ['nutrition_first', 'nutrition_15', 'nutrition_50', 'hidden_nutrition_100'],
  finance: ['finance_first', 'finance_income_first', 'finance_20', 'finance_50', 'hidden_finance_both_5', 'hidden_finance_context_10', 'hidden_finance_100'],
  checkin: ['checkin_first', 'checkin_7', 'checkin_30', 'hidden_checkin_100', 'hidden_six_months_present', 'hidden_comeback', 'hidden_streak_7_checkin'],
  closure: ['monthly_closure_first', 'monthly_closure_3', 'hidden_monthly_closure_6'],
  empire: ['empire_all', 'hidden_empire_balance'],
  time: ['hidden_one_year'],
};

async function collectMeditationProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.meditationSession.count({ where: { userId } }),
    db.meditationSession.findMany({
      where: { userId },
      distinct: ['type'],
    }),
  ]);
  const meditationCount      = fulfilled(results[0], 0);
  const meditationTypeResult = fulfilled(results[1], [] as { type: string }[]);
  return {
    meditation_first: Math.min(meditationCount, 1),
    meditation_10: Math.min(meditationCount, 10),
    meditation_30: Math.min(meditationCount, 30),
    meditation_100: Math.min(meditationCount, 100),
    hidden_meditation_3_types: Math.min(meditationTypeResult.length, 3),
    hidden_meditation_200: Math.min(meditationCount, 200),
  };
}

async function collectJournalProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.journalEntry.count({ where: { userId } }),
    db.journalEntry.count({
      where: { userId, gratitude: { not: null } },
    }),
  ]);
  const journalCount   = fulfilled(results[0], 0);
  const gratitudeCount = fulfilled(results[1], 0);
  return {
    journal_first: Math.min(journalCount, 1),
    journal_10: Math.min(journalCount, 10),
    journal_30: Math.min(journalCount, 30),
    journal_100: Math.min(journalCount, 100),
    hidden_gratitude_10: Math.min(gratitudeCount, 10),
    hidden_journal_200: Math.min(journalCount, 200),
  };
}

async function collectWellnessProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.wellnessLog.count({ where: { userId } }),
    db.wellnessLog.findMany({
      where: { userId },
      distinct: ['mood'],
    }),
  ]);
  const wellnessCount      = fulfilled(results[0], 0);
  const wellnessMoodResult = fulfilled(results[1], [] as { mood: number }[]);
  return {
    wellness_first: Math.min(wellnessCount, 1),
    wellness_15: Math.min(wellnessCount, 15),
    wellness_50: Math.min(wellnessCount, 50),
    hidden_wellness_all_moods: Math.min(wellnessMoodResult.length, 5),
    hidden_wellness_100: Math.min(wellnessCount, 100),
  };
}

async function collectHabitsProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.habitLog.count({ where: { userId } }),
    // G-06 FIX: maxStreak used to be max(HabitLog.streak) — a stored
    // counter that stays frozen after inactivity, so a habit abandoned
    // weeks ago could still unlock habits_steady_14 /
    // hidden_habit_steady_30 (false positive). The achievement now
    // receives the CURRENT streak: the stored count is only valid while
    // the habit's own lastCompletedAt says the chain is alive (today/
    // yesterday for daily habits, H-8 continuation windows for
    // weekly/monthly). Keys, targets and unlock semantics are unchanged —
    // only the data source stops quoting frozen counters. Already-unlocked
    // achievements are never revoked (one-way unlock, G-05).
    db.habitLog.findMany({
      where: { userId },
      select: { streak: true, lastCompletedAt: true, frequency: true },
      take: 100, // PERF-5.2 cap, mirrors GET /api/habits
    }),
  ]);
  const habitsCount     = fulfilled(results[0], 0);
  const habitRows       = fulfilled(results[1], [] as { streak: number; lastCompletedAt: Date | null; frequency: string }[]);
  const maxStreak = currentMaxHabitStreak(habitRows);
  return {
    habits_first: Math.min(habitsCount, 1),
    habits_5: Math.min(habitsCount, 5),
    habits_steady_14: Math.min(maxStreak, 14),
    hidden_habit_steady_30: Math.min(maxStreak, 30),
  };
}

async function collectNutritionProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.nutritionLog.count({ where: { userId } }),
  ]);
  const nutritionCount = fulfilled(results[0], 0);
  return {
    nutrition_first: Math.min(nutritionCount, 1),
    nutrition_15: Math.min(nutritionCount, 15),
    nutrition_50: Math.min(nutritionCount, 50),
    hidden_nutrition_100: Math.min(nutritionCount, 100),
  };
}

async function collectFinanceProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    // Consolidated from 3 separate count queries into 1 groupBy
    db.financeLog.groupBy({
      by: ['type'],
      where: { userId },
      _count: { type: true },
    }),
    db.financeLog.count({
      where: { userId, contexto: { not: null } },
    }),
  ]);
  const financeGroupBy      = fulfilled(results[0], [] as { type: string; _count: { type: number } }[]);
  const financeContextCount = fulfilled(results[1], 0);

  let financeCount = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  for (const row of financeGroupBy) {
    financeCount += row._count.type;
    if (row.type === 'income') incomeCount = row._count.type;
    if (row.type === 'expense') expenseCount = row._count.type;
  }

  return {
    finance_first: Math.min(financeCount, 1),
    finance_income_first: Math.min(incomeCount, 1),
    finance_20: Math.min(financeCount, 20),
    finance_50: Math.min(financeCount, 50),
    hidden_finance_both_5: Math.min(Math.min(incomeCount, expenseCount), 5),
    hidden_finance_context_10: Math.min(financeContextCount, 10),
    hidden_finance_100: Math.min(financeCount, 100),
  };
}

async function collectCheckinProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.dailyCheckin.count({ where: { userId } }),
    // Recent check-ins for streak detection (take: 60 is enough for 7 days)
    db.dailyCheckin.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 60,
    }),
    // All check-in dates for comeback & distinct month detection.
    // PERF-5.2: take: 1095 (~3 years) — far beyond any realistic gap need.
    // select: { date: true } avoids transferring heavy fields.
    db.dailyCheckin.findMany({
      where: { userId },
      select: { date: true },
      orderBy: { date: 'desc' },
      take: 1095,
    }),
  ]);
  const checkinCount    = fulfilled(results[0], 0);
  const recentCheckins  = fulfilled(results[1], [] as { date: Date }[]);
  const allCheckinDates = fulfilled(results[2], [] as { date: Date }[]);

  // Distinct months with check-ins — allCheckinDates so months aren't
  // truncated by the take: 60 cap. Madrid calendar avoids UTC drift.
  const distinctMonths = new Set(
    allCheckinDates.map(c => getMadridDateKey(new Date(c.date)).slice(0, 7))
  );

  // Regreso: detect gap of 7+ days between consecutive check-ins.
  // Madrid calendar-day comparison — avoids ±1 day DST drift.
  let hasComeback = false;
  if (allCheckinDates.length >= 2) {
    for (let i = 0; i < allCheckinDates.length - 1; i++) {
      const currentKey = getMadridDateKey(new Date(allCheckinDates[i].date));
      const previousKey = getMadridDateKey(new Date(allCheckinDates[i + 1].date));
      const gapDays = daysBetweenDateKeys(currentKey, previousKey);
      if (gapDays >= 7) {
        hasComeback = true;
        break;
      }
    }
  }

  // Siete Mañanas: 7 consecutive check-ins — same source of truth as
  // Dashboard, Momentum, Mentor, Silent Memories and Challenges.
  const consecutiveDays = recentCheckins.length > 0
    ? calcStreakFromKeys(new Set(recentCheckins.map(c => getMadridDateKey(new Date(c.date)))))
    : 0;

  return {
    checkin_first: Math.min(checkinCount, 1),
    checkin_7: Math.min(checkinCount, 7),
    checkin_30: Math.min(checkinCount, 30),
    hidden_checkin_100: Math.min(checkinCount, 100),
    hidden_six_months_present: Math.min(distinctMonths.size, 6),
    hidden_comeback: hasComeback ? 1 : 0,
    hidden_streak_7_checkin: Math.min(consecutiveDays, 7),
  };
}

async function collectClosureProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.monthlyClosure.count({ where: { userId } }),
  ]);
  const monthlyClosureCount = fulfilled(results[0], 0);
  return {
    monthly_closure_first: Math.min(monthlyClosureCount, 1),
    monthly_closure_3: Math.min(monthlyClosureCount, 3),
    hidden_monthly_closure_6: Math.min(monthlyClosureCount, 6),
  };
}

async function collectEmpireAchievementProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    // Empires with activity (xp > 0) — level derived from XP below
    db.empireProgress.findMany({
      where: { userId, xp: { gt: 0 } },
    }),
  ]);
  const empireActiveResult = fulfilled(results[0], [] as { empire: string; xp: number }[]);
  // hidden_empire_balance: level derived from XP using the same formula as
  // GET /api/empire: Math.floor(xp / 100) + 1 (the stored `level` field was
  // never updated, so the old query always returned 0 — already fixed here).
  const XP_PER_LEVEL = 100;
  const empireHighLevelResult = empireActiveResult.filter(ep => Math.floor(ep.xp / XP_PER_LEVEL) + 1 >= 5);
  return {
    empire_all: Math.min(empireActiveResult.length, 5),
    hidden_empire_balance: Math.min(empireHighLevelResult.length, 3),
  };
}

// 'time' has no triggering action: hidden_one_year only depends on
// user.createdAt, so it is computed on the full path only (GET /logros).
async function collectTimeProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    db.user.findUnique({ where: { id: userId } }),
  ]);
  const userData = fulfilled(results[0], null as { createdAt: Date } | null);
  if (!userData) {
    return { hidden_one_year: 0 };
  }
  // Madrid calendar days, not raw ms — avoids ±1 day drift from DST/timezone
  const createdKey = getMadridDateKey(new Date(userData.createdAt.getTime()));
  const todayKey = getTodayDateKey();
  const daysSince = daysBetweenDateKeys(createdKey, todayKey);
  return { hidden_one_year: Math.min(daysSince, 365) };
}

const PROGRESS_COLLECTORS: Record<AchievementDomain, (userId: string) => Promise<Record<string, number>>> = {
  meditation: collectMeditationProgress,
  journal: collectJournalProgress,
  wellness: collectWellnessProgress,
  habits: collectHabitsProgress,
  nutrition: collectNutritionProgress,
  finance: collectFinanceProgress,
  checkin: collectCheckinProgress,
  closure: collectClosureProgress,
  empire: collectEmpireAchievementProgress,
  time: collectTimeProgress,
};

export async function calculateProgress(userId: string): Promise<Record<string, number>> {
  const parts = await Promise.all(
    Object.values(PROGRESS_COLLECTORS).map(run => run(userId).catch(() => ({})))
  );
  return Object.assign({}, ...parts);
}

// ─── Auto-Unlock ─────────────────────────────────────────
// Checks all achievements against current progress.
// Creates Achievement records for any that meet their target
// but haven't been unlocked yet.
// Returns newly unlocked keys + progressData + unlockedKeys
// so callers don't need to re-query or re-calculate.

export interface UnlockResult {
  newlyUnlocked: string[];
  progressData: Record<string, number>;
  unlockedKeys: Set<string>;
}

export async function checkAndUnlock(userId: string): Promise<UnlockResult> {
  // NOTE: No `select` on findMany — PrismaPg driver adapter can return
  // null for queries with select, which crashes Promise.all (not allSettled).
  const [unlocked, progressData] = await Promise.all([
    db.achievement.findMany({
      where: { userId },
    }),
    calculateProgress(userId),
  ]);

  // Guard: PrismaPg driver adapter can return null for findMany in edge cases.
  if (!unlocked) {
    throw new Error('PrismaPg adapter returned null for achievement.findMany in checkAndUnlock — userId: ' + userId);
  }

  const unlockedKeys = new Set(unlocked.map(a => a.key));
  const newlyUnlocked: string[] = [];

  for (const def of ACHIEVEMENTS) {
    if (unlockedKeys.has(def.key)) continue;

    const current = progressData[def.key] || 0;
    if (current >= def.target) {
      try {
        await db.achievement.create({
          data: { userId, key: def.key },
        });
        newlyUnlocked.push(def.key);
        unlockedKeys.add(def.key);
      } catch {
        // Unique constraint violation — already unlocked by concurrent request
        // Silently ignore
      }
    }
  }

  return { newlyUnlocked, progressData, unlockedKeys };
}

// ─── Action-Time Evaluation (G-05) ───────────────────────
// Evaluates ONLY the achievement domains an action can affect, right after
// that action's write commits, and unlocks any achievement whose target is
// now met. This is the PRIMARY unlock mechanism since G-05 — the user no
// longer needs to visit /logros for a fulfilled condition to be recorded.
// GET /api/achievements (checkAndUnlock above) remains as the full-path
// safety net for anything a selective evaluation could not see (e.g. pure
// time-based achievements, evaluations that failed transiently).
//
// Concurrency & atomicity:
//   - Achievement rows are guarded by @@unique([userId, key]). Two concurrent
//     evaluations may both try to create the same record; exactly one create
//     wins and the loser catches the unique-violation (P2002) and simply does
//     NOT claim the "newly unlocked" feedback. Duplicates are impossible.
//   - Best-effort by design: the triggering action has ALREADY committed when
//     this runs, so any error here must never fail the action. On error the
//     unlock is not lost — it self-heals on the next evaluated action or on
//     GET /api/achievements.
//   - Runs OUTSIDE the action's transaction (no shared advisory locks, only
//     count-style reads + achievement creates), so it cannot deadlock with
//     the G-03/G-04 lock families.

export interface AchievementUnlockedInfo {
  key: string;
  title: string;
  description: string;
  category: string;
  icon: string;
}

export async function evaluateAchievements(
  userId: string,
  domains: AchievementDomain[],
): Promise<AchievementUnlockedInfo[]> {
  try {
    const wanted = new Set<AchievementDomain>(domains);
    if (wanted.size === 0) return [];

    // Selective progress: run only the requested domain collectors.
    const parts = await Promise.all(
      (Object.keys(PROGRESS_COLLECTORS) as AchievementDomain[])
        .filter(d => wanted.has(d))
        .map(d => PROGRESS_COLLECTORS[d](userId).catch(() => ({})))
    );
    const progressData = Object.assign({}, ...parts);

    const candidateKeys = new Set<string>();
    for (const d of wanted) {
      for (const k of DOMAIN_ACHIEVEMENT_KEYS[d]) candidateKeys.add(k);
    }
    const candidates = ACHIEVEMENTS.filter(a => candidateKeys.has(a.key));
    if (candidates.length === 0) return [];

    // NOTE: `where` filter keeps the payload light; no `select` — PrismaPg
    // driver adapter can return null for queries with select.
    const unlocked = await db.achievement.findMany({
      where: { userId, key: { in: [...candidateKeys] } },
    });
    if (!unlocked) {
      throw new Error('PrismaPg adapter returned null for achievement.findMany in evaluateAchievements — userId: ' + userId);
    }
    const unlockedKeys = new Set(unlocked.map(a => a.key));

    const newlyUnlocked: AchievementUnlockedInfo[] = [];
    for (const def of candidates) {
      if (unlockedKeys.has(def.key)) continue;

      const current = progressData[def.key] || 0;
      if (current >= def.target) {
        try {
          await db.achievement.create({
            data: { userId, key: def.key },
          });
          newlyUnlocked.push({
            key: def.key,
            title: def.title,
            description: def.description,
            category: def.category,
            icon: def.icon,
          });
          unlockedKeys.add(def.key);
        } catch {
          // Unique constraint violation (P2002) — a concurrent request won
          // the unlock. The record exists; this caller just doesn't claim
          // the feedback. Any other transient create error is equally
          // non-fatal: the unlock self-heals on a later evaluation.
        }
      }
    }

    return newlyUnlocked;
  } catch (error) {
    // Never fail the action because achievement evaluation failed.
    console.error('[achievements] evaluateAchievements failed (non-fatal):', error);
    return [];
  }
}

// ─── Achievement Response Builder ────────────────────────
// Builds the full API response with progress and hidden logic.
// Hidden achievements are only included if:
//   - Already unlocked, OR
//   - Progress >= 75% (near-unlock, shown as mystery card)

export const HIDDEN_REVEAL_THRESHOLD = 0.75; // 75% progress reveals a hidden achievement

export function buildAchievementResponse(
  definitions: AchievementDef[],
  progressData: Record<string, number>,
  unlockedKeys: Set<string>,
  unlockedAtMap: Map<string, string>,
): AchievementWithProgress[] {
  const result: AchievementWithProgress[] = [];

  for (const def of definitions) {
    const current = progressData[def.key] || 0;
    const isUnlocked = unlockedKeys.has(def.key);
    const percent = def.target > 0 ? Math.min(Math.round((current / def.target) * 100), 100) : 0;

    if (def.hidden && !isUnlocked) {
      // Hidden and not yet unlocked — only show if near-unlock
      if (percent >= HIDDEN_REVEAL_THRESHOLD * 100) {
        // Show as mystery card: hide title and description
        result.push({
          ...def,
          title: '???',
          description: 'Algo está por aparecer',
          current,
          percent,
          unlocked: false,
          unlockedAt: null,
        });
      }
      // Otherwise: don't include at all — truly hidden
    } else {
      result.push({
        ...def,
        current,
        percent,
        unlocked: isUnlocked,
        unlockedAt: isUnlocked ? unlockedAtMap.get(def.key) || null : null,
      });
    }
  }

  return result;
}
