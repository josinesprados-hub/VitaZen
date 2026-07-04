// ═══════════════════════════════════════════
// VitaZen — Screenshot Mode Demo Data
// ═══════════════════════════════════════════
//
// Realistic, human, imperfect demo data for
// Play Store / App Store screenshots.
// Uses the REAL app with FROZEN content.
//
// Design principles:
// - Not perfect: some habits missed, variable energy
// - Not artificial: no "perfect week" or "ideal user"
// - Coherent: all data tells one person's story
// - Frozen: same tips, same reflections, same everything
//   every time — consistent screenshots
//
// The "demo user" is someone who:
// - Has been using VitaZen for ~3 months
// - Is more consistent some weeks than others
// - Has some habits with good streaks, some newer
// - Writes in their journal most days
// - Meditates 3-5 times per week
// - Tracks finances when they remember
// - Has completed 2 monthly closures

import type { EmotionalState, EmotionalMetric } from './emotional-state';

// ─── Demo User Identity ──────────────────────
// Coherent editorial identity for screenshot mode.
// This is the ONLY user data the UI should render
// when screenshot mode is active.

export const SCREENSHOT_USER = {
  id: 'screenshot-editorial',
  firebaseUid: 'screenshot-editorial',
  name: 'Elena',
  email: 'elena@vitazen.app',
  plan: 'PREMIUM' as const,
  avatarUrl: null as string | null,  // Uses initial "E" — clean & editorial
  country: 'España',
  city: 'Madrid',
  age: 31,
  bio: 'Aprendiendo a estar presente.',
  onboardingCompleted: true,
  emailVerified: true,
  createdAt: '2026-02-14T08:00:00.000Z',
  subscription: {
    id: 'sub-screenshot',
    stripeSubscriptionId: 'sub_screenshot_editorial',
    stripePriceId: 'price_screenshot',
    status: 'active',
    currentPeriodStart: '2026-05-01T00:00:00.000Z',
    currentPeriodEnd: '2026-06-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
  } as any,
};

// ─── Dashboard: Empires ──────────────────────
// Not all at the same level — more realistic

export const SCREENSHOT_EMPIRES = [
  { empire: 'disciplina', level: 5, xp: 67, xpToNextLevel: 100, streak: 7, progress: 67 },
  { empire: 'mente', level: 4, xp: 42, xpToNextLevel: 100, streak: 5, progress: 42 },
  { empire: 'energia', level: 3, xp: 85, xpToNextLevel: 100, streak: 3, progress: 85 },
  { empire: 'riqueza', level: 2, xp: 30, xpToNextLevel: 100, streak: 0, progress: 30 },
  { empire: 'crecimiento', level: 3, xp: 55, xpToNextLevel: 100, streak: 4, progress: 55 },
];

// ─── Dashboard: Challenge ────────────────────

export const SCREENSHOT_CHALLENGE = {
  id: 'demo-challenge-1',
  completed: false,
  challenge: {
    id: 'ch-disc-1',
    title: 'Completa 3 hábitos antes del mediodía',
    description: 'La disciplina matutina establece el tono del día. Completa tus hábitos más importantes antes de las 12:00.',
    category: 'disciplina',
    difficulty: 'medium',
  },
};

// ─── Dashboard: Metrics ──────────────────────

export const SCREENSHOT_METRICS = {
  meditationWeek: 4,
  habitsCompleted: 11,
  journalWeek: 5,
  balance: 89,
  totalIncome: 1450,
  totalExpense: 1361,
};

// ─── Dashboard: Streaks ──────────────────────

export const SCREENSHOT_STREAKS = {
  meditationStreak: 4,
  habitStreak: 7,
  journalStreak: 3,
  checkinStreak: 9,
  generalStreak: 9,
  streakMessage: {
    message: '9 días. Ya es costumbre.',
    tone: 'positive',
  },
};

// ─── Dashboard: Today's Check-in ─────────────
// Already checked in today — realistic mid-day state

export const SCREENSHOT_TODAY_CHECKIN = {
  id: 'demo-checkin-today',
  emotion: 4,
  energy: 3,
  focus: 4,
  stress: 2,
  intention: 'Estar presente, no perfecta',
  note: 'Dia tranquilo',
  createdAt: new Date().toISOString(),
};

