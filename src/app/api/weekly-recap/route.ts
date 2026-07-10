export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { generateWeeklyInsights, gatherData, type WeeklySummary, type WeeklyComparison, type Insight } from '@/lib/insights';
import { getEmotionalState, type EmotionalState } from '@/lib/emotional-state';
import { trackEvent } from '@/lib/analytics-server';

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
  if (score >= 80) return 'Muy activo';
  if (score >= 60) return 'Actividad moderada';
  if (score >= 40) return 'Semana tranquila';
  return 'Poca actividad';
}

function generateMentorRecommendation(
  summary: WeeklySummary,
  emotional: EmotionalState,
  comparison: WeeklyComparison | null,
  isPremium: boolean
): string {
  // Observation, not advice. The app notices. It doesn't tell you what to do.

  // High stress
  if (emotional.metrics.stress.value <= 35) {
    if (isPremium && comparison && comparison.stressTrend < -0.3) {
      return 'La presión subió esta semana.';
    }
    return 'Semana con peso.';
  }

  // Low energy
  if (emotional.metrics.energy.value <= 35) {
    return 'Poca energía.';
  }

  // Good consistency
  if (emotional.metrics.consistency.value >= 65) {
    return 'Buen ritmo.';
  }

  // Improving
  if (isPremium && comparison) {
    if (comparison.energyTrend > 0.5 && comparison.emotionTrend > 0) {
      return 'La energía y el ánimo mejoraron.';
    }
    if (comparison.activityTrend > 3) {
      return 'Más actividad esta semana.';
    }
    if (comparison.activityTrend <= -5) {
      return 'Menos actividad esta semana.';
    }
  }

  // Moderate activity
  if (summary.score >= 50) {
    return 'Semana razonable.';
  }

  return '';
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

    // ═══ PERFORMANCE FIX: Call gatherData() ONCE, share with both engines ═══
    // Previously: generateWeeklyInsights() + getEmotionalState() each called
    // gatherData() independently = 28 DB queries where 14 suffice.
    // Now: fetch data once, pass to both, and run them in parallel.
    const sharedData = await gatherData(user.id);

    const [insightsResult, emotionalResult] = await Promise.all([
      generateWeeklyInsights(user.id, user.plan, sharedData),
      getEmotionalState(user.id, user.plan, sharedData),
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

    // Track recap opened (before return so it actually executes)
    trackEvent({ event: 'recap_opened', userId: user.id, properties: { plan: user.plan } });

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
