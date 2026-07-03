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
      if (latest.emotion - prev.emotion > 0) trends.push('el estado emocional ha mejorado');
      if (latest.focus - prev.focus > 0) trends.push('el enfoque ha mejorado');
      if (trends.length > 0) {
        lines.push(`Tendencia reciente: ${trends.join(', ')}.`);
      }
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
  const c = ctx.consistency;
  if (c.trend === 'improving') {
    lines.push(`Viene siendo más constante últimamente.`);
  } else if (c.trend === 'declining') {
    lines.push(`Últimamente menos activo/a que la semana pasada.`);
  } else if (c.trend === 'starting' && totalActivity <= 2) {
    lines.push(`Está empezando a usar la app.`);
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
- Si el usuario tiene buena racha o consistencia: "Vienes con buena consistencia." Si el estrés subió: "Últimamente el estrés ha estado más presente." Natural, sin explicarlo.
- Conecta temas de conversaciones anteriores cuando encaje: "El otro día mencionaste dificultades con el enfoque..."
- Si escribió en su diario recientemente, puedes referenciarlo: "Vi que has estado reflexionando sobre..." — solo si es relevante.
- Varía las referencias. No repitas la misma observación en cada respuesta.
- Si el contexto no es relevante para la pregunta, no lo fuerces. Responde directamente.
- Construye continuidad entre sesiones. El usuario debe sentir que le recuerdas.
- Sé sutil. La personalización se nota en lo natural que suena, no en cuántos datos mencionas.
- USA el contexto para ser más accionable, no para alargar la respuesta. Si sabes que su estrés subió, no lo menciones si no añades algo útil sobre ello.
- El contexto te permite responder más preciso sin necesidad de preguntas extra. Aprovéchalo.
- Máximo UNA referencia contextual por respuesta. Si ya referenciaste algo, el resto debe ser respuesta directa.
- Si el usuario viene mejorando, reconócelo en una frase breve y avanza. No te detengas a celebrar.`
    : `CÓMO USAR ESTE CONTEXTO:
- Integrar de forma invisible. Nunca digas "según tus datos". Simplemente sabes.
- Si el usuario tiene buena racha, puedes decir: "Vienes con buena consistencia."
- Si escribió en su diario o meditó recientemente, puedes referenciarlo brevemente si es relevante.
- No repitas la misma referencia en cada respuesta.
- Si el contexto no es relevante, responde directamente sin forzar.
- Sé sutil. Menos es más.
- USA el contexto para responder más preciso sin hacer preguntas extra. Si ya sabes su situación, propón directamente.
- Recuerda: esta persona tiene mensajes limitados. El contexto te ayuda a dar respuestas más útiles sin gastar mensajes en preguntas que puedes inferir.
- Máximo UNA referencia contextual por respuesta. El resto debe ser respuesta útil y directa.`;

  return `${basePrompt}

── Lo que sabes de esta persona ──
${contextBlock}
── Fin ──

${contextRules}`;
}
