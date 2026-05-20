import { db } from './db';
import { formatCurrency } from './utils';

// ═══════════════════════════════════════════
// WEEKLY INSIGHTS ENGINE
// Generates insights from real user data using
// simple pattern detection rules — no AI needed.
// ═══════════════════════════════════════════

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export interface Insight {
  id: string;
  type: 'positive' | 'warning' | 'neutral' | 'trend';
  category: string;
  icon: string;
  title: string;
  description: string;
  value?: string;
}

export interface WeeklySummary {
  weekLabel: string;
  score: number; // 0-100 overall wellness score
  totalActivities: number;
  checkins: { count: number; avgEmotion: number; avgEnergy: number; avgFocus: number; avgStress: number };
  habits: { completed: number; topStreak: number; topHabit: string | null };
  meditation: { sessions: number; totalMinutes: number; avgDuration: number };
  journal: { entries: number };
  wellness: { logs: number; avgMood: number; avgSleep: number };
  nutrition: { logs: number; avgWater: number };
  finance: { income: number; expense: number; balance: number };
  streaks: { bestEmpireStreak: number; bestEmpireName: string | null };
}

export interface WeeklyComparison {
  emotionTrend: number;   // positive = improving
  energyTrend: number;
  stressTrend: number;    // positive = reducing (good)
  activityTrend: number;  // this week vs previous week total activities
  meditationTrend: number;
  habitTrend: number;
}

export interface InsightsResult {
  summary: WeeklySummary;
  insights: Insight[];
  comparison: WeeklyComparison | null; // null for FREE users
  plan: string;
}

// ─────────────────────────────────────────
// Data gathering
// ─────────────────────────────────────────

export interface RawData {
  thisWeekCheckins: any[];
  prevWeekCheckins: any[];
  thisWeekHabits: any[];
  allHabits: any[];
  thisWeekMeditations: any[];
  prevWeekMeditations: any[];
  thisWeekJournals: any[];
  prevWeekJournals: any[];
  thisWeekWellness: any[];
  prevWeekWellness: any[];
  thisWeekNutrition: any[];
  thisWeekFinance: any[];
  prevWeekFinance: any[];
  empireProgress: any[];
}

export async function gatherData(userId: string): Promise<RawData> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

  const [
    thisWeekCheckins,
    prevWeekCheckins,
    thisWeekHabits,
    allHabits,
    thisWeekMeditations,
    prevWeekMeditations,
    thisWeekJournals,
    prevWeekJournals,
    thisWeekWellness,
    prevWeekWellness,
    thisWeekNutrition,
    thisWeekFinance,
    prevWeekFinance,
    empireProgress,
  ] = await Promise.all([
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      orderBy: { date: 'desc' },
    }),
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      orderBy: { date: 'desc' },
    }),
    db.habitLog.findMany({
      where: { userId, lastCompletedAt: { gte: sevenDaysAgo } },
    }),
    db.habitLog.findMany({
      where: { userId, streak: { gt: 0 } },
      orderBy: { streak: 'desc' },
    }),
    db.meditationSession.findMany({
      where: { userId, completedAt: { gte: sevenDaysAgo } },
      orderBy: { completedAt: 'desc' },
    }),
    db.meditationSession.findMany({
      where: { userId, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    db.journalEntry.findMany({
      where: { userId, createdAt: { gte: sevenDaysAgo } },
    }),
    db.journalEntry.findMany({
      where: { userId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    db.wellnessLog.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      orderBy: { date: 'desc' },
    }),
    db.wellnessLog.findMany({
      where: { userId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    db.nutritionLog.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
    }),
    db.financeLog.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      select: { type: true, amount: true },
    }),
    db.financeLog.findMany({
      where: { userId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      select: { type: true, amount: true },
    }),
    db.empireProgress.findMany({
      where: { userId },
    }),
  ]);

  return {
    thisWeekCheckins,
    prevWeekCheckins,
    thisWeekHabits,
    allHabits,
    thisWeekMeditations,
    prevWeekMeditations,
    thisWeekJournals,
    prevWeekJournals,
    thisWeekWellness,
    prevWeekWellness,
    thisWeekNutrition,
    thisWeekFinance,
    prevWeekFinance,
    empireProgress,
  };
}

// ─────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sumFinance(logs: any[]): { income: number; expense: number } {
  const income = logs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
  const expense = logs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);
  return { income, expense };
}

const EMPIRE_NAMES: Record<string, string> = {
  disciplina: 'Disciplina',
  mente: 'Mente',
  energia: 'Energía',
  riqueza: 'Finanzas',
  crecimiento: 'Crecimiento',
};

// ─────────────────────────────────────────
// Build summary
// ─────────────────────────────────────────

