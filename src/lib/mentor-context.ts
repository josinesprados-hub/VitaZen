import { db } from './db';
import { getEmotionalState, type EmotionalState } from './emotional-state';
import { detectPatterns } from './patterns/detector';
import type { CrossEmpireData } from './patterns/types';
import { detectLifeStages, getPastMonths, type LifeStage, type StageTransition, type StageFlavor } from './life-memory/stages';
import type { SilentMemoryType } from './silent-memories/shared';

// ═══════════════════════════════════════════
// MENTOR CONTEXT BUILDER
// Gathers recent user activity to personalize
// AI mentor responses with soft contextual awareness
//
// FREE: basic context (recent check-in, streaks summary)
// PREMIUM: full context (emotional trends, habits detail,
//   meditations, conversations, empire progress, weekly activity)
// ═══════════════════════════════════════════

interface UserContext {
  userName: string | null;
  plan: string;
  recentCheckins: {
    date: Date;
    emotion: number;
    energy: number;
    focus: number;
    stress: number;
    intention: string;
    note: string | null;
  }[];
  habitStreaks: {
    name: string;
    streak: number;
    lastCompletedAt: Date | null;
  }[];
  recentMeditations: {
    duration: number;
    type: string;
    completedAt: Date;
  }[];
  recentJournals: {
    title: string;
    mood: number | null;
    createdAt: Date;
  }[];
  recentConversations: {
    title: string;
    updatedAt: Date;
    lastMessage: string;
  }[];
  empireProgress: {
    empire: string;
    level: number;
    xp: number;
    streak: number;
  }[];
  weeklyActivity: {
    meditations: number;
    habits: number;
    journals: number;
    checkins: number;
  };
  consistency: {
    activeDaysThisWeek: number;
    trend: 'improving' | 'stable' | 'declining' | 'starting';
  };
  onboardingData: {
    goals: string[];
    primaryFocus: string | null;
    stressLevel: number | null;
    energyLevel: number | null;
    focusLevel: number | null;
    initialHabits: string[];
  } | null;
  wellnessLogs: {
    date: Date;
    sleep: number;
    mood: number;
    stress: number;
    notes: string | null;
  }[];
  financeLogs: {
    type: string;
    category: string;
    mood: string | null;
    contexto: string | null;
    date: Date;
  }[];
  emotionalState: {
    status: string;
    statusLabel: string;
    statusDescription: string;
    summary: string;
    recommendation: string;
  } | null;
  patternObservations: {
    id: string;
    connection: string;
    text: string;
    empires: string[];
    weight: string;
  }[] | null;
  lifeStage: {
    flavor: StageFlavor;
    label: string;
    observation: string;
    monthLabel: string;
    transition: string | null;
  } | null;
  monthlyClosures: {
    month: string;
    hasReflection: boolean;
    reflectedAt: Date | null;
    summaryViewedAt: Date | null;
  }[];
  silentMemories: string[];
}

/**
 * Fetch recent user activity for contextual mentor responses.
 * FREE users get basic context, PREMIUM users get full advanced context.
 * Only pulls the most recent and relevant data — keeps it lightweight.
 */
