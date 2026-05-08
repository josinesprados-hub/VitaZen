import { db } from './db';

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

  // Run all queries in parallel for performance
  const [
    recentCheckins,
    habitStreaks,
    recentMeditations,
    recentThreads,
    empireProgress,
    weeklyMeditations,
    weeklyJournals,
    weeklyCheckins,
    user,
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

    // Meditation sessions: FREE gets 2, PREMIUM gets 5
    db.meditationSession.findMany({
      where: { userId, completedAt: { gte: thirtyDaysAgo } },
      orderBy: { completedAt: 'desc' },
      take: isPremium ? 5 : 2,
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

    // Weekly meditation count: PREMIUM only
    isPremium
      ? db.meditationSession.count({ where: { userId, completedAt: { gte: sevenDaysAgo } } })
      : Promise.resolve(0),

    // Weekly journal count: PREMIUM only
    isPremium
      ? db.journalEntry.count({ where: { userId, createdAt: { gte: sevenDaysAgo } } })
      : Promise.resolve(0),

    // Weekly checkin count: PREMIUM only
    isPremium
      ? db.dailyCheckin.count({ where: { userId, date: { gte: sevenDaysAgo } } })
      : Promise.resolve(0),

    // User data
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, plan: true },
    }),
  ]);

  // Weekly habit completions (PREMIUM only)
  const weeklyHabits = isPremium
    ? habitStreaks.filter(h => {
        if (!h.lastCompletedAt) return false;
        return h.lastCompletedAt >= sevenDaysAgo;
      }).length
    : 0;

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
      meditations: weeklyMeditations,
      habits: weeklyHabits,
      journals: weeklyJournals,
      checkins: weeklyCheckins,
    },
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

function daysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

/**
 * Format context for FREE users — basic, concise summary.
 */
function formatBasicContext(ctx: UserContext): string {
  const lines: string[] = [];

  if (ctx.userName) {
    lines.push(`Se llama ${ctx.userName}.`);
  }

  // Just the latest check-in summary
  if (ctx.recentCheckins.length > 0) {
    const latest = ctx.recentCheckins[0];
    const days = daysAgo(latest.date);
    const when = days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`;
    lines.push(`Su último check-in fue ${when}: emoción ${EMOTION_LABELS[latest.emotion] || latest.emotion}/5, energía ${latest.energy}/5.`);
  }

  // Brief streak summary
  if (ctx.habitStreaks.length > 0) {
    const streaks = ctx.habitStreaks.slice(0, 3).map(h => `${h.name} (${h.streak} días)`).join(', ');
    lines.push(`Hábitos con racha: ${streaks}.`);
  }

  return lines.join('\n');
}

/**
 * Format context for PREMIUM users — full detailed context with trends and insights.
 */
function formatAdvancedContext(ctx: UserContext): string {
  const lines: string[] = [];

  // User name
  if (ctx.userName) {
    lines.push(`Se llama ${ctx.userName}.`);
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
    if (ctx.recentCheckins.length >= 2) {
      const prev = ctx.recentCheckins[1];
      const trends: string[] = [];
      if (latest.stress - prev.stress > 0) trends.push('el estrés ha subido');
      if (latest.energy - prev.energy > 0) trends.push('la energía ha mejorado');
      if (latest.emotion - prev.emotion < 0) trends.push('el estado emocional ha bajado');
      if (trends.length > 0) {
        lines.push(`Tendencia reciente: ${trends.join(', ')}.`);
      }
    }
  }

  // Habit streaks with detail
  if (ctx.habitStreaks.length > 0) {
    const habitParts = ctx.habitStreaks.map(h => {
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
    lines.push(`Última meditación: ${last.duration} min de ${last.type.replace('_', ' ')} ${when}. ${ctx.recentMeditations.length} sesiones en las últimas 2 semanas.`);
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
    const empireParts = activeEmpires.map(e => {
      const name = EMPIRE_NAMES[e.empire] || e.empire;
      return `${name}: nivel ${e.level}, ${e.xp} XP${e.streak > 0 ? `, racha ${e.streak} días` : ''}`;
    });
    lines.push(`Progreso de imperios: ${empireParts.join('. ')}.`);
  }

  // Weekly activity summary
  const wa = ctx.weeklyActivity;
  const totalActivity = wa.meditations + wa.habits + wa.journals + wa.checkins;
  if (totalActivity > 0) {
    const parts: string[] = [];
    if (wa.meditations > 0) parts.push(`${wa.meditations} meditación${wa.meditations > 1 ? 'es' : ''}`);
    if (wa.habits > 0) parts.push(`${wa.habits} hábito${wa.habits > 1 ? 's' : ''}`);
    if (wa.journals > 0) parts.push(`${wa.journals} entrada${wa.journals > 1 ? 's' : ''} de diario`);
    if (wa.checkins > 0) parts.push(`${wa.checkins} check-in${wa.checkins > 1 ? 's' : ''}`);
    const assessment = totalActivity >= 14 ? 'Alta consistencia.' : totalActivity >= 7 ? 'Actividad moderada.' : totalActivity <= 2 ? 'Poca actividad reciente.' : '';
    lines.push(`Esta semana: ${parts.join(', ')}. ${assessment}`);
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
- Integrar de forma invisible. Nunca digas "según tus datos" ni "veo en tu registro". Simplemente sabes.
- Si el usuario tiene buena racha: "Vienes con buena consistencia." Si el estrés subió: "Últimamente el estrés ha estado más presente." Natural, sin explicarlo.
- Conecta temas de conversaciones anteriores cuando encaje: "El otro día mencionaste dificultades con el enfoque..."
- Varía las referencias. No repitas la misma observación en cada respuesta.
- Si el contexto no es relevante para la pregunta, no lo fuerces. Responde directamente.
- Construye continuidad entre sesiones. El usuario debe sentir que le recuerdas.
- Sé sutil. La personalización se nota en lo natural que suena, no en cuántos datos mencionas.`
    : `CÓMO USAR ESTE CONTEXTO:
- Integrar de forma invisible. Nunca digas "según tus datos". Simplemente sabes.
- Si el usuario tiene buena racha, puedes decir: "Vienes con buena consistencia."
- No repitas la misma referencia en cada respuesta.
- Si el contexto no es relevante, responde directamente sin forzar.
- Sé sutil. Menos es más.`;

  return `${basePrompt}

── Lo que sabes de esta persona ──
${contextBlock}
── Fin ──

${contextRules}`;
}
