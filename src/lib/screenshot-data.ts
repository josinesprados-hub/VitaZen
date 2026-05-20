// ═══════════════════════════════════════════
// VitaZen — Screenshot Mode Mock Data
// ═══════════════════════════════════════════
//
// Premium, coherent demo data for Play Store
// and App Store screenshots. All values are
// realistic, balanced, and calm — matching the
// Oura / Headspace / Rise aesthetic.
//
// Data types match the exact TypeScript interfaces
// used by each page/component. No fake auth,
// payments, or premium entitlement.

import type { EmotionalState, EmotionalMetric } from './emotional-state';

// ─── Dashboard: Empires ───────────────────

export const SCREENSHOT_EMPIRES = [
  { empire: 'disciplina', level: 5, xp: 67, xpToNextLevel: 100, streak: 7, progress: 67 },
  { empire: 'mente', level: 4, xp: 42, xpToNextLevel: 100, streak: 5, progress: 42 },
  { empire: 'energia', level: 3, xp: 85, xpToNextLevel: 100, streak: 3, progress: 85 },
  { empire: 'riqueza', level: 2, xp: 30, xpToNextLevel: 100, streak: 2, progress: 30 },
  { empire: 'crecimiento', level: 3, xp: 55, xpToNextLevel: 100, streak: 4, progress: 55 },
];

// ─── Dashboard: Challenge ─────────────────

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

// ─── Dashboard: Metrics ───────────────────

export const SCREENSHOT_METRICS = {
  meditationWeek: 5,
  habitsCompleted: 12,
  journalWeek: 4,
  balance: 127,
  totalIncome: 1450,
  totalExpense: 1323,
};

// ─── Dashboard: Streaks ───────────────────

export const SCREENSHOT_STREAKS = {
  meditationStreak: 5,
  habitStreak: 7,
  journalStreak: 3,
  checkinStreak: 9,
  generalStreak: 9,
  streakMessage: {
    message: '9 días. Ya es costumbre.',
    tone: 'positive',
  },
};

// ─── Dashboard: Today's Check-in ──────────

export const SCREENSHOT_TODAY_CHECKIN = {
  id: 'demo-checkin-today',
  emotion: 4,
  energy: 4,
  focus: 3,
  stress: 2,
  intention: 'Hoy elijo avanzar con calma y propósito',
  gratitude: 'Agradezco la energía para empezar el día',
  createdAt: new Date().toISOString(),
};

// ─── Momentum ─────────────────────────────

export const SCREENSHOT_MOMENTUM = {
  score: 74,
  level: 'fuerte',
  description: 'Buen ritmo esta semana.',
  trend: 'up' as const,
  currentStreak: 9,
};

// ─── Emotional State ──────────────────────

export const SCREENSHOT_EMOTIONAL_STATE: EmotionalState = {
  status: 'enfocado',
  statusDescription: 'Energía y enfoque alineados.',
  summary: 'Disciplina y claridad hoy.',
  recommendation: 'Buena claridad. Lo que hagas con ella es tuyo.',
  plan: 'PREMIUM',
  metrics: {
    energy: {
      value: 75,
      label: 'Energía',
      trend: 'up' as const,
    },
    focus: {
      value: 82,
      label: 'Enfoque',
      trend: 'up' as const,
    },
    stress: {
      value: 28,
      label: 'Estrés',
      trend: 'down' as const,
    },
    consistency: {
      value: 71,
      label: 'Consistencia',
      trend: 'stable' as const,
    },
    progress: {
      value: 64,
      label: 'Progreso',
      trend: 'up' as const,
    },
    activity: {
      value: 68,
      label: 'Actividad',
      trend: 'up' as const,
    },
  },
};

// ─── Insights: Weekly Summary ─────────────