export async function buildMentorContext(userId: string, plan: string = 'FREE'): Promise<UserContext> {
  const isPremium = plan === 'PREMIUM';
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  // Previous week window for trend comparison
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);

  // Run all queries in parallel for performance
  const [
    recentCheckins,
    habitStreaks,
    recentMeditations,
    recentJournals,
    recentThreads,
    empireProgress,
    weeklyMeditations,
    weeklyJournals,
    weeklyCheckins,
    weeklyHabitLogs,
    prevWeekCheckins,
    user,
    onboardingRow,
    wellnessLogRows,
    financeLogRows,
  ] = await Promise.all([
    // Last check-ins: FREE gets 2, PREMIUM gets 5
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: thirtyDaysAgo } },
      orderBy: { date: 'desc' },
      take: isPremium ? 5 : 2,
    }),

    // Active habits with streaks: FREE gets 4, PREMIUM gets 8
    db.habitLog.findMany({
      where: { userId, streak: { gt: 0 } },
      orderBy: { streak: 'desc' },
      take: isPremium ? 8 : 4,
    }),

    // Meditation sessions: FREE gets 1, PREMIUM gets 5
    db.meditationSession.findMany({
      where: { userId, completedAt: { gte: thirtyDaysAgo } },
      orderBy: { completedAt: 'desc' },
      take: isPremium ? 5 : 1,
    }),

    // Recent journal entries: FREE gets 1, PREMIUM gets 3
    db.journalEntry.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'desc' },
      take: isPremium ? 3 : 1,
      select: { title: true, mood: true, createdAt: true },
    }),

    // Recent conversation threads: FREE gets 1, PREMIUM gets 3
    db.aIThread.findMany({
      where: { userId, archived: false },
      orderBy: { updatedAt: 'desc' },
      take: isPremium ? 3 : 1,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          where: { role: 'user' },
        },
      },
    }),

    // Empire progress: PREMIUM only
    isPremium
      ? db.empireProgress.findMany({ where: { userId } })
      : Promise.resolve([]),

    // Weekly meditation dates: PREMIUM only (for distinct-day counting)
    isPremium
      ? db.meditationSession.findMany({ where: { userId, completedAt: { gte: sevenDaysAgo } }, select: { completedAt: true } })
      : Promise.resolve([] as { completedAt: Date }[]),

    // Weekly journal dates: PREMIUM only (for distinct-day counting)
    isPremium
      ? db.journalEntry.findMany({ where: { userId, createdAt: { gte: sevenDaysAgo } }, select: { createdAt: true } })
      : Promise.resolve([] as { createdAt: Date }[]),

    // Weekly checkin dates: both tiers (for consistency + distinct-day counting)
    db.dailyCheckin.findMany({ where: { userId, date: { gte: sevenDaysAgo } }, select: { date: true } }),

    // Weekly habit log dates: last 7 days (for distinct-day counting)
    db.habitLog.findMany({
      where: { userId, lastCompletedAt: { gte: sevenDaysAgo } },
      select: { lastCompletedAt: true },
    }),

    // Previous week checkin count (for trend): both tiers
    db.dailyCheckin.count({
      where: { userId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),

    // User data
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, plan: true },
    }),

    // Onboarding data: PREMIUM only
    isPremium
      ? db.onboardingData.findUnique({
          where: { userId },
          select: {
            goals: true,
            primaryFocus: true,
            stressLevel: true,
            energyLevel: true,
            focusLevel: true,
            initialHabits: true,
          },
        })
      : Promise.resolve(null),

    // Wellness logs: PREMIUM only — sleep quality + notes (dedup: mood/energy/stress already in DailyCheckin)
    isPremium
      ? db.wellnessLog.findMany({
          where: { userId, date: { gte: fourteenDaysAgo } },
          orderBy: { date: 'desc' },
          take: 7,
          select: { date: true, sleep: true, mood: true, stress: true, notes: true },
        })
      : Promise.resolve([]),

    // Finance logs: PREMIUM only — spending mood patterns + contexto
    isPremium
      ? db.financeLog.findMany({
          where: { userId, date: { gte: thirtyDaysAgo }, type: 'expense' },
          orderBy: { date: 'desc' },
          take: 15,
          select: { type: true, category: true, mood: true, contexto: true, date: true },
        })
      : Promise.resolve([]),
  ]);

  // Derive counts from date arrays (for weeklyActivity display)
  const weeklyMeditationCount = weeklyMeditations.length;
  const weeklyJournalCount = weeklyJournals.length;
  const weeklyCheckinCount = weeklyCheckins.length;
  const weeklyHabitLogCount = weeklyHabitLogs.length;

  // Weekly habit completions (PREMIUM only for display, but count for consistency)
  const weeklyHabits = isPremium
    ? habitStreaks.filter(h => {
        if (!h.lastCompletedAt) return false;
        return h.lastCompletedAt >= sevenDaysAgo;
      }).length
    : weeklyHabitLogCount;

  // Compute consistency signal: count DISTINCT days with any activity
  const activeDaySet = new Set<string>();
  for (const c of weeklyCheckins) activeDaySet.add(toDateKey(c.date));
  for (const h of weeklyHabitLogs) {
    if (h.lastCompletedAt) activeDaySet.add(toDateKey(h.lastCompletedAt));
  }
  for (const m of weeklyMeditations) activeDaySet.add(toDateKey(m.completedAt));
  for (const j of weeklyJournals) activeDaySet.add(toDateKey(j.createdAt));
  const activeDaysThisWeek = Math.min(activeDaySet.size, 7);

  let trend: 'improving' | 'stable' | 'declining' | 'starting' = 'stable';
  if (weeklyCheckinCount <= 1 && prevWeekCheckins <= 1) {
    trend = 'starting';
  } else if (weeklyCheckinCount > prevWeekCheckins + 1) {
    trend = 'improving';
  } else if (weeklyCheckinCount < prevWeekCheckins - 1) {
    trend = 'declining';
  }

  // Parse onboarding data safely (PREMIUM only; null for FREE)
  let onboardingData: UserContext['onboardingData'] = null;
  if (onboardingRow) {
    let parsedGoals: string[] = [];
    try { parsedGoals = JSON.parse(onboardingRow.goals); } catch { /* keep empty */ }
    let parsedHabits: string[] = [];
    try { parsedHabits = JSON.parse(onboardingRow.initialHabits); } catch { /* keep empty */ }
    onboardingData = {
      goals: Array.isArray(parsedGoals) ? parsedGoals : [],
      primaryFocus: onboardingRow.primaryFocus || null,
      stressLevel: onboardingRow.stressLevel,
      energyLevel: onboardingRow.energyLevel,
      focusLevel: onboardingRow.focusLevel,
      initialHabits: Array.isArray(parsedHabits) ? parsedHabits : [],
    };
  }

  // Fetch emotional state from the official engine (PREMIUM only; null for FREE)
  // This is the single source of truth — no recalculation, no duplication.
  let emotionalState: UserContext['emotionalState'] = null;
  if (isPremium) {
    try {
      const es = await getEmotionalState(userId, plan);
      emotionalState = {
        status: es.status,
        statusLabel: es.statusLabel,
        statusDescription: es.statusDescription,
        summary: es.summary,
        recommendation: es.recommendation,
      };
    } catch {
      // Non-blocking: if emotional state fails, continue without it
    }
  }

  // Monthly closure records: consume existing closure records (PREMIUM only; empty for FREE)
  // No recalculation, no summaries — just the fact that closures exist.
  const recentClosures = isPremium
    ? await db.monthlyClosure.findMany({
        where: { userId },
        select: {
          month: true,
          reflection: true,
          reflectedAt: true,
          summaryViewedAt: true,
        },
        orderBy: { month: 'desc' },
        take: 3,
      })
    : [];

  // Life stage detection: consume the official engine result (PREMIUM only; null for FREE)
  // No recalculation, no inference — the engine is the single source of truth for life stages.
  let lifeStage: UserContext['lifeStage'] = null;
  if (isPremium) {
    try {
      const months = getPastMonths(3); // last 3 months
      const { stages, transitions } = await detectLifeStages(userId, months);
      if (stages.length > 0) {
        const current = stages[stages.length - 1]; // most recent month
        const STAGE_FLAVOR_LABELS: Record<StageFlavor, string> = {
          calm: 'Calma',
          growth: 'Crecimiento',
          intensity: 'Intensidad',
          dispersion: 'Dispersión',
          exhaustion: 'Agotamiento',
          quiet: 'Silencio',
          stability: 'Estabilidad',
        };
        // Find the most recent transition (if any)
        const latestTransition = transitions.length > 0 ? transitions[transitions.length - 1] : null;
        lifeStage = {
          flavor: current.flavor,
          label: STAGE_FLAVOR_LABELS[current.flavor] || current.flavor,
          observation: current.observation,
          monthLabel: current.monthLabel,
          transition: latestTransition ? latestTransition.observation : null,
        };
      }
    } catch {
      // Non-blocking: if life stage detection fails, continue without it
    }
  }

  // Pattern detection: consume the official engine result (PREMIUM only; null for FREE)
  // No recalculation, no cross-referencing — the engine is the single source of truth.
  let patternObservations: UserContext['patternObservations'] = null;
  if (isPremium) {
    try {
      const [
        pFinance,
        pWellness,
        pMeditation,
        pHabits,
        pCheckins,
        pJournals,
      ] = await Promise.all([
        db.financeLog.findMany({
          where: { userId, date: { gte: ninetyDaysAgo } },
          select: { date: true, type: true, category: true, amount: true, mood: true, contexto: true },
          orderBy: { date: 'desc' },
        }),
        db.wellnessLog.findMany({
          where: { userId, date: { gte: ninetyDaysAgo } },
          select: { date: true, mood: true, energy: true, sleep: true, stress: true },
          orderBy: { date: 'desc' },
        }),
        db.meditationSession.findMany({
          where: { userId, completedAt: { gte: ninetyDaysAgo } },
          select: { duration: true, type: true, completedAt: true },
          orderBy: { completedAt: 'desc' },
        }),
        db.habitLog.findMany({
          where: { userId },
          select: { name: true, streak: true, lastCompletedAt: true },
        }),
        db.dailyCheckin.findMany({
          where: { userId, date: { gte: ninetyDaysAgo } },
          select: { date: true, emotion: true, energy: true, focus: true, stress: true },
          orderBy: { date: 'desc' },
        }),
        db.journalEntry.findMany({
          where: { userId, createdAt: { gte: ninetyDaysAgo } },
          select: { content: true, mood: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      const crossEmpireData: CrossEmpireData = {
        financeLogs: pFinance.map(l => ({
          date: l.date.toISOString(), type: l.type, category: l.category,
          amount: l.amount, mood: l.mood, contexto: l.contexto,
        })),
        wellnessLogs: pWellness.map(l => ({
          date: l.date.toISOString(), mood: l.mood, energy: l.energy,
          sleep: l.sleep, stress: l.stress,
        })),
        meditationSessions: pMeditation.map(s => ({
          duration: s.duration, type: s.type, completedAt: s.completedAt.toISOString(),
        })),
        habitLogs: pHabits.map(h => ({
          name: h.name, streak: h.streak,
          lastCompletedAt: h.lastCompletedAt?.toISOString() || null,
        })),
        checkins: pCheckins.map(c => ({
          date: c.date.toISOString(), emotion: c.emotion, energy: c.energy,
          focus: c.focus, stress: c.stress,
        })),
        journalEntries: pJournals.map(j => ({
          content: j.content, mood: j.mood, createdAt: j.createdAt.toISOString(),
        })),
      };

      const result = detectPatterns(crossEmpireData);
      if (result.observations.length > 0) {
        patternObservations = result.observations.map(o => ({
          id: o.id,
          connection: o.connection,
          text: o.text,
          empires: o.empires,
          weight: o.weight,
        }));
      }
    } catch {
      // Non-blocking: if pattern detection fails, continue without it
    }
  }

  // Silent Memories: consume official observations (PREMIUM only; empty for FREE)
  // Read from EmotionalDashboardState.memoryState.shown[] — no recalculation, no side effects.
  // These are observations that the Silent Memories engine has already generated
  // and displayed to the user on the dashboard. The mentor only consumes them.
  let silentMemories: string[] = [];
  if (isPremium) {
    try {
      const dashboardState = await db.emotionalDashboardState.findUnique({
        where: { userId },
        select: { memoryState: true },
      });
      if (dashboardState?.memoryState) {
        const memState = JSON.parse(dashboardState.memoryState);
        if (Array.isArray(memState.shown)) {
          // shown[] is chronological (oldest first). We want the most recent.
          silentMemories = memState.shown;
        }
      }
    } catch {
      // Non-blocking: if silent memories aren't available, continue without them
    }
  }

  return {
    userName: user?.name || null,
    plan: user?.plan || 'FREE',
    recentCheckins: recentCheckins.map(c => ({
      date: c.date,
      emotion: c.emotion,
      energy: c.energy,
      focus: c.focus,
      stress: c.stress,
      intention: c.intention,
      note: c.note,
    })),
    habitStreaks: habitStreaks.map(h => ({
      name: h.name,
      streak: h.streak,
      lastCompletedAt: h.lastCompletedAt,
    })),
    recentMeditations: recentMeditations.map(m => ({
      duration: m.duration,
      type: m.type,
      completedAt: m.completedAt,
    })),
    recentJournals: recentJournals.map(j => ({
      title: j.title,
      mood: j.mood,
      createdAt: j.createdAt,
    })),
    recentConversations: recentThreads.map(t => ({
      title: t.title,
      updatedAt: t.updatedAt,
      lastMessage: t.messages[0]?.content?.slice(0, 100) || '',
    })),
    empireProgress: empireProgress.map(e => ({
      empire: e.empire,
      level: e.level,
      xp: e.xp,
      streak: e.streak,
    })),
    weeklyActivity: {
      meditations: weeklyMeditationCount,
      habits: weeklyHabits,
      journals: weeklyJournalCount,
      checkins: weeklyCheckinCount,
    },
    consistency: {
      activeDaysThisWeek,
      trend,
    },
    onboardingData,
    wellnessLogs: wellnessLogRows.map(w => ({
      date: w.date,
      sleep: w.sleep,
      mood: w.mood,
      stress: w.stress,
      notes: w.notes,
    })),
    financeLogs: financeLogRows.map(f => ({
      type: f.type,
      category: f.category,
      mood: f.mood,
      contexto: f.contexto,
      date: f.date,
    })),
    emotionalState,
    patternObservations,
    lifeStage,
    monthlyClosures: recentClosures.map(c => ({
      month: c.month,
      hasReflection: !!c.reflection,
      reflectedAt: c.reflectedAt,
      summaryViewedAt: c.summaryViewedAt,
    })),
    silentMemories,
  };
}

// ═══════════════════════════════════════════
// CONTEXT FORMATTER
// Converts raw data into a concise text block
// for the AI system prompt.
// FREE: basic summary, PREMIUM: full detailed context.
// ═══════════════════════════════════════════

const EMPIRE_NAMES: Record<string, string> = {
  disciplina: 'Disciplina',
  mente: 'Mente',
  energia: 'Energía',
  riqueza: 'Finanzas',
  crecimiento: 'Crecimiento',
};

const EMOTION_LABELS: Record<number, string> = {
  1: 'muy bajo',
  2: 'bajo',
  3: 'neutral',
  4: 'bien',
  5: 'excelente',
};

// ─── Silent Memories: observation → meta lookup ───
// Maps each fixed observation text to its type and rarity.
// Derived from the observer functions in silent-memories/shared.ts.
// Used for deduplication and prioritization in the mentor context.

const OBSERVATION_META: Record<string, { type: SilentMemoryType; rarity: 'rare' | 'very_rare' }> = {
  // Return after silence
  'Hacía unos días.': { type: 'return', rarity: 'rare' },
  'Vuelves después de un tiempo.': { type: 'return', rarity: 'rare' },
  'Aquí estás de nuevo.': { type: 'return', rarity: 'very_rare' },
  'Hacía mucho.': { type: 'return', rarity: 'very_rare' },
  // Recurring pattern
  'Este ritmo ya te había acompañado antes.': { type: 'recurrence', rarity: 'very_rare' },
  'Ya habías estado así.': { type: 'recurrence', rarity: 'rare' },
  // Stage shift
  'La energía cambió estas semanas.': { type: 'shift', rarity: 'rare' },
  'Menos energía últimamente.': { type: 'shift', rarity: 'rare' },
  'Menos peso últimamente.': { type: 'shift', rarity: 'rare' },
  // Presence milestone
  'Un mes así.': { type: 'presence', rarity: 'very_rare' },
  'Un año así.': { type: 'presence', rarity: 'very_rare' },
  // Temporal milestone
  'Ya tres meses.': { type: 'temporal', rarity: 'very_rare' },
  'Medio año.': { type: 'temporal', rarity: 'very_rare' },
  'Un año.': { type: 'temporal', rarity: 'very_rare' },
};

// Priority by type: higher = more persistent, deeper, more useful for the mentor
const TYPE_PRIORITY: Record<SilentMemoryType, number> = {
  temporal: 5,    // Longest persistence (months), marks life chapters
  presence: 4,    // Milestone persistence (30/365 days), unique signal
  return: 3,      // Temporal continuity signal, unique
  recurrence: 2,  // Temporal echo, partially overlaps with ESE
  shift: 1,       // Short-lived, already covered by ESE + check-in trends
};

const RARITY_MULTIPLIER: Record<'rare' | 'very_rare', number> = {
  rare: 1,
  very_rare: 2,
};

function daysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

/** Normalize a Date to a YYYY-MM-DD string for day-level comparison. */
function toDateKey(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Format context for FREE users — concise with basic continuity signals.
 */
function formatBasicContext(ctx: UserContext): string {
  const lines: string[] = [];

  if (ctx.userName) {
    lines.push(`Se llama ${ctx.userName}.`);
  }

  // Latest check-in summary
  if (ctx.recentCheckins.length > 0) {
    const latest = ctx.recentCheckins[0];
    const days = daysAgo(latest.date);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    lines.push(`Último check-in ${when}: emoción ${EMOTION_LABELS[latest.emotion] || latest.emotion}/5, energía ${latest.energy}/5.`);
  }

  // Brief streak summary
  if (ctx.habitStreaks.length > 0) {
    const streaks = ctx.habitStreaks.slice(0, 3).map(h => `${h.name} (${h.streak} días)`).join(', ');
    lines.push(`Hábitos con racha: ${streaks}.`);
  }

  // Last meditation
  if (ctx.recentMeditations.length > 0) {
    const last = ctx.recentMeditations[0];
    const days = daysAgo(last.completedAt);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    lines.push(`Meditó ${when} (${last.duration} min).`);
  }

  // Last journal entry
  if (ctx.recentJournals.length > 0) {
    const last = ctx.recentJournals[0];
    const title = last.title || 'sin título';
    const days = daysAgo(last.createdAt);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    lines.push(`Escribió en su diario ${when}: "${title}".`);
  }

  // Consistency signal
  const c = ctx.consistency;
  if (c.trend === 'improving') {
    lines.push(`Viene siendo más constante esta semana.`);
  } else if (c.trend === 'declining') {
    lines.push(`Últimamente menos activo/a que antes.`);
  }

  return lines.join('\n');
}

/**
 * Format context for PREMIUM users — full context with continuity and evolution signals.
 */
function formatAdvancedContext(ctx: UserContext): string {
  const lines: string[] = [];

  // User name
  if (ctx.userName) {
    lines.push(`Se llama ${ctx.userName}.`);
  }

  // Emotional state — the single source of truth from the engine
  // This replaces any ad-hoc status inference with the official computed state.
  const es = ctx.emotionalState;
  if (es) {
    if (es.statusLabel) {
      lines.push(`Actualmente se encuentra en un estado ${es.statusLabel}.`);
    }
    if (es.statusDescription) {
      lines.push(es.statusDescription);
    }
    if (es.summary) {
      lines.push(es.summary);
    }
    if (es.recommendation) {
      lines.push(es.recommendation);
    }
  }

  // Life stage — the official stage detection from the Life Stage Engine
  // Complements the ESE (which captures the current emotional state) with
  // the broader life stage context. Deduplicated: if the ESE already
  // describes the same quality, we only add the temporal perspective.
  const ls = ctx.lifeStage;
  if (ls) {
    // Dedup: if ESE statusLabel already matches the stage flavor, don't restate it
    const ESE_STAGE_OVERLAP: Record<string, string[]> = {
      calm: ['Calma', 'Tranquilidad', 'Serenidad'],
      growth: ['Crecimiento', 'Progreso', 'Mejora'],
      intensity: ['Intensidad', 'Estrés', 'Presión'],
      exhaustion: ['Agotamiento', 'Burnout', 'Desgaste'],
      stability: ['Estabilidad', 'Equilibrio', 'Consistencia'],
      dispersion: ['Dispersión', 'Inestabilidad', 'Inconsistencia'],
      quiet: ['Silencio', 'Inactividad', 'Reposo'],
    };
    const overlapLabels = ESE_STAGE_OVERLAP[ls.flavor] || [];
    const esAlreadyCoversStage = es?.statusLabel
      ? overlapLabels.some(l => es.statusLabel.includes(l))
      : false;

    if (!esAlreadyCoversStage) {
      lines.push(`Actualmente atraviesa una etapa de ${ls.label.toLowerCase()}.`);
    }

    // Always add the engine's observation — it provides nuance beyond the label
    if (ls.observation && ls.observation.trim().length > 0) {
      lines.push(ls.observation);
    }

    // Transition: only if recent — adds temporal evolution the ESE doesn't cover
    if (ls.transition) {
      lines.push(ls.transition);
    }
  }

  // Onboarding origin context — why they came, what they want
  const ob = ctx.onboardingData;
  if (ob) {
    const LEVEL_LABELS: Record<number, string> = {
      1: 'muy bajo',
      2: 'bajo',
      3: 'neutral',
      4: 'bueno',
      5: 'alto',
    };
    const FOCUS_NAMES: Record<string, string> = {
      mente: 'Mente',
      disciplina: 'Disciplina',
      energia: 'Energía',
      riqueza: 'Finanzas',
    };

    if (ob.goals.length > 0) {
      const goalsStr = ob.goals.length <= 3
        ? ob.goals.join(' y ')
        : ob.goals.slice(0, 3).join(', ') + ' y más';
      lines.push(`Comenzó VitaZen con el objetivo de ${goalsStr}.`);
    }
    if (ob.primaryFocus) {
      const focusName = FOCUS_NAMES[ob.primaryFocus] || ob.primaryFocus;
      lines.push(`Su foco principal es ${focusName}.`);
    }
    if (ob.energyLevel != null) {
      lines.push(`Al comenzar describía su energía como ${LEVEL_LABELS[ob.energyLevel] || ob.energyLevel}/5.`);
    }
    if (ob.stressLevel != null) {
      lines.push(`Su nivel de estrés inicial era ${LEVEL_LABELS[ob.stressLevel] || ob.stressLevel}/5.`);
    }
    if (ob.focusLevel != null) {
      lines.push(`Su capacidad de enfoque inicial era ${LEVEL_LABELS[ob.focusLevel] || ob.focusLevel}/5.`);
    }
    if (ob.initialHabits.length > 0) {
      const habitsStr = ob.initialHabits.length <= 3
        ? ob.initialHabits.join(', ')
        : ob.initialHabits.slice(0, 3).join(', ') + ' y otros';
      lines.push(`Los hábitos que quería construir: ${habitsStr}.`);
    }
  }

  // Recent emotional check-ins with trends
  if (ctx.recentCheckins.length > 0) {
    const latest = ctx.recentCheckins[0];
    const days = daysAgo(latest.date);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;

    lines.push(`Último check-in ${when}: emoción ${EMOTION_LABELS[latest.emotion] || latest.emotion}/5, energía ${latest.energy}/5, enfoque ${latest.focus}/5, estrés ${latest.stress}/5.`);
    if (latest.intention) {
      lines.push(`Su intención del día: "${latest.intention}"`);
    }

    // Trend: compare latest vs previous
    // Skip raw trend when Emotional State Engine is active — its summary
    // already provides the authoritative synthesized trend.
    if (!es && ctx.recentCheckins.length >= 2) {
      const prev = ctx.recentCheckins[1];
      const trends: string[] = [];
      if (latest.stress - prev.stress > 0) trends.push('el estrés ha subido');
      if (latest.energy - prev.energy > 0) trends.push('la energía ha mejorado');
      if (latest.emotion - prev.emotion < 0) trends.push('el estado emocional ha bajado');
      if (latest.emotion - prev.emotion > 0) trends.push('el estado emocional ha mejorado');
      if (latest.focus - prev.focus > 0) trends.push('el enfoque ha mejorado');
      if (trends.length > 0) {
        lines.push(`Tendencia reciente: ${trends.join(', ')}.`);
      }
    }
  }

  // Wellness log — sleep quality + notes (mood/energy/stress intentionally skipped: already in DailyCheckin)
  if (ctx.wellnessLogs.length > 0) {
    const SLEEP_LABELS: Record<number, string> = {
      1: 'muy mala',
      2: 'mala',
      3: 'normal',
      4: 'buena',
      5: 'excelente',
    };

    const logs = ctx.wellnessLogs;

    // Sleep trend: compare recent half vs older half
    if (logs.length >= 3) {
      const mid = Math.floor(logs.length / 2);
      const recentSleep = logs.slice(0, mid).reduce((s, l) => s + l.sleep, 0) / mid;
      const olderSleep = logs.slice(mid).reduce((s, l) => s + l.sleep, 0) / (logs.length - mid);
      const diff = recentSleep - olderSleep;
      if (diff > 0.5) {
        lines.push(`En los últimos días ha descansado mejor.`);
      } else if (diff < -0.5) {
        lines.push(`Su descanso ha sido irregular últimamente.`);
      }
    }

    // Latest sleep quality
    const latest = logs[0];
    const latestLabel = SLEEP_LABELS[latest.sleep] || `${latest.sleep}/5`;
    const days = daysAgo(latest.date);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    lines.push(`Calidad del descanso ${when}: ${latestLabel}.`);

    // One brief note reference if it adds unique context
    const noteLog = logs.find(l => l.notes && l.notes.trim().length > 0);
    if (noteLog && noteLog.notes) {
      const snippet = noteLog.notes.length > 60 ? noteLog.notes.slice(0, 57) + '...' : noteLog.notes;
      lines.push(`Ha anotado sobre su bienestar: "${snippet}".`);
    }
  }

  // Finance context — spending patterns, not financial advice
  if (ctx.financeLogs.length >= 3) {
    const FINANCE_MOOD_LABELS: Record<string, string> = {
      necessity: 'necesidad',
      enjoyment: 'disfrute',
      growth: 'crecimiento',
      tranquility: 'tranquilidad',
    };

    const logs = ctx.financeLogs;

    // Find predominant spending mood
    const moodCounts: Record<string, number> = {};
    for (const l of logs) {
      if (l.mood) {
        moodCounts[l.mood] = (moodCounts[l.mood] || 0) + 1;
      }
    }
    const moods = Object.entries(moodCounts);
    if (moods.length > 0) {
      const [topMood, topCount] = moods.reduce((a, b) => a[1] >= b[1] ? a : b);
      const ratio = topCount / logs.length;
      const moodLabel = FINANCE_MOOD_LABELS[topMood] || topMood;
      if (ratio >= 0.5) {
        if (topMood === 'necessity') {
          lines.push(`Últimamente la mayoría de sus gastos han estado relacionados con necesidades.`);
        } else if (topMood === 'growth') {
          lines.push(`Ha registrado varias decisiones enfocadas al crecimiento.`);
        } else if (topMood === 'enjoyment') {
          lines.push(`Sus gastos recientes reflejan una etapa orientada al disfrute.`);
        } else if (topMood === 'tranquility') {
          lines.push(`Se aprecia una etapa de mayor prudencia en sus decisiones.`);
        } else {
          lines.push(`Sus gastos recientes tienen como intención predominante ${moodLabel}.`);
        }
      }
    }

    // One brief contexto reference — human context behind a transaction
    const ctxLog = logs.find(l => l.contexto && l.contexto.trim().length > 0);
    if (ctxLog && ctxLog.contexto) {
      const snippet = ctxLog.contexto.length > 60 ? ctxLog.contexto.slice(0, 57) + '...' : ctxLog.contexto;
      lines.push(`Ha explicado que un gasto estaba relacionado con: "${snippet}".`);
    }
  }

  // Habit streaks with detail
  if (ctx.habitStreaks.length > 0) {
    const habitParts = ctx.habitStreaks.slice(0, 5).map(h => {
      const daysSince = h.lastCompletedAt ? daysAgo(h.lastCompletedAt) : null;
      const status = daysSince === 0 ? 'hecho hoy' : daysSince === 1 ? 'hecho ayer' : daysSince !== null ? `último hace ${daysSince} días` : '';
      return `${h.name}: racha ${h.streak} días${status ? ` (${status})` : ''}`;
    });
    lines.push(`Hábitos activos: ${habitParts.join('. ')}.`);
  }

  // Recent meditations
  if (ctx.recentMeditations.length > 0) {
    const last = ctx.recentMeditations[0];
    const days = daysAgo(last.completedAt);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    lines.push(`Última meditación: ${last.duration} min de ${last.type.replace('_', ' ')} ${when}. ${ctx.recentMeditations.length} sesiones recientes.`);
  }

  // Recent journal entries — what the user has been reflecting on
  if (ctx.recentJournals.length > 0) {
    const journalParts = ctx.recentJournals.map(j => {
      const days = daysAgo(j.createdAt);
      const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
      const title = j.title || 'sin título';
      const moodStr = j.mood ? ` (ánimo ${j.mood}/5)` : '';
      return `"${title}"${moodStr} ${when}`;
    });
    lines.push(`Reflexiones recientes en su diario: ${journalParts.join(', ')}.`);
  }

  // Recent conversation topics
  const namedConversations = ctx.recentConversations.filter(c => c.title !== 'Nueva conversación');
  if (namedConversations.length > 0) {
    const topics = namedConversations.map(c => {
      const days = daysAgo(c.updatedAt);
      const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
      return `"${c.title}" (${when})`;
    });
    lines.push(`Temas recientes de conversación: ${topics.join(', ')}.`);
  }

  // Empire progress summary
  const activeEmpires = ctx.empireProgress.filter(e => e.xp > 0 || e.streak > 0);
  if (activeEmpires.length > 0) {
    // Find the empire with most XP to signal focus area
    const topEmpire = activeEmpires.reduce((a, b) => a.xp > b.xp ? a : b);
    const topEmpireName = EMPIRE_NAMES[topEmpire.empire] || topEmpire.empire;

    const empireParts = activeEmpires.map(e => {
      const name = EMPIRE_NAMES[e.empire] || e.empire;
      return `${name}: nivel ${e.level}, ${e.xp} XP${e.streak > 0 ? `, racha ${e.streak} días` : ''}`;
    });
    lines.push(`Progreso de imperios: ${empireParts.join('. ')}. Enfocado/a especialmente en ${topEmpireName}.`);
  }

  // Weekly activity summary + consistency signal
  const wa = ctx.weeklyActivity;
  const totalActivity = wa.meditations + wa.habits + wa.journals + wa.checkins;
  if (totalActivity > 0) {
    const parts: string[] = [];
    if (wa.meditations > 0) parts.push(`${wa.meditations} meditación${wa.meditations > 1 ? 'es' : ''}`);
    if (wa.habits > 0) parts.push(`${wa.habits} hábito${wa.habits > 1 ? 's' : ''}`);
    if (wa.journals > 0) parts.push(`${wa.journals} entrada${wa.journals > 1 ? 's' : ''} de diario`);
    if (wa.checkins > 0) parts.push(`${wa.checkins} check-in${wa.checkins > 1 ? 's' : ''}`);
    lines.push(`Esta semana: ${parts.join(', ')}.`);
  }

  // Consistency evolution signal — compact, natural
  // Skip when ESE is active — its summary already provides the authoritative signal.
  const c = ctx.consistency;
  if (!es && c.trend === 'improving') {
    lines.push(`Viene siendo más constante últimamente.`);
  } else if (!es && c.trend === 'declining') {
    lines.push(`Últimamente menos activo/a que la semana pasada.`);
  } else if (c.trend === 'starting' && totalActivity <= 2) {
    lines.push(`Está empezando a usar la app.`);
  }

  // Monthly closure signals — whether the user practices monthly reflection
  // Only signals from existing closure records. No recalculation, no summaries.
  if (ctx.monthlyClosures.length > 0) {
    const closures = ctx.monthlyClosures;
    const latest = closures[0]; // already sorted desc by month

    // How many months ago was the latest closure?
    const [cYear, cMonth] = latest.month.split('-').map(Number);
    const now = new Date();
    const monthsAgo = (now.getFullYear() - cYear) * 12 + (now.getMonth() + 1 - cMonth);

    const reflectionsCount = closures.filter(cl => cl.hasReflection).length;

    if (monthsAgo <= 1) {
      // Recent closure — user is engaged
      if (reflectionsCount >= 2) {
        lines.push(`Viene realizando cierres personales con regularidad.`);
      } else if (latest.hasReflection) {
        lines.push(`Su última reflexión mensual fue reciente.`);
      } else {
        lines.push(`Revisó su cierre mensual recientemente.`);
      }
    } else if (monthsAgo <= 3) {
      // Not too long ago
      if (reflectionsCount >= 2) {
        lines.push(`Suele reflexionar sobre su evolución cada mes.`);
      } else {
        lines.push(`Hace poco revisó cómo le fue en un mes.`);
      }
    } else {
      // A while since last closure
      lines.push(`Hace tiempo que no realiza un cierre mensual.`);
    }
  }

  // Pattern observations — official cross-domain connections from the Pattern Detection Engine
  // Only surface what the engine has detected. No recalculation, no new correlations.
  // Maximum 2 patterns (enforced by the engine). Deduplicate against ESE and other blocks.
  if (ctx.patternObservations && ctx.patternObservations.length > 0) {
    const esText = es
      ? `${es.summary ?? ''} ${es.recommendation ?? ''} ${es.statusDescription ?? ''}`.toLowerCase()
      : '';

    for (const obs of ctx.patternObservations) {
      // Dedup: skip if ESE already explicitly connects the same two domains
      const domainKeywordPairs: Record<string, [string[], string[]]> = {
        'finanzas-energia': [['gasto', 'finanzas', 'dinero', 'necesidad', 'disfrute'], ['energía', 'descanso', 'sueño', 'cansancio']],
        'finanzas-mente': [['gasto', 'finanzas', 'dinero', 'necesidad', 'disfrute'], ['mente', 'meditación', 'práctica', 'mental']],
        'finanzas-estres': [['gasto', 'finanzas', 'dinero', 'necesidad', 'disfrute'], ['estrés', 'presión', 'tensión', 'agobio']],
        'finanzas-sueno': [['gasto', 'finanzas', 'dinero', 'necesidad', 'disfrute'], ['descanso', 'sueño', 'dormir', 'noche']],
      };
      if (esText) {
        const pair = domainKeywordPairs[obs.connection];
        if (pair) {
          const hasA = pair[0].some(k => esText.includes(k));
          const hasB = pair[1].some(k => esText.includes(k));
          if (hasA && hasB) continue; // ESE already connects both domains — skip
        }
      }

      // Format as natural cross-domain observation using the engine's official text
      const empireLabels = obs.empires.join(' y ');
      lines.push(`VitaZen ha detectado una conexión entre ${empireLabels}: ${obs.text}`);
    }
  }

  // Silent Memories — official observations from VitaZen's observation engine
  // Consume only what the engine has already generated and shown (shown[] in memoryState).
  // No recalculation. No side effects. PREMIUM only.
  if (ctx.silentMemories.length > 0) {
    // Step 1: Map observation texts to their metadata (type + rarity)
    const candidates: { observation: string; type: SilentMemoryType; rarity: 'rare' | 'very_rare' }[] = [];
    // Iterate in reverse (most recent first) and keep only the latest per type
    const seenTypes = new Set<SilentMemoryType>();
    for (let i = ctx.silentMemories.length - 1; i >= 0; i--) {
      const obs = ctx.silentMemories[i];
      const meta = OBSERVATION_META[obs];
      if (meta && !seenTypes.has(meta.type)) {
        candidates.push({ observation: obs, type: meta.type, rarity: meta.rarity });
        seenTypes.add(meta.type);
      }
    }

    // Step 2: Deduplication — skip observations already covered by other context blocks
    const deduped = candidates.filter(c => {
      // Shift observations: already covered by ESE (energy/stress trends) + check-in trends
      // If ESE is active, shift adds nothing new.
      if (c.type === 'shift' && es) return false;

      // Presence observations: the milestone (30/365 days) is unique — not covered
      // by consistency trend which only says "improving/declining".
      // Recurrence observations: temporal echo is unique — not covered by ESE or patterns.
      // Return observations: absence/return signal is unique.
      // Temporal observations: time-since-start milestone is unique.
      return true;
    });

    // Step 3: Prioritization — score by persistence × rarity, take top 2
    const scored = deduped.map(c => ({
      ...c,
      score: TYPE_PRIORITY[c.type] * RARITY_MULTIPLIER[c.rarity],
    }));
    scored.sort((a, b) => b.score - a.score);

    const selected = scored.slice(0, 2);

    // Step 4: Format as natural observations — the texts are already poetic and brief
    for (const mem of selected) {
      lines.push(mem.observation);
    }
  }

  return lines.join('\n');
}

/**
 * Format context based on user plan.
 */
export function formatContextForPrompt(ctx: UserContext): string {
  if (ctx.plan === 'PREMIUM') {
    return formatAdvancedContext(ctx);
  }
  return formatBasicContext(ctx);
}

/**
 * Build the full system prompt with injected context.
 * FREE users get basic contextual awareness.
 * PREMIUM users get full contextual awareness with deeper instructions.
 */
export function buildContextualSystemPrompt(
  basePrompt: string,
  context: UserContext
): string {
  const contextBlock = formatContextForPrompt(context);

  if (!contextBlock.trim()) {
    return basePrompt;
  }

  const isPremium = context.plan === 'PREMIUM';

  const contextRules = isPremium
    ? `CÓMO USAR ESTE CONTEXTO:
- Integrar de forma invisible. Nunca digas "según tus datos". Simplemente sabes.
- Si el contexto no es relevante para la pregunta, responde directamente sin forzar.
- Sé sutil. La personalización se nota en lo natural que suena, no en cuántos datos mencionas.
- USA el contexto para responder más preciso sin hacer preguntas extra. Si ya sabes su situación, propón directamente.
- Máximo UNA referencia contextual por respuesta. El resto debe ser respuesta útil y directa.
- Conecta temas de conversaciones anteriores cuando encaje: "El otro día mencionaste dificultades con el enfoque..."
- Construye continuidad entre sesiones. El usuario debe sentir que le recuerdas.
- Varía las referencias. No repitas la misma observación en cada respuesta.
- Si el usuario viene mejorando, reconócelo en una frase breve y avanza. No te detengas a celebrar.
- USA el contexto para ser más accionable, no para alargar. Si sabes que su estrés subió, no lo menciones si no añades algo útil sobre ello.

CONTROL DE EVIDENCIA:
- Distingue siempre entre datos observados, patrones detectados oficialmente y suposiciones.
- Si hay un patrón oficial de VitaZen, puedes apoyarte en él con naturalidad.
- Si no hay patrón oficial, no lo sustituyas por intuición. No inventes conexiones.
- Nunca afirmes causalidad. Si el motor detecta correlación, no digas que una cosa provoca otra.
- Con pocos datos: no asumas, no completes huecos, no interpretes silencios.
- Cuando la evidencia sea insuficiente, indica con naturalidad que aún es pronto para saberlo.
- Si la evidencia es fuerte, habla con seguridad. Si no, habla con prudencia.
- Puedes usar "parece", "podría", "da la impresión", "con lo que se ve hasta ahora" cuando no haya certeza.
- No suenes inseguro. Suenas honesto. Un mentor excelente dice cuando no sabe.`
    : `CÓMO USAR ESTE CONTEXTO:
- Integrar de forma invisible. Nunca digas "según tus datos". Simplemente sabes.
- Si el contexto no es relevante para la pregunta, responde directamente sin forzar.
- Sé sutil. La personalización se nota en lo natural que suena, no en cuántos datos mencionas.
- USA el contexto para responder más preciso sin hacer preguntas extra. Si ya sabes su situación, propón directamente.
- Máximo UNA referencia contextual por respuesta. El resto debe ser respuesta útil y directa.
- Esta persona tiene mensajes limitados. El contexto te ayuda a dar respuestas más útiles sin gastar mensajes en preguntas que puedes inferir.`;

  return `${basePrompt}

── Lo que sabes de esta persona ──
${contextBlock}
── Fin ──

${contextRules}`;
}