// ─── Momentum ────────────────────────────────

export const SCREENSHOT_MOMENTUM = {
  score: 71,
  level: 'estable',
  description: 'Ritmo constante.',
  trend: 'stable' as const,
  currentStreak: 9,
};

// ─── Emotional State ─────────────────────────

export const SCREENSHOT_EMOTIONAL_STATE: EmotionalState = {
  status: 'enfocado',
  statusDescription: 'Claridad con algo de cansancio.',
  summary: 'Buena dirección. Algún bajón normal.',
  recommendation: 'La energía no es siempre alta. Lo importante es la dirección.',
  plan: 'PREMIUM',
  metrics: {
    energy: {
      value: 62,
      label: 'Energía',
      trend: 'stable' as const,
    },
    focus: {
      value: 78,
      label: 'Enfoque',
      trend: 'up' as const,
    },
    stress: {
      value: 35,
      label: 'Estrés',
      trend: 'down' as const,
    },
    consistency: {
      value: 68,
      label: 'Consistencia',
      trend: 'stable' as const,
    },
    progress: {
      value: 58,
      label: 'Progreso',
      trend: 'up' as const,
    },
    activity: {
      value: 65,
      label: 'Actividad',
      trend: 'stable' as const,
    },
  },
};

// ─── Insights: Weekly Summary ────────────────
// Not a "perfect week" — some gaps, variable data

export const SCREENSHOT_INSIGHTS_SUMMARY = {
  weekLabel: '19 — 25 may 2026',
  score: 68,
  totalActivities: 31,
  checkins: { count: 5, avgEmotion: 3.8, avgEnergy: 3.4, avgFocus: 3.6, avgStress: 2.3 },
  habits: { completed: 11, topStreak: 7, topHabit: 'Meditación matutina' },
  meditation: { sessions: 4, totalMinutes: 48, avgDuration: 12 },
  journal: { entries: 5 },
  wellness: { logs: 4, avgMood: 3.8, avgSleep: 3.2 },
  nutrition: { logs: 3, avgWater: 5 },
  finance: { income: 1450, expense: 1361, balance: 89 },
  streaks: { bestEmpireStreak: 7, bestEmpireName: 'Disciplina' },
};

// ─── Insights: Auto-detected insights ────────

export const SCREENSHOT_INSIGHTS_LIST = [
  {
    id: 'demo-insight-1',
    type: 'positive' as const,
    category: 'hábitos',
    icon: '✅',
    title: 'Racha de 7 días en hábitos',
    description: '7 días seguidos en Disciplina. La constancia no es perfección, es presencia.',
    value: '7 días',
  },
  {
    id: 'demo-insight-2',
    type: 'trend' as const,
    category: 'meditación',
    icon: '🧘',
    title: 'Meditación constante',
    description: '4 sesiones esta semana. No es todos los días, pero es suficiente para mantener el hábito.',
    value: '4 sesiones',
  },
  {
    id: 'demo-insight-3',
    type: 'positive' as const,
    category: 'emociones',
    icon: '💛',
    title: 'Emociones estables',
    description: 'Tu promedio emocional de 3.8 refleja equilibrio. No siempre hay que estar en 5.',
    value: '3.8/5',
  },
  {
    id: 'demo-insight-4',
    type: 'warning' as const,
    category: 'nutrición',
    icon: '🌿',
    title: 'Solo 3 días de nutrición',
    description: 'Menos registros que otras semanas. No pasa nada — simplemente no fue prioridad.',
    value: '3 días',
  },
  {
    id: 'demo-insight-5',
    type: 'trend' as const,
    category: 'finanzas',
    icon: '💎',
    title: 'Balance positivo',
    description: 'Tus finanzas muestran +89€ esta semana. Los pequeños márgenes importan.',
    value: '+89€',
  },
];

// ─── Insights: Weekly Comparison ─────────────

export const SCREENSHOT_WEEKLY_COMPARISON = {
  emotionTrend: 0.1,
  energyTrend: -0.15,
  stressTrend: -0.1,
  activityTrend: 0.15,
  meditationTrend: 0.3,
  habitTrend: 0.1,
};

