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
import { getMadridDateKey, getTodayDateKey } from '@/lib/deterministic';

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
  { key: 'hidden_journal_200', title: 'Escritura Constancia', description: '200 entradas en el diario', category: 'journal', icon: 'BookOpen', target: 200, hidden: true },
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
// Runs all DB queries in parallel for efficiency.
// Uses Promise.allSettled so that a single failing query
// (e.g. missing table, Neon timeout) doesn't crash the
// entire function — the affected achievements degrade to 0.
// Returns a map of achievement key → current progress number.

type Settled<T> = PromiseFulfilledResult<T> | PromiseRejectedResult;

function fulfilled<T>(result: Settled<T>, fallback: T): T {
  // If PrismaPg returns null for a "fulfilled" query (driver adapter bug
  // with select/include), fall through to the fallback. This prevents
  // TypeError when accessing properties on null (e.g. null[0].field).
  if (result.status === 'fulfilled' && result.value != null) return result.value;
  return fallback;
}

export async function calculateProgress(userId: string): Promise<Record<string, number>> {
  const results = await Promise.allSettled([
    // 1. Meditation sessions
    db.meditationSession.count({ where: { userId } }),

    // 2. Journal entries
    db.journalEntry.count({ where: { userId } }),

    // 3. Wellness logs
    db.wellnessLog.count({ where: { userId } }),

    // 4. Habit logs (habits created)
    db.habitLog.count({ where: { userId } }),

    // 5. Max habit streak
    db.habitLog.findMany({
      where: { userId },
      orderBy: { streak: 'desc' },
      take: 1,
    }),

    // 6. Nutrition logs
    db.nutritionLog.count({ where: { userId } }),

    // 7-9. Finance logs — consolidated from 3 separate count queries into 1 groupBy
    db.financeLog.groupBy({
      by: ['type'],
      where: { userId },
      _count: { type: true },
    }),

    // 10. User data (createdAt)
    db.user.findUnique({ where: { id: userId } }),

    // 11. Daily check-ins
    db.dailyCheckin.count({ where: { userId } }),

    // 12. Monthly closures
    db.monthlyClosure.count({ where: { userId } }),

    // 13. Empires with activity (xp > 0) — also used to derive level for hidden_empire_balance
    db.empireProgress.findMany({
      where: { userId, xp: { gt: 0 } },
    }),

    // 14. Journal entries with gratitude
    db.journalEntry.count({
      where: { userId, gratitude: { not: null } },
    }),

    // 15. Finance logs with contexto ("¿Qué pasó?")
    db.financeLog.count({
      where: { userId, contexto: { not: null } },
    }),

    // 16. Distinct meditation types
    db.meditationSession.findMany({
      where: { userId },
      distinct: ['type'],
    }),

    // 17. Distinct wellness moods
    db.wellnessLog.findMany({
      where: { userId },
      distinct: ['mood'],
    }),

    // 18. REMOVED — empire level is now derived from XP (query #13) using the
    // same formula as GET /api/empire: Math.floor(xp / 100) + 1.
    // The stored `level` field was never updated, making the old query always return 0.

    // 19. Recent check-ins for comeback & streak detection
    db.dailyCheckin.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 60,
    }),
  ]);

  const meditationCount     = fulfilled(results[0],  0);
  const journalCount        = fulfilled(results[1],  0);
  const wellnessCount       = fulfilled(results[2],  0);
  const habitsCount         = fulfilled(results[3],  0);
  const maxStreakResult     = fulfilled(results[4],  [] as { streak: number }[]);
  const nutritionCount      = fulfilled(results[5],  0);
  const financeGroupBy      = fulfilled(results[6],  [] as { type: string; _count: { type: number } }[]);
  const userData            = fulfilled(results[7],  null as { createdAt: Date } | null);
  const checkinCount        = fulfilled(results[8],  0);
  const monthlyClosureCount = fulfilled(results[9],  0);
  const empireActiveResult  = fulfilled(results[10], [] as { empire: string; xp: number }[]);
  const gratitudeCount      = fulfilled(results[11], 0);
  const financeContextCount = fulfilled(results[12], 0);
  const meditationTypeResult = fulfilled(results[13], [] as { type: string }[]);
  const wellnessMoodResult  = fulfilled(results[14], [] as { mood: number }[]);
  // Derive empires with level >= 5 from XP, using the same formula as GET /api/empire.
  // This replaces the old query #18 which checked the stored `level` field (never updated).
  const XP_PER_LEVEL = 100;
  const empireHighLevelResult = empireActiveResult.filter(ep => Math.floor(ep.xp / XP_PER_LEVEL) + 1 >= 5);
  const recentCheckins      = fulfilled(results[15], [] as { date: Date }[]);

  // Extract finance counts from groupBy result (was 3 separate queries)
  let financeCount = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  for (const row of financeGroupBy) {
    financeCount += row._count.type;
    if (row.type === 'income') incomeCount = row._count.type;
    if (row.type === 'expense') expenseCount = row._count.type;
  }

  const progress: Record<string, number> = {};
  const maxStreak = maxStreakResult[0]?.streak || 0;

  // ─── Visible: Meditación ──────────────────
  progress['meditation_first'] = Math.min(meditationCount, 1);
  progress['meditation_10'] = Math.min(meditationCount, 10);
  progress['meditation_30'] = Math.min(meditationCount, 30);
  progress['meditation_100'] = Math.min(meditationCount, 100);

  // ─── Visible: Diario ──────────────────────
  progress['journal_first'] = Math.min(journalCount, 1);
  progress['journal_10'] = Math.min(journalCount, 10);
  progress['journal_30'] = Math.min(journalCount, 30);
  progress['journal_100'] = Math.min(journalCount, 100);

  // ─── Visible: Bienestar ───────────────────
  progress['wellness_first'] = Math.min(wellnessCount, 1);
  progress['wellness_15'] = Math.min(wellnessCount, 15);
  progress['wellness_50'] = Math.min(wellnessCount, 50);

  // ─── Visible: Hábitos ─────────────────────
  progress['habits_first'] = Math.min(habitsCount, 1);
  progress['habits_5'] = Math.min(habitsCount, 5);
  progress['habits_steady_14'] = Math.min(maxStreak, 14);

  // ─── Visible: Nutrición ───────────────────
  progress['nutrition_first'] = Math.min(nutritionCount, 1);
  progress['nutrition_15'] = Math.min(nutritionCount, 15);
  progress['nutrition_50'] = Math.min(nutritionCount, 50);

  // ─── Visible: Finanzas ────────────────────
  progress['finance_first'] = Math.min(financeCount, 1);
  progress['finance_income_first'] = Math.min(incomeCount, 1);
  progress['finance_20'] = Math.min(financeCount, 20);
  progress['finance_50'] = Math.min(financeCount, 50);

  // ─── Visible: Check-in & General ──────────
  progress['checkin_first'] = Math.min(checkinCount, 1);
  progress['checkin_7'] = Math.min(checkinCount, 7);
  progress['checkin_30'] = Math.min(checkinCount, 30);
  progress['empire_all'] = Math.min(empireActiveResult.length, 5);
  progress['monthly_closure_first'] = Math.min(monthlyClosureCount, 1);
  progress['monthly_closure_3'] = Math.min(monthlyClosureCount, 3);

  // ─── Hidden: Tiempo ───────────────────────
  if (userData) {
    const daysSince = Math.floor((Date.now() - userData.createdAt.getTime()) / 86400000);
    progress['hidden_one_year'] = Math.min(daysSince, 365);
  } else {
    progress['hidden_one_year'] = 0;
  }

  // Distinct months with check-ins
  const distinctMonths = new Set(
    recentCheckins.map(c => {
      const d = new Date(c.date);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    })
  );
  progress['hidden_six_months_present'] = Math.min(distinctMonths.size, 6);

  // ─── Hidden: Profundidad ──────────────────
  progress['hidden_gratitude_10'] = Math.min(gratitudeCount, 10);
  progress['hidden_finance_context_10'] = Math.min(financeContextCount, 10);
  progress['hidden_meditation_3_types'] = Math.min(meditationTypeResult.length, 3);
  progress['hidden_wellness_all_moods'] = Math.min(wellnessMoodResult.length, 5);
  progress['hidden_habit_steady_30'] = Math.min(maxStreak, 30);

  // ─── Hidden: Ritmo largo ──────────────────
  progress['hidden_checkin_100'] = Math.min(checkinCount, 100);
  progress['hidden_journal_200'] = Math.min(journalCount, 200);
  progress['hidden_meditation_200'] = Math.min(meditationCount, 200);
  progress['hidden_wellness_100'] = Math.min(wellnessCount, 100);
  progress['hidden_nutrition_100'] = Math.min(nutritionCount, 100);

  // ─── Hidden: Equilibrio y momentos ────────
  // Dos Direcciones: minimum of income and expense counts
  progress['hidden_finance_both_5'] = Math.min(Math.min(incomeCount, expenseCount), 5);

  progress['hidden_monthly_closure_6'] = Math.min(monthlyClosureCount, 6);
  progress['hidden_empire_balance'] = Math.min(empireHighLevelResult.length, 3);

  // Regreso: detect gap of 7+ days between consecutive check-ins
  let hasComeback = false;
  if (recentCheckins.length >= 2) {
    for (let i = 0; i < recentCheckins.length - 1; i++) {
      const current = new Date(recentCheckins[i].date);
      const previous = new Date(recentCheckins[i + 1].date);
      const gapDays = Math.floor(
        (current.getTime() - previous.getTime()) / 86400000
      );
      if (gapDays >= 7) {
        hasComeback = true;
        break;
      }
    }
  }
  progress['hidden_comeback'] = hasComeback ? 1 : 0;

  // Siete Mañanas: 7 consecutive check-ins
  // Uses getMadridDateKey() for timezone-safe date normalization — same
  // source of truth as Dashboard, Momentum, Mentor, Silent Memories, Challenges.
  let consecutiveDays = 0;
  if (recentCheckins.length > 0) {
    const uniqueDays = new Set(
      recentCheckins.map(c => getMadridDateKey(new Date(c.date)))
    );

    // Start from today (Madrid); if no activity today, start from yesterday
    let checkDateStr = getTodayDateKey();
    if (!uniqueDays.has(checkDateStr)) {
      const todayMs = new Date(checkDateStr + 'T12:00:00Z').getTime();
      checkDateStr = getMadridDateKey(new Date(todayMs - 86400000));
    }

    while (uniqueDays.has(checkDateStr)) {
      consecutiveDays++;
      const checkMs = new Date(checkDateStr + 'T12:00:00Z').getTime();
      checkDateStr = getMadridDateKey(new Date(checkMs - 86400000));
    }
  }
  progress['hidden_streak_7_checkin'] = Math.min(consecutiveDays, 7);

  // Trayectoria Económica
  progress['hidden_finance_100'] = Math.min(financeCount, 100);

  return progress;
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
      } catch {
        // Unique constraint violation — already unlocked by concurrent request
        // Silently ignore
      }
    }
  }

  return { newlyUnlocked, progressData, unlockedKeys };
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