function buildSummary(data: RawData): WeeklySummary {
  const checkins = {
    count: data.thisWeekCheckins.length,
    avgEmotion: Math.round(avg(data.thisWeekCheckins.map((c: any) => c.emotion)) * 10) / 10,
    avgEnergy: Math.round(avg(data.thisWeekCheckins.map((c: any) => c.energy)) * 10) / 10,
    avgFocus: Math.round(avg(data.thisWeekCheckins.map((c: any) => c.focus)) * 10) / 10,
    avgStress: Math.round(avg(data.thisWeekCheckins.map((c: any) => c.stress)) * 10) / 10,
  };

  const topHabit = data.allHabits.length > 0 ? data.allHabits[0] : null;
  const habits = {
    completed: data.thisWeekHabits.length,
    topStreak: topHabit?.streak || 0,
    topHabit: topHabit?.name || null,
  };

  const totalMinutes = data.thisWeekMeditations.reduce((s: number, m: any) => s + m.duration, 0);
  const meditation = {
    sessions: data.thisWeekMeditations.length,
    totalMinutes,
    avgDuration: data.thisWeekMeditations.length > 0 ? Math.round(totalMinutes / data.thisWeekMeditations.length) : 0,
  };

  const journal = { entries: data.thisWeekJournals.length };

  const wellness = {
    logs: data.thisWeekWellness.length,
    avgMood: Math.round(avg(data.thisWeekWellness.map((w: any) => w.mood)) * 10) / 10,
    avgSleep: Math.round(avg(data.thisWeekWellness.map((w: any) => w.sleep)) * 10) / 10,
  };

  const nutrition = {
    logs: data.thisWeekNutrition.length,
    avgWater: Math.round(avg(data.thisWeekNutrition.map((n: any) => n.water)) * 10) / 10,
  };

  const finThis = sumFinance(data.thisWeekFinance);
  const finance = {
    income: Math.round(finThis.income * 100) / 100,
    expense: Math.round(finThis.expense * 100) / 100,
    balance: Math.round((finThis.income - finThis.expense) * 100) / 100,
  };

  const bestEmpire = data.empireProgress
    .filter((e: any) => e.streak > 0)
    .sort((a: any, b: any) => b.streak - a.streak)[0];
  const streaks = {
    bestEmpireStreak: bestEmpire?.streak || 0,
    bestEmpireName: bestEmpire ? EMPIRE_NAMES[bestEmpire.empire] || bestEmpire.empire : null,
  };

  const totalActivities = checkins.count + habits.completed + meditation.sessions + journal.entries + wellness.logs;
  const score = calculateWellnessScore(checkins, habits, meditation, journal, wellness);

  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const weekLabel = `${weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — ${now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;

  return {
    weekLabel,
    score,
    totalActivities,
    checkins,
    habits,
    meditation,
    journal,
    wellness,
    nutrition,
    finance,
    streaks,
  };
}

function calculateWellnessScore(
  checkins: any,
  habits: any,
  meditation: any,
  journal: any,
  wellness: any
): number {
  let score = 0;

  // Check-in consistency (0-20)
  score += Math.min(checkins.count / 5, 1) * 20;

  // Emotional average (0-20)
  score += (checkins.avgEmotion / 5) * 20;

  // Habit completion (0-20)
  score += Math.min(habits.completed / 7, 1) * 20;

  // Meditation (0-20)
  score += Math.min(meditation.sessions / 4, 1) * 20;

  // Journal (0-10) + Wellness logs (0-10)
  score += Math.min(journal.entries / 3, 1) * 10;
  score += Math.min(wellness.logs / 4, 1) * 10;

  return Math.round(Math.min(score, 100));
}

// ─────────────────────────────────────────
// Build comparison (PREMIUM only)
// ─────────────────────────────────────────

function buildComparison(data: RawData): WeeklyComparison {
  const thisEmotion = avg(data.thisWeekCheckins.map((c: any) => c.emotion));
  const prevEmotion = avg(data.prevWeekCheckins.map((c: any) => c.emotion));
  const thisEnergy = avg(data.thisWeekCheckins.map((c: any) => c.energy));
  const prevEnergy = avg(data.prevWeekCheckins.map((c: any) => c.energy));
  const thisStress = avg(data.thisWeekCheckins.map((c: any) => c.stress));
  const prevStress = avg(data.prevWeekCheckins.map((c: any) => c.stress));

  const thisActivity =
    data.thisWeekCheckins.length +
    data.thisWeekHabits.length +
    data.thisWeekMeditations.length +
    data.thisWeekJournals.length +
    data.thisWeekWellness.length;

  const prevActivity =
    data.prevWeekCheckins.length +
    data.prevWeekJournals.length + // prevWeekHabits not fetched, approximate
    data.prevWeekMeditations.length +
    data.prevWeekJournals.length +
    data.prevWeekWellness.length;

  return {
    emotionTrend: Math.round((thisEmotion - prevEmotion) * 10) / 10,
    energyTrend: Math.round((thisEnergy - prevEnergy) * 10) / 10,
    stressTrend: Math.round((prevStress - thisStress) * 10) / 10, // positive = stress reduced = good
    activityTrend: thisActivity - prevActivity,
    meditationTrend: data.thisWeekMeditations.length - data.prevWeekMeditations.length,
    habitTrend: data.thisWeekHabits.length - data.prevWeekJournals.length, // approximate
  };
}

// ─────────────────────────────────────────
// Generate insights from data using simple rules
// ─────────────────────────────────────────

function generateInsights(summary: WeeklySummary, comparison: WeeklyComparison | null, plan: string): Insight[] {
  const insights: Insight[] = [];
  let id = 0;
  const isPremium = plan === 'PREMIUM';

  // 1. Emotional patterns
  if (summary.checkins.count >= 2) {
    if (summary.checkins.avgEmotion >= 4) {
      insights.push({
        id: `insight-${id++}`,
        type: 'positive',
        category: 'emociones',
        icon: '😊',
        title: 'Emociones por encima de 4',
        description: isPremium
          ? `Promedio ${summary.checkins.avgEmotion}/5 esta semana. ${comparison && comparison.emotionTrend > 0 ? 'Mejoró respecto a la anterior.' : ''}`
          : `Promedio ${summary.checkins.avgEmotion}/5 esta semana.`,
      });
    } else if (summary.checkins.avgEmotion <= 2.5) {
      insights.push({
        id: `insight-${id++}`,
        type: 'warning',
        category: 'emociones',
        icon: '💭',
        title: 'Emociones por debajo de 2.5',
        description: isPremium
          ? `Promedio ${summary.checkins.avgEmotion}/5. ${comparison && comparison.emotionTrend < 0 ? 'Bajó respecto a la semana pasada.' : ''}`
          : `Promedio ${summary.checkins.avgEmotion}/5.`,
      });
    }
  }

  // 2. Energy patterns
  if (summary.checkins.avgEnergy >= 4) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'energía',
      icon: '⚡',
      title: 'Energía alta',
      description: isPremium
        ? `Promedio ${summary.checkins.avgEnergy}/5. ${comparison && comparison.energyTrend > 0 ? 'Mejoró desde la semana pasada.' : ''}`
        : `Promedio ${summary.checkins.avgEnergy}/5.`,
    });
  } else if (summary.checkins.avgEnergy <= 2.5 && summary.checkins.count > 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'warning',
      category: 'energía',
      icon: '🔋',
      title: 'Energía baja',
      description: isPremium
        ? `Promedio ${summary.checkins.avgEnergy}/5. Sueño, nutrición y movimiento.`
        : `Promedio ${summary.checkins.avgEnergy}/5.`,
    });
  }

  // 3. Stress patterns
  if (summary.checkins.avgStress >= 4 && summary.checkins.count > 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'warning',
      category: 'estrés',
      icon: '🧘',
      title: 'Estrés elevado',
      description: isPremium
        ? `Promedio ${summary.checkins.avgStress}/5. ${comparison && comparison.stressTrend < 0 ? 'Subió respecto a la semana pasada.' : ''}`
        : `Promedio ${summary.checkins.avgStress}/5.`,
    });
  } else if (summary.checkins.avgStress <= 2 && summary.checkins.count > 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'estrés',
      icon: '🌿',
      title: 'Poca presión',
      description: `Promedio ${summary.checkins.avgStress}/5.`,
    });
  }

  // 4. Habit consistency
  if (summary.habits.topStreak >= 7) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'hábitos',
      icon: '🔥',
      title: `${summary.habits.topStreak} días seguidos`,
      description: isPremium
        ? `"${summary.habits.topHabit}" lleva ${summary.habits.topStreak} días.`
        : `Tu mejor racha: ${summary.habits.topStreak} días.`,
    });
  } else if (summary.habits.completed === 0 && summary.habits.topStreak === 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'neutral',
      category: 'hábitos',
      icon: '📝',
      title: 'Sin hábitos activos',
      description: '',
    });
  }

  // 5. Meditation patterns
  if (summary.meditation.sessions >= 4) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'meditación',
      icon: '🧠',
      title: `${summary.meditation.sessions} sesiones`,
      description: isPremium
        ? `${summary.meditation.sessions} sesiones (${summary.meditation.totalMinutes} min). ${comparison && comparison.meditationTrend > 0 ? 'Más que la semana pasada.' : ''}`
        : `${summary.meditation.sessions} sesiones esta semana.`,
    });
  } else if (summary.meditation.sessions === 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'neutral',
      category: 'meditación',
      icon: '🍃',
      title: 'Sin meditación',
      description: '',
    });
  }

  // 6. Activity drop detection
  if (comparison && comparison.activityTrend <= -5) {
    insights.push({
      id: `insight-${id++}`,
      type: 'warning',
      category: 'actividad',
      icon: '📉',
      title: 'Menos actividad',
      description: `${Math.abs(comparison.activityTrend)} acciones menos que la semana anterior.`,
    });
  }

  // 7. High consistency
  if (summary.totalActivities >= 20) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'consistencia',
      icon: '🏆',
      title: `${summary.totalActivities} actividades`,
      description: isPremium
        ? `${summary.totalActivities} acciones esta semana. ${comparison && comparison.activityTrend > 0 ? 'Más que la semana pasada.' : ''}`
        : `${summary.totalActivities} acciones esta semana.`,
    });
  }

  // 8. Journal reflection
  if (summary.journal.entries >= 3) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'diario',
      icon: '✍️',
      title: `${summary.journal.entries} entradas`,
      description: `${summary.journal.entries} entradas en tu diario esta semana.`,
    });
  }

  // 9. Wellness score insight
  if (summary.score >= 75) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'bienestar',
      icon: '⭐',
      title: 'Buena semana',
      description: isPremium
        ? `${summary.score}/100. ${comparison && comparison.activityTrend > 0 ? 'Mejoró respecto a la anterior.' : ''}`
        : `${summary.score}/100.`,
    });
  } else if (summary.score <= 30 && summary.totalActivities > 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'neutral',
      category: 'bienestar',
      icon: '🌱',
      title: 'Semana tranquila',
      description: isPremium
        ? `${summary.score}/100. Punto de partida. Un área, un paso.`
        : `${summary.score}/100.`,
    });
  }

  // 10. Nutrition
  if (summary.nutrition.logs >= 3 && summary.nutrition.avgWater >= 7) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'nutrición',
      icon: '💧',
      title: 'Buena hidratación',
      description: `Promedio de ${summary.nutrition.avgWater} vasos diarios.`,
    });
  }

  // 11. Empire streak
  if (summary.streaks.bestEmpireStreak >= 5 && summary.streaks.bestEmpireName) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'imperios',
      icon: '⚔️',
      title: `${summary.streaks.bestEmpireStreak} días en ${summary.streaks.bestEmpireName}`,
      description: `${summary.streaks.bestEmpireStreak} días seguidos.`,
    });
  }

  // 12. Finance balance
  if (summary.finance.balance > 0 && summary.finance.income > 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'positive',
      category: 'finanzas',
      icon: '💰',
      title: 'Balance positivo',
      description: isPremium
        ? `Ingresos por encima de gastos (+${formatCurrency(summary.finance.balance)}).`
        : `+${formatCurrency(summary.finance.balance)} esta semana.`,
    });
  } else if (summary.finance.balance < 0) {
    insights.push({
      id: `insight-${id++}`,
      type: 'warning',
      category: 'finanzas',
      icon: '💳',
      title: 'Gastos por encima de ingresos',
      description: isPremium
        ? `Gastos superan ingresos en ${formatCurrency(Math.abs(summary.finance.balance))}.`
        : `Gastos por encima de ingresos esta semana.`,
    });
  }

  // PREMIUM: Week-over-week trends (not recommendations)
  if (isPremium && comparison) {
    if (comparison.stressTrend < -0.5) {
      insights.push({
        id: `insight-${id++}`,
        type: 'trend',
        category: 'tendencia',
        icon: '🎯',
        title: 'Estrés en subida',
        description: 'Tu estrés subió esta semana.',
      });
    }
    if (comparison.energyTrend > 0.5) {
      insights.push({
        id: `insight-${id++}`,
        type: 'trend',
        category: 'tendencia',
        icon: '🎯',
        title: 'Energía mejorando',
        description: 'Tu energía está mejorando.',
      });
    }
  }

  // Limit insights: FREE gets 3, PREMIUM gets 5
  const maxInsights = isPremium ? 5 : 3;

  // Prioritize: positive first, then warnings, then neutral/trends
  const priorityOrder: Record<string, number> = { positive: 0, warning: 1, trend: 2, neutral: 3 };
  insights.sort((a, b) => priorityOrder[a.type] - priorityOrder[b.type]);

  return insights.slice(0, maxInsights);
}

// ─────────────────────────────────────────
// Main function
// ─────────────────────────────────────────

export async function generateWeeklyInsights(userId: string, plan: string): Promise<InsightsResult> {
  const data = await gatherData(userId);
  const summary = buildSummary(data);
  const comparison = plan === 'PREMIUM' ? buildComparison(data) : null;
  const insights = generateInsights(summary, comparison, plan);

  return {
    summary,
    insights,
    comparison,
    plan,
  };
}
