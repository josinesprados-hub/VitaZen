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
    lines.push(`Nombre del usuario: ${ctx.userName}`);
  }

  // Just the latest check-in summary
  if (ctx.recentCheckins.length > 0) {
    const latest = ctx.recentCheckins[0];
    const days = daysAgo(latest.date);
    lines.push(`\nEstado reciente:`);
    lines.push(`- Último check-in: ${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}`);
    lines.push(`- Emoción: ${EMOTION_LABELS[latest.emotion] || latest.emotion}/5, Energía: ${latest.energy}/5`);
  }

  // Brief streak summary
  if (ctx.habitStreaks.length > 0) {
    lines.push(`\nHábitos:`);
    ctx.habitStreaks.slice(0, 3).forEach(h => {
      lines.push(`- ${h.name}: racha de ${h.streak} días`);
    });
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
    lines.push(`Nombre del usuario: ${ctx.userName}`);
  }

  // Recent emotional check-ins with trends
  if (ctx.recentCheckins.length > 0) {
    const latest = ctx.recentCheckins[0];
    const days = daysAgo(latest.date);

    lines.push(`\nEstado emocional reciente:`);
    lines.push(`- Último check-in: ${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}`);
    lines.push(`- Emoción: ${EMOTION_LABELS[latest.emotion] || latest.emotion}/5, Energía: ${latest.energy}/5, Enfoque: ${latest.focus}/5, Estrés: ${latest.stress}/5`);
    if (latest.intention) {
      lines.push(`- Intención del día: "${latest.intention}"`);
    }

    // Trend: compare latest vs previous
    if (ctx.recentCheckins.length >= 2) {
      const prev = ctx.recentCheckins[1];
      const stressTrend = latest.stress - prev.stress;
      const energyTrend = latest.energy - prev.energy;
      const emotionTrend = latest.emotion - prev.emotion;

      if (stressTrend > 0) lines.push(`- Tendencia: estrés en aumento respecto a días anteriores`);
      if (energyTrend > 0) lines.push(`- Tendencia: energía mejorando`);
      if (emotionTrend < 0) lines.push(`- Tendencia: estado emocional ha bajado`);
    }
  }

  // Habit streaks with detail
  if (ctx.habitStreaks.length > 0) {
    lines.push(`\nHábitos activos:`);
    ctx.habitStreaks.forEach(h => {
      const daysSince = h.lastCompletedAt ? daysAgo(h.lastCompletedAt) : null;
      const status = daysSince === 0 ? 'completado hoy' : daysSince === 1 ? 'completado ayer' : daysSince !== null ? `último hace ${daysSince} días` : '';
      lines.push(`- ${h.name}: racha de ${h.streak} días${status ? ` (${status})` : ''}`);
    });
  }

  // Recent meditations
  if (ctx.recentMeditations.length > 0) {
    const lastMeditation = ctx.recentMeditations[0];
    const days = daysAgo(lastMeditation.completedAt);
    lines.push(`\nMeditación:`);
    lines.push(`- Última sesión: ${lastMeditation.duration} min (${lastMeditation.type}), ${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}`);
    lines.push(`- Total sesiones últimas 2 semanas: ${ctx.recentMeditations.length}`);
  }

  // Recent conversation topics
  if (ctx.recentConversations.length > 0) {
    lines.push(`\nTemas recientes de conversación:`);
    ctx.recentConversations.forEach(c => {
      if (c.title !== 'Nueva conversación') {
        const days = daysAgo(c.updatedAt);
        lines.push(`- "${c.title}" (${days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`})`);
      }
    });
  }

  // Empire progress summary
  const activeEmpires = ctx.empireProgress.filter(e => e.xp > 0 || e.streak > 0);
  if (activeEmpires.length > 0) {
    lines.push(`\nProgreso de imperios:`);
    activeEmpires.forEach(e => {
      const name = EMPIRE_NAMES[e.empire] || e.empire;
      lines.push(`- ${name}: Nivel ${e.level}, ${e.xp} XP${e.streak > 0 ? `, racha ${e.streak} días` : ''}`);
    });
  }

  // Weekly activity summary
  const wa = ctx.weeklyActivity;
  const totalActivity = wa.meditations + wa.habits + wa.journals + wa.checkins;
  if (totalActivity > 0) {
    lines.push(`\nActividad esta semana:`);
    const parts: string[] = [];
    if (wa.meditations > 0) parts.push(`${wa.meditations} meditación${wa.meditations > 1 ? 'es' : ''}`);
    if (wa.habits > 0) parts.push(`${wa.habits} hábito${wa.habits > 1 ? 's' : ''}`);
    if (wa.journals > 0) parts.push(`${wa.journals} entrada${wa.journals > 1 ? 's' : ''} de diario`);
    if (wa.checkins > 0) parts.push(`${wa.checkins} check-in${wa.checkins > 1 ? 's' : ''}`);
    lines.push(`- ${parts.join(', ')}`);

    // Consistency assessment
    if (totalActivity >= 14) {
      lines.push(`- Valoración: alta consistencia esta semana`);
    } else if (totalActivity >= 7) {
      lines.push(`- Valoración: actividad moderada esta semana`);
    } else if (totalActivity <= 2) {
      lines.push(`- Valoración: poca actividad reciente`);
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
    ? `REGLAS DE USO DEL CONTEXTO (AVANZADO):
- Usa este contexto para personalizar tus respuestas de forma natural y profunda.
- No menciones explícitamente "según tus datos" o "veo en tu registro". Simplemente intégralo.
- Ejemplo: si el usuario tiene buena racha de hábitos, di algo como "Has mantenido buena consistencia estos días."
- Ejemplo: si el estrés ha subido, di algo como "Últimamente el estrés ha estado más presente."
- Ejemplo: si hablaste de problemas de enfoque recientemente, retoma: "La semana pasada mencionaste dificultades con el enfoque..."
- Referencia tendencias emocionales, sesiones de meditación y progreso de imperios cuando sea relevante.
- No repitas la misma referencia contextual en cada respuesta. Varía.
- Si no hay contexto relevante para la pregunta, responde sin forzar referencias.
- Mantén el tono calmado y premium. No seas invasivo ni excesivamente emocional.
- Construye continuidad entre sesiones: conecta temas de conversaciones anteriores.`
    : `REGLAS DE USO DEL CONTEXTO (BÁSICO):
- Usa este contexto para personalizar tus respuestas de forma natural y sutil.
- No menciones explícitamente "según tus datos". Simplemente intégralo.
- Si el usuario tiene buena racha, puedes decir "Has mantenido buena consistencia."
- No repitas la misma referencia en cada respuesta.
- Si no hay contexto relevante, responde sin forzar referencias.
- Mantén el tono calmado y profesional.`;

  return `${basePrompt}

═══ CONTEXTO DEL USUARIO (datos recientes) ═══
${contextBlock}
═══ FIN CONTEXTO ═══

${contextRules}`;
}