// ─── Habits (Disciplina) ─────────────────────
// Mix of strong and newer habits — not all perfect

export const SCREENSHOT_HABITS = [
  {
    id: 'demo-habit-1',
    name: 'Meditación matutina',
    description: '10 minutos al despertar',
    frequency: 'daily',
    streak: 7,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-2',
    name: 'Lectura antes de dormir',
    description: '20 páginas mínimo',
    frequency: 'daily',
    streak: 5,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-3',
    name: 'Ejercicio',
    description: '30 minutos de actividad',
    frequency: 'daily',
    streak: 2,
    lastCompletedAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-4',
    name: 'Registrar finanzas',
    description: 'Anotar ingresos y gastos',
    frequency: 'daily',
    streak: 9,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 60 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-5',
    name: 'Diario de gratitud',
    description: '3 cosas por las que estar agradecida',
    frequency: 'daily',
    streak: 3,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

// ─── Frozen Tips per Empire ──────────────────
// Same tips every time for consistent screenshots.
// These match the EmpireTip structure from the API.

export const SCREENSHOT_FROZEN_TIPS: Record<string, { freeTips: any[]; premiumTips: any[] }> = {
  mente: {
    freeTips: [
      { title: 'Respiración 4-7-8', content: 'Inhala 4 segundos, mantén 7, exhala 8. Tu sistema nervioso se calma en menos de un minuto.' },
      { title: 'Observa sin juzgar', content: 'Cuando aparezca un pensamiento difícil, nómbralo y déjalo pasar. No tienes que resolverlo ahora.' },
    ],
    premiumTips: [
      { title: 'El poder de la pausa', content: 'Antes de reaccionar, espera 3 segundos. Ese espacio entre estímulo y respuesta es donde vive la libertad.' },
    ],
  },
  energia: {
    freeTips: [
      { title: 'Movimiento consciente', content: 'No necesitas una hora de ejercicio. 10 minutos de movimiento consciente cambian tu energía.' },
      { title: 'Hidratación primero', content: 'Antes del café, un vaso de agua. Tu cuerpo lleva horas sin hidratarse.' },
    ],
    premiumTips: [
      { title: 'Energía y ritmo circadiano', content: 'Tu energía tiene picos naturales. Las mañanas son para crear, las tardes para integrar.' },
    ],
  },
  disciplina: {
    freeTips: [
      { title: 'Regla de los 2 minutos', content: 'Si algo toma menos de 2 minutos, hazlo ahora. La procrastinación pequeña se acumula.' },
      { title: 'Un hábito a la vez', content: 'No intentes cambiar todo de golpe. Un hábito durante 30 días es más poderoso que 7 durante 3.' },
    ],
    premiumTips: [
      { title: 'Diseña tu entorno', content: 'La disciplina no es fuerza de voluntad. Es diseñar tu entorno para que lo fácil sea lo correcto.' },
    ],
  },
  riqueza: {
    freeTips: [
      { title: 'Registro sin juicio', content: 'Anotar tus gastos no es controlarte. Es verte con claridad. El primer paso siempre es ver.' },
      { title: 'La regla del contexto', content: 'No basta con anotar la cantidad. Escribe qué pasó. Eso convierte un número en consciencia.' },
    ],
    premiumTips: [
      { title: 'Intención antes de cantidad', content: 'Antes de registrar, pregunta: ¿esto fue tranquilidad, crecimiento, necesidad o disfrute?' },
    ],
  },
  crecimiento: {
    freeTips: [
      { title: 'Escribe sin pensar', content: 'No busques la frase perfecta. Escribe lo que salga. La claridad viene escribiendo, no pensando.' },
      { title: 'Gratitud específica', content: 'En vez de "estoy agradecida por mi familia", prueba "estoy agradecida por la llamada de mamá hoy".' },
    ],
    premiumTips: [
      { title: 'Relee tu propio cambio', content: 'Vuelve a entradas de hace 3 meses. Te sorprenderá cuánto has crecido sin darte cuenta.' },
    ],
  },
};

// ─── Frozen Reflection ───────────────────────

export const SCREENSHOT_REFLECTION = 'No confundas movimiento con progreso. A veces quedarse quieto es avanzar.';

// ─── Frozen Memory ───────────────────────────

export const SCREENSHOT_SILENT_MEMORY = {
  text: 'Hace 47 días, escribiste: "Quiero aprender a estar sin hacer."',
  date: new Date(Date.now() - 47 * 86400000).toISOString(),
};

// ─── Journal Entries (Crecimiento) ───────────
// Elena's journal: real, imperfect, human.
// She doesn't write every day. Some entries are short,
// some are longer. Some days she's grateful, some she's not.
// Moods vary. Some entries have gratitude, some don't.
// One entry was edited later — she went back to add something.

export const SCREENSHOT_JOURNAL_ENTRIES = [
  // Today — morning reflection
  {
    id: 'journal-today-1',
    title: 'Antes de que empiece el día',
    content: 'Me he sentado un momento en la cocina antes de encender el móvil. Solo eso. Cinco minutos de silencio con el café. No fue una meditación, no fue nada especial. Solo estar ahí. Y me he dado cuenta de que antes no hacía esto. Antes encendía el teléfono antes que la cafetera. Algo está cambiando, aunque sea pequeñito.',
    mood: 4,
    gratitude: 'El silencio de la cocina a las 7',
    createdAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  // Yesterday — something heavier
  {
    id: 'journal-yesterday-1',
    title: 'Conversación difícil',
    content: 'He hablado con mamá por teléfono. Me ha dicho algo que me dolió, pero no he reaccionado mal. Me he callado un momento y luego he respondido desde otro sitio. No desde la defensa. Creo que es la primera vez que lo consigo. No estoy segura de cómo lo he hecho, pero ahí está. Un paso raro, torpe, pero paso al fin.',
    mood: 3,
    gratitude: null,
    createdAt: new Date(Date.now() - 1 * 86400000 - 4 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 86400000 - 4 * 3600000).toISOString(),
  },
  // 2 days ago — short, grateful
  {
    id: 'journal-2d-1',
    title: 'Cosas pequeñas',
    content: 'Hoy no ha pasado nada grande y eso está bien. Café con Laura, paseo por el parque, leer un rato. Días así también cuentan.',
    mood: 4,
    gratitude: 'La luz de mayo en el parque',
    createdAt: new Date(Date.now() - 2 * 86400000 - 6 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 86400000 - 6 * 3600000).toISOString(),
  },
  // 4 days ago — low mood, no gratitude
  {
    id: 'journal-4d-1',
    title: 'Día raro',
    content: 'No sé por qué pero hoy me ha costado todo. Me he levantado cansada, he ido arrastrando, y al final del día me siento como si no hubiera hecho nada. Sé que no es verdad, pero la sensación está ahí. Mañana quizás veo esto distinto.',
    mood: 2,
    gratitude: null,
    createdAt: new Date(Date.now() - 4 * 86400000 - 5 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 86400000 - 5 * 3600000).toISOString(),
  },
  // 5 days ago — an observation, slightly edited later
  {
    id: 'journal-5d-1',
    title: 'Patrón que veo',
    content: 'Llevo tres semanas registrando y hay algo que se repite: los martes siempre me cuesta más. No sé si es el inicio de la semana laboral o qué, pero es un patrón. Anotarlo ya me hace sentir que no es fallo mío, es ritmo.',
    mood: 3,
    gratitude: 'Ver lo que antes no veía',
    createdAt: new Date(Date.now() - 5 * 86400000 - 7 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 86400000 - 1 * 3600000).toISOString(),  // edited later that day
  },
  // 7 days ago — something positive
  {
    id: 'journal-7d-1',
    title: 'Semana que se acaba bien',
    content: 'Después de un inicio de semana raro, he acabado sintiendo que las cosas se fueron acomodando. No he hecho nada extraordinario, pero he estado más presente. He meditado tres días, he escrito casi todos. Eso me basta por ahora.',
    mood: 4,
    gratitude: 'La racha de check-ins — 9 días',
    createdAt: new Date(Date.now() - 7 * 86400000 - 8 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 86400000 - 8 * 3600000).toISOString(),
  },
  // 9 days ago — longer entry, weekend reflection
  {
    id: 'journal-9d-1',
    title: 'Sábado lento',
    content: 'Hoy no he hecho nada productivo y por primera vez no me he sentido culpable. Me he quedado en el sofá, he leído, he visto una serie. Y cuando ha venido el pensamiento de "deberías estar haciendo algo", lo he dejado pasar. No he luchado contra él. Solo lo he visto y he seguido en el sofá. Creo que esto también es crecer. No todo es hacer más. A veces es hacer menos y estar bien con ello.',
    mood: 3,
    gratitude: 'No sentir culpa por descansar',
    createdAt: new Date(Date.now() - 9 * 86400000 - 11 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 86400000 - 11 * 3600000).toISOString(),
  },
  // 11 days ago — quick note about a book
  {
    id: 'journal-11d-1',
    title: 'Algo que leí',
    content: '"La ansiedad es el precio de la libertad." No recuerdo dónde, pero se me quedó. Me recuerda que sentir incomodidad no significa que algo vaya mal.',
    mood: 4,
    gratitude: null,
    createdAt: new Date(Date.now() - 11 * 86400000 - 6 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 11 * 86400000 - 6 * 3600000).toISOString(),
  },
  // 14 days ago — honest about missing habits
  {
    id: 'journal-14d-1',
    title: 'Se me cayó la racha',
    content: 'Llevaba 5 días seguidos meditando y se me olvidó ayer. O no olvidé — elegí no hacerlo. Estaba cansada y me fui a la cama. Hoy me ha dado un poco de rabia, pero luego he pensado: 5 días está bien. No es un fracaso, es una pausa. Hoy he vuelto. Eso es lo que importa.',
    mood: 3,
    gratitude: 'Volver sin castigarme',
    createdAt: new Date(Date.now() - 14 * 86400000 - 7 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 14 * 86400000 - 7 * 3600000).toISOString(),
  },
  // 18 days ago — deeper reflection, early in the journey
  {
    id: 'journal-18d-1',
    title: 'Lo que llevo aprendido',
    content: 'Si miro atrás, hay algo que ha cambiado. No algo grande ni visible. Pero antes reaccionaba más. Ahora hay un pequeño espacio entre lo que pasa y lo que siento. A veces es un segundo, a veces ni eso. Pero está ahí. Y en ese segundo cabe una decisión que antes no existía. No sé si esto tiene nombre. Solo sé que no lo tenía antes.',
    mood: 3,
    gratitude: 'El espacio entre reacción y respuesta',
    createdAt: new Date(Date.now() - 18 * 86400000 - 9 * 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 18 * 86400000 - 9 * 3600000).toISOString(),
  },
];

// ─── Achievements for Logros page ────────────
// Full 27 visible achievements + 3 mystery hidden achievements.
// After ~3 months, Elena has 12 unlocked — the "first" milestones
// plus some intermediate ones. Not too many, not too few.
// Progress is uneven across categories — she's more consistent
// with check-ins and journal, less with nutrition and meditation.
// Hidden achievements start appearing as mystery cards at ≥75%.

export const SCREENSHOT_ACHIEVEMENTS = {
  stats: { total: 45, unlocked: 14, percent: 31 },
  achievements: [
    // ═══ UNLOCKED (12) ═══
    // The early milestones + some that naturally came with time
    { key: 'meditation_first', title: 'Primer Silencio', description: 'Tu primera pausa consciente', category: 'meditation', icon: 'Wind', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-02-14T08:00:00.000Z', hidden: false },
    { key: 'journal_first', title: 'Primera Página', description: 'Tu primera reflexión escrita', category: 'journal', icon: 'BookOpen', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-02-14T22:00:00.000Z', hidden: false },
    { key: 'checkin_first', title: 'Primer Despertar', description: 'Tu primer check-in diario', category: 'checkin', icon: 'Sun', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-02-14T07:00:00.000Z', hidden: false },
    { key: 'wellness_first', title: 'Primer Escucha', description: 'Tu primer registro de bienestar', category: 'wellness', icon: 'Heart', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-02-15T07:00:00.000Z', hidden: false },
    { key: 'habits_first', title: 'Primer Compromiso', description: 'Tu primer hábito registrado', category: 'habits', icon: 'CheckCircle', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-02-16T09:00:00.000Z', hidden: false },
    { key: 'finance_first', title: 'Primer Registro', description: 'Tu primer movimiento financiero', category: 'finance', icon: 'Wallet', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-02-17T18:00:00.000Z', hidden: false },
    { key: 'nutrition_first', title: 'Atención al Cuerpo', description: 'Tu primer registro alimentario', category: 'nutrition', icon: 'Utensils', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-03-01T13:00:00.000Z', hidden: false },
    { key: 'finance_income_first', title: 'Entró Algo', description: 'Tu primer ingreso registrado', category: 'finance', icon: 'PiggyBank', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-03-05T09:00:00.000Z', hidden: false },
    { key: 'checkin_7', title: 'Semana Consciente', description: '7 check-ins diarios', category: 'checkin', icon: 'Sun', target: 7, current: 7, percent: 100, unlocked: true, unlockedAt: '2026-03-20T07:00:00.000Z', hidden: false },
    { key: 'habits_5', title: 'Ritmo Interior', description: '5 hábitos activos', category: 'habits', icon: 'CheckCircle', target: 5, current: 5, percent: 100, unlocked: true, unlockedAt: '2026-03-10T08:00:00.000Z', hidden: false },
    { key: 'journal_10', title: 'Voces que Vuelven', description: '10 entradas en tu diario', category: 'journal', icon: 'BookOpen', target: 10, current: 10, percent: 100, unlocked: true, unlockedAt: '2026-04-02T21:00:00.000Z', hidden: false },
    { key: 'empire_all', title: 'Cinco Caminos', description: 'Actividad en los 5 imperios', category: 'general', icon: 'Crown', target: 5, current: 5, percent: 100, unlocked: true, unlockedAt: '2026-03-15T19:00:00.000Z', hidden: false },

    // ═══ IN-PROGRESS: VISIBLE (15) ═══
    // Varying levels — some close, some far, some barely started
    // Meditation: she's consistent but not daily — 7/10, 18/30, 18/100
    { key: 'meditation_10', title: 'Calma Reencontrada', description: '10 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 10, current: 7, percent: 70, unlocked: false, unlockedAt: null, hidden: false },
    { key: 'meditation_30', title: 'Silencio Habitual', description: '30 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 30, current: 18, percent: 60, unlocked: false, unlockedAt: null, hidden: false },
    { key: 'meditation_100', title: 'Respiración Profunda', description: '100 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 100, current: 18, percent: 18, unlocked: false, unlockedAt: null, hidden: false },
    // Journal: she writes most days — 24/30 close, 24/100 far
    { key: 'journal_30', title: 'Rastro Escrito', description: '30 entradas en tu diario', category: 'journal', icon: 'BookOpen', target: 30, current: 24, percent: 80, unlocked: false, unlockedAt: null, hidden: false },
    { key: 'journal_100', title: 'Memoria Viva', description: '100 entradas en tu diario', category: 'journal', icon: 'BookOpen', target: 100, current: 24, percent: 24, unlocked: false, unlockedAt: null, hidden: false },
    // Wellness: moderate — 11/15 close, 11/50 early
    { key: 'wellness_15', title: 'Observación Constante', description: '15 registros de bienestar', category: 'wellness', icon: 'Heart', target: 15, current: 11, percent: 73, unlocked: false, unlockedAt: null, hidden: false },
    { key: 'wellness_50', title: 'Consciencia Asentada', description: '50 registros de bienestar', category: 'wellness', icon: 'Heart', target: 50, current: 11, percent: 22, unlocked: false, unlockedAt: null, hidden: false },
    // Habits: 5 active but streak is 9 days — decent not great
    { key: 'habits_steady_14', title: 'Constancia Tranquila', description: '14 días seguidos en un hábito', category: 'habits', icon: 'Flame', target: 14, current: 9, percent: 64, unlocked: false, unlockedAt: null, hidden: false },
    // Nutrition: she forgets — 8/15, 8/50
    { key: 'nutrition_15', title: 'Cuerpo Escuchado', description: '15 registros de nutrición', category: 'nutrition', icon: 'Utensils', target: 15, current: 8, percent: 53, unlocked: false, unlockedAt: null, hidden: false },
    { key: 'nutrition_50', title: 'Cuidado Sostenido', description: '50 registros de nutrición', category: 'nutrition', icon: 'Utensils', target: 50, current: 8, percent: 16, unlocked: false, unlockedAt: null, hidden: false },
    // Finance: she's been tracking more lately — 17/20 very close, 33/50 moderate
    { key: 'finance_20', title: 'Memoria Económica', description: '20 registros financieros', category: 'finance', icon: 'Wallet', target: 20, current: 17, percent: 85, unlocked: false, unlockedAt: null, hidden: false },
    { key: 'finance_50', title: 'Trayectoria Clara', description: '50 registros financieros', category: 'finance', icon: 'Wallet', target: 50, current: 33, percent: 66, unlocked: false, unlockedAt: null, hidden: false },
    // Check-in: very consistent — 23/30 close
    { key: 'checkin_30', title: 'Mes Presente', description: '30 check-ins diarios', category: 'checkin', icon: 'Sun', target: 30, current: 23, percent: 77, unlocked: false, unlockedAt: null, hidden: false },
    // Closures: 2 done, needs 3
    { key: 'monthly_closure_first', title: 'Primer Cierre', description: 'Tu primer cierre mensual', category: 'general', icon: 'Calendar', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-04-01T20:00:00.000Z', hidden: false },
    { key: 'monthly_closure_3', title: 'Tiempo Reflexionado', description: '3 cierres mensuales', category: 'general', icon: 'Calendar', target: 3, current: 2, percent: 67, unlocked: false, unlockedAt: null, hidden: false },

    // ═══ MYSTERY: Hidden achievements near-unlock (3) ═══
    // These appear as "???" cards with category + progress visible
    // but title and description hidden — feels like discovery

    // She writes gratitude often — 8/10 journal entries have it
    { key: 'hidden_gratitude_10', title: '???', description: 'Algo está por aparecer', category: 'journal', icon: 'Sparkles', target: 10, current: 8, percent: 80, unlocked: false, unlockedAt: null, hidden: true },
    // She's been adding context to finance logs — 8/10
    { key: 'hidden_finance_context_10', title: '???', description: 'Algo está por aparecer', category: 'finance', icon: 'MessageCircle', target: 10, current: 8, percent: 80, unlocked: false, unlockedAt: null, hidden: true },
    // She came back after a 10-day gap in April — comeback detected, now revealed
    { key: 'hidden_comeback', title: 'Regreso', description: 'Volviste tras una pausa larga', category: 'general', icon: 'RotateCcw', target: 1, current: 1, percent: 100, unlocked: true, unlockedAt: '2026-04-12T08:00:00.000Z', hidden: true },
  ],
  newlyUnlocked: [],
};

// ─── Check-in History ────────────────────────
// A few recent check-ins for the history view

export const SCREENSHOT_CHECKIN_HISTORY = [
  { id: 'ch-1', date: new Date().toISOString(), emotion: 4, energy: 3, focus: 4, stress: 2, intention: 'Estar presente, no perfecta' },
  { id: 'ch-2', date: new Date(Date.now() - 86400000).toISOString(), emotion: 3, energy: 3, focus: 3, stress: 3, intention: 'Un día a la vez' },
  { id: 'ch-3', date: new Date(Date.now() - 2 * 86400000).toISOString(), emotion: 4, energy: 4, focus: 4, stress: 1, intention: 'Fluir sin forzar' },
  { id: 'ch-4', date: new Date(Date.now() - 3 * 86400000).toISOString(), emotion: 3, energy: 2, focus: 3, stress: 4, intention: 'Respirar cuando sea difícil' },
  { id: 'ch-5', date: new Date(Date.now() - 4 * 86400000).toISOString(), emotion: 5, energy: 4, focus: 4, stress: 2, intention: 'Disfrutar el buen momento' },
];

// ─── Monthly Closure ─────────────────────────

export const SCREENSHOT_MONTHLY_CLOSURE = {
  hasPending: true,
  pendingMonth: '2026-04',
  message: 'Abril tiene algo que decirte.',
};

// ─── Premium Reflection (frozen) ─────────────

export const SCREENSHOT_PREMIUM_REFLECTION = 'No confundas movimiento con progreso. A veces quedarse quieto es avanzar.';

// ─── User name (for greeting) ────────────────

export const SCREENSHOT_USER_NAME = 'Elena';
