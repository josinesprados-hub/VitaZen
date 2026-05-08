export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { generateWeeklyInsights, type WeeklySummary, type WeeklyComparison, type Insight } from '@/lib/insights';
import { getEmotionalState, type EmotionalState } from '@/lib/emotional-state';

// ═══════════════════════════════════════════
// WEEKLY RECAP API
// Reuses existing insights + emotional state
// engines. No duplicated logic. No AI.
// ═══════════════════════════════════════════

export interface WeeklyRecapData {
  // Week label
  weekLabel: string;

  // Wellness score 0-100
  score: number;
  scoreLabel: string;

  // Weekly progress summary
  progress: {
    totalActivities: number;
    checkins: number;
    habitsCompleted: number;
    meditationSessions: number;
    journalEntries: number;
  };

  // Most consistent habits
  topHabits: {
    name: string;
    streak: number;
  }[];

  // General emotional state
  emotionalState: {
    status: string;
    statusLabel: string;
    statusDescription: string;
    energy: number;
    focus: number;
    calm: number;
    consistency: number;
    recommendation: string;
  };

  // Evolution vs previous week (PREMIUM only)
  evolution: {
    emotionTrend: number;
    energyTrend: number;
    stressTrend: number;
    activityTrend: number;
    meditationTrend: number;
    habitTrend: number;
  } | null;

  // Main insight of the week (top 1 insight)
  mainInsight: Insight | null;

  // Soft mentor recommendation based on state
  mentorRecommendation: string;

  // Plan
  plan: string;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excelente';
  if (score >= 60) return 'Bueno';
  if (score >= 40) return 'Mejorable';
  return 'En desarrollo';
}

function generateMentorRecommendation(
  summary: WeeklySummary,
  emotional: EmotionalState,
  comparison: WeeklyComparison | null,
  isPremium: boolean
): string {
  // Priority: stress > energy > consistency > general progress

  // High stress
  if (emotional.metrics.stress.value <= 35) {
    if (isPremium && comparison && comparison.stressTrend < -0.3) {
      return 'Tu estrés ha aumentado esta semana. Te sugiero añadir una sesión de respiración consciente antes de dormir y reducir estímulos la última hora del día.';
    }
    return 'Tu estrés está elevado. Prueba una respiración consciente de 5 minutos antes de las comidas — puede marcar la diferencia.';
  }

  // Low energy
  if (emotional.metrics.energy.value <= 35) {
    return 'Tu energía está baja. Revisa tu descanso y prioriza lo esencial. A veces, hacer menos pero mejor recarga más.';
  }

  // Good consistency
  if (emotional.metrics.consistency.value >= 65) {
    return 'Tu consistencia es notable. Aprovecha este momento para consolidar un hábito nuevo antes de que el momentum baje.';
  }

  // Improving
  if (isPremium && comparison) {
    if (comparison.energyTrend > 0.5 && comparison.emotionTrend > 0) {
      return 'Tu energía y emociones están mejorando. Mantén lo que estás haciendo — está funcionando. Ahora es buen momento para añadir un reto pequeño.';
    }
    if (comparison.activityTrend > 3) {
      return 'Tu actividad ha crecido esta semana. Buen impulso. Sigue así y recuerda que la calidad importa más que la cantidad.';
    }
    if (comparison.activityTrend <= -5) {
      return 'Tu actividad ha bajado esta semana. No es un problema — solo información. Retoma cuando estés listo, sin presión.';
    }
  }

  // General encouraging
  if (summary.score >= 50) {
    return 'Vas por buen camino. La clave no es la perfección, sino la dirección. Sigue sumando acciones pequeñas y consistentes.';
  }

  return 'Cada paso cuenta. Empieza por lo más simple hoy: un check-in, un hábito, 5 minutos de meditación. El momentum se construye desde lo pequeño.';
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const isPremium = user.plan === 'PREMIUM';

    // Reuse existing engines — no duplicated logic
    const [insightsResult, emotionalResult] = await Promise.all([
      generateWeeklyInsights(user.id, user.plan),
      getEmotionalState(user.id, user.plan),
    ]);

    const { summary, insights, comparison } = insightsResult;

    // Extract top habits from existing data
    const topHabits = await getTopHabits(user.id);

    // Build main insight (top priority insight)
    const mainInsight = insights.length > 0 ? insights[0] : null;

    // Generate mentor recommendation
    const mentorRecommendation = generateMentorRecommendation(summary, emotionalResult, comparison, isPremium);

    const recap: WeeklyRecapData = {
      weekLabel: summary.weekLabel,
      score: summary.score,
      scoreLabel: getScoreLabel(summary.score),
      progress: {
        totalActivities: summary.totalActivities,
        checkins: summary.checkins.count,
        habitsCompleted: summary.habits.completed,
        meditationSessions: summary.meditation.sessions,
        journalEntries: summary.journal.entries,
      },
      topHabits,
      emotionalState: {
        status: emotionalResult.status,
        statusLabel: emotionalResult.statusLabel,
        statusDescription: emotionalResult.statusDescription,
        energy: emotionalResult.metrics.energy.value,
        focus: emotionalResult.metrics.focus.value,
        calm: emotionalResult.metrics.stress.value,
        consistency: emotionalResult.metrics.consistency.value,
        recommendation: emotionalResult.recommendation,
      },
      evolution: comparison,
      mainInsight,
      mentorRecommendation,
      plan: user.plan,
    };

    return NextResponse.json(recap);
  } catch (error) {
    console.error('Weekly recap error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// Get top habits with streaks
// Reuses DB directly — no new logic
// ─────────────────────────────────────────

async function getTopHabits(userId: string): Promise<{ name: string; streak: number }[]> {
  const { db } = await import('@/lib/db');
  const habits = await db.habitLog.findMany({
    where: { userId, streak: { gt: 0 } },
    orderBy: { streak: 'desc' },
    take: 3,
    select: { name: true, streak: true },
  });
  return habits;
}