export const SCREENSHOT_INSIGHTS_SUMMARY = {
  weekLabel: '5 — 11 may 2026',
  score: 73,
  totalActivities: 34,
  checkins: { count: 5, avgEmotion: 4.2, avgEnergy: 3.8, avgFocus: 3.6, avgStress: 2.1 },
  habits: { completed: 12, topStreak: 7, topHabit: 'Meditación matutina' },
  meditation: { sessions: 5, totalMinutes: 62, avgDuration: 12 },
  journal: { entries: 4 },
  wellness: { logs: 5, avgMood: 4.0, avgSleep: 3.8 },
  nutrition: { logs: 4, avgWater: 6 },
  finance: { income: 1450, expense: 1323, balance: 127 },
  streaks: { bestEmpireStreak: 7, bestEmpireName: 'Disciplina' },
};

// ─── Insights: Auto-detected insights ─────

export const SCREENSHOT_INSIGHTS_LIST = [
  {
    id: 'demo-insight-1',
    type: 'positive' as const,
    category: 'hábitos',
    icon: '✅',
    title: 'Racha de 7 días en hábitos',
    description: 'Tu constancia en Disciplina es notable. Estás en el percentil superior de consistencia esta semana.',
    value: '7 días',
  },
  {
    id: 'demo-insight-2',
    type: 'trend' as const,
    category: 'meditación',
    icon: '🧘',
    title: 'Meditación en aumento',
    description: 'Tus sesiones de meditación han incrementado un 25% respecto a la semana anterior. La calidad de tu práctica mejora.',
    value: '+25%',
  },
  {
    id: 'demo-insight-3',
    type: 'positive' as const,
    category: 'emociones',
    icon: '💛',
    title: 'Estado emocional estable',
    description: 'Tu promedio emocional de 4.2 indica un buen equilibrio. Las mañanas conscientes están funcionando.',
    value: '4.2/5',
  },
  {
    id: 'demo-insight-4',
    type: 'warning' as const,
    category: 'estrés',
    icon: '🌿',
    title: 'Estrés ligeramente bajo',
    description: 'Tu nivel de estrés es bajo, lo cual es positivo. Mantén las pausas activas para sostener este equilibrio.',
    value: '2.1/5',
  },
  {
    id: 'demo-insight-5',
    type: 'trend' as const,
    category: 'finanzas',
    icon: '💎',
    title: 'Balance positivo esta semana',
    description: 'Tus finanzas muestran un balance de +127€. Los pequeños ahorros diarios se acumulan de forma significativa.',
    value: '+127€',
  },
];

// ─── Insights: Weekly Comparison ──────────

export const SCREENSHOT_WEEKLY_COMPARISON = {
  emotionTrend: 0.3,
  energyTrend: 0.2,
  stressTrend: -0.15,
  activityTrend: 0.25,
  meditationTrend: 0.4,
  habitTrend: 0.2,
};

// ─── Habits (Disciplina) ──────────────────

export const SCREENSHOT_HABITS = [
  {
    id: 'demo-habit-1',
    name: 'Meditación matutina',
    description: '10 minutos de meditación al despertar',
    frequency: 'daily',
    streak: 7,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-2',
    name: 'Lectura 20 páginas',
    description: 'Leer antes de dormir',
    frequency: 'daily',
    streak: 5,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-3',
    name: 'Ejercicio físico',
    description: '30 minutos de actividad',
    frequency: 'daily',
    streak: 3,
    lastCompletedAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-4',
    name: 'Registrar finanzas',
    description: 'Anotar ingresos y gastos del día',
    frequency: 'daily',
    streak: 9,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 45 * 86400000).toISOString(),
  },
  {
    id: 'demo-habit-5',
    name: 'Diario de gratitud',
    description: 'Escribir 3 cosas por las que estar agradecido',
    frequency: 'daily',
    streak: 4,
    lastCompletedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

// ─── Premium Reflection (for screenshots) ─

export const SCREENSHOT_REFLECTION = 'No confundas movimiento con progreso.';

// ─── User name (for greeting) ─────────────

export const SCREENSHOT_USER_NAME = 'VitaZen';
