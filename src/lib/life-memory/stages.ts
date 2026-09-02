// ═══════════════════════════════════════════
// Etapas — Stage Detection
// ═══════════════════════════════════════════
//
// Detects soft human "stages" from accumulated data.
// NO scores. NO diagnostics. NO clinical labels.
// Only gentle observations: calm, growth, intensity, dispersion.
//
// Stage narratives can be enriched with connections
// from the empire connections engine (detectConnections).
// This module consumes engine results — never calculates
// correlations on its own.
//
// If insufficient data: silence.
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { getMadridMonthRange, formatMonthLabel, getPastMonthKeys } from '@/lib/dates';
import type { EmpireConnectionSignal } from '@/lib/patterns/types';

// ─── Types ───

export type StageFlavor =
  | 'calm'        // Low stress, stable energy, tranquil intentions
  | 'growth'      // Active, growth-oriented intentions, higher activity
  | 'intensity'   // High stress, high activity, more urgency
  | 'dispersion'  // Variable, inconsistent, scattered activity
  | 'exhaustion'  // Low energy, high stress, necessity-driven
  | 'quiet'       // Very little activity, silence
  | 'stability';  // Consistent, steady, predictable rhythm

export interface LifeStage {
  month: string;        // YYYY-MM
  monthLabel: string;   // "Enero 2025"
  flavor: StageFlavor;
  observation: string;  // Human-readable, calm observation
  dataPoints: number;   // How much data backed this (internal, never shown to user)
}

export interface StageTransition {
  from: StageFlavor;
  to: StageFlavor;
  month: string;
  monthLabel: string;
  observation: string;  // "Tu vida parece más tranquila últimamente."
}

// ─── Stage flavors → human labels ───

const STAGE_FLAVOR_LABELS: Record<StageFlavor, string> = {
  calm: 'Calma',
  growth: 'Crecimiento',
  intensity: 'Intensidad',
  dispersion: 'Dispersión',
  exhaustion: 'Agotamiento',
  quiet: 'Silencio',
  stability: 'Estabilidad',
};

// ─── Monthly aggregation helpers ───

interface MonthAggregation {
  month: string;
  avgStress: number;
  avgEnergy: number;
  avgSleep: number;
  avgMood: number;
  intentionBalance: { tranquility: number; growth: number; necessity: number; enjoyment: number; total: number };
  totalActivity: number;
  financeLogs: number;
  checkins: number;
  wellnessLogs: number;
  journalEntries: number;
  meditationSessions: number;
  habitLogs: number;
  nutritionLogs: number;
}

// ─── Aggregate a single month ───

async function aggregateMonth(userId: string, yyyyMM: string): Promise<MonthAggregation | null> {
  const { start, end } = getMadridMonthRange(yyyyMM);

  const [wellness, checkins, finances, journals, meditations, habits, nutritions] = await Promise.all([
    db.wellnessLog.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { stress: true, energy: true, sleep: true, mood: true },
    }),
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { stress: true, energy: true, emotion: true, intention: true },
    }),
    db.financeLog.findMany({
      where: { userId, date: { gte: start, lt: end }, mood: { not: null } },
      select: { mood: true },
    }),
    db.journalEntry.count({
      where: { userId, createdAt: { gte: start, lt: end } },
    }),
    db.meditationSession.count({
      where: { userId, completedAt: { gte: start, lt: end } },
    }),
    db.habitLog.count({
      where: { userId, lastCompletedAt: { gte: start, lt: end } },
    }),
    db.nutritionLog.count({
      where: { userId, date: { gte: start, lt: end } },
    }),
  ]);

  const meditationCount = meditations;
  const habitCount = habits;
  const nutritionCount = nutritions;
  const totalLogs = wellness.length + checkins.length + finances.length;
  if (totalLogs === 0 && journals === 0 && meditationCount === 0 && habitCount === 0 && nutritionCount === 0) return null;

  // Average metrics from all available sources
  const allStress = [...wellness.map(w => w.stress), ...checkins.map(c => c.stress)];
  const allEnergy = [...wellness.map(w => w.energy), ...checkins.map(c => c.energy)];
  const allMood = [...wellness.map(w => w.mood), ...checkins.map(c => c.emotion)];
  const allSleep = wellness.map(w => w.sleep);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Intention balance — from finance logs AND checkin intentions
  const intentionBalance = { tranquility: 0, growth: 0, necessity: 0, enjoyment: 0, total: 0 };
  for (const f of finances) {
    const m = f.mood?.toLowerCase();
    if (m === 'tranquility' || m === 'calm') intentionBalance.tranquility++;
    else if (m === 'growth' || m === 'conscious') intentionBalance.growth++;
    else if (m === 'necessity' || m === 'necessary') intentionBalance.necessity++;
    else if (m === 'enjoyment' || m === 'impulse') intentionBalance.enjoyment++;
    else intentionBalance.tranquility++; // Default: calm/tranquil spending
    intentionBalance.total++;
  }
  for (const c of checkins) {
    const intent = c.intention?.toLowerCase();
    if (!intent) continue;
    if (intent.includes('calma') || intent.includes('tranquil') || intent.includes('reposo') || intent.includes('descans')) intentionBalance.tranquility++;
    else if (intent.includes('creci') || intent.includes('movimiento') || intent.includes('aprend') || intent.includes('mejor') || intent.includes('progres')) intentionBalance.growth++;
    else if (intent.includes('necesid') || intent.includes('oblig') || intent.includes('deber') || intent.includes('trabaj')) intentionBalance.necessity++;
    else if (intent.includes('disfrut') || intent.includes('placer') || intent.includes('gust')) intentionBalance.enjoyment++;
    else intentionBalance.tranquility++; // Default: calm intention
    intentionBalance.total++;
  }

  return {
    month: yyyyMM,
    avgStress: avg(allStress),
    avgEnergy: avg(allEnergy),
    avgSleep: avg(allSleep),
    avgMood: avg(allMood),
    intentionBalance,
    totalActivity: totalLogs + journals + meditationCount + habitCount + nutritionCount,
    financeLogs: finances.length,
    checkins: checkins.length,
    wellnessLogs: wellness.length,
    journalEntries: journals,
    meditationSessions: meditationCount,
    habitLogs: habitCount,
    nutritionLogs: nutritionCount,
  };
}

// ─── Classify a month into a stage flavor ───

function classifyStage(agg: MonthAggregation): StageFlavor {
  const { avgStress, avgEnergy, avgSleep, intentionBalance, totalActivity } = agg;

  // Very little activity → quiet
  if (totalActivity < 3) return 'quiet';

  // High stress + low energy → exhaustion
  if (avgStress > 3.5 && avgEnergy < 2.5) return 'exhaustion';

  // High stress + high activity → intensity
  if (avgStress > 3.2 && totalActivity > 15) return 'intensity';

  // High growth intention → growth
  const { growth, tranquility, necessity, enjoyment, total } = intentionBalance;
  if (total > 0 && growth / total > 0.4) return 'growth';

  // High tranquility + low stress → calm
  if (total > 0 && tranquility / total > 0.4 && avgStress < 2.5) return 'calm';

  // Low stress + decent energy → stability
  if (avgStress < 2.5 && avgEnergy >= 3) return 'stability';

  // Mixed signals → dispersion
  return 'dispersion';
}

// ─── Connection enrichment ───
// Maps stage flavors to empire connections that provide
// meaningful context. Only showable connections (high enough
// confidence) are used. The engine decides quality;
// this module only selects relevant context.

const STAGE_CONNECTION_MAP: Record<StageFlavor, string[]> = {
  growth: ['finanzas-mente', 'energia-mente', 'checkin-mente'],
  stability: ['finanzas-mente', 'energia-mente'],
  calm: ['finanzas-energia', 'energia-mente'],
  intensity: ['finanzas-estres'],
  exhaustion: ['finanzas-energia', 'finanzas-sueno'],
  dispersion: [],
  quiet: [],
};

// Connection → enrichment text (observed, never causal).
// These are append-only: they follow the base observation.
const CONNECTION_ENRICHMENT: Record<string, string> = {
  'finanzas-mente': 'También coincide con una mayor estabilidad en tus decisiones.',
  'energia-mente': 'También coincide con una mejora de tu energía.',
  'checkin-mente': 'También coincide con un mayor enfoque en tu día a día.',
  'finanzas-energia': 'También coincide con cambios en tu nivel de energía.',
  'finanzas-estres': 'También coincide con un cambio en tu nivel de presión.',
  'finanzas-sueno': 'También coincide con un cambio en tu descanso.',
};

function findRelevantConnection(
  flavor: StageFlavor,
  connections: EmpireConnectionSignal[],
): EmpireConnectionSignal | null {
  const candidates = STAGE_CONNECTION_MAP[flavor] || [];
  for (const connectionId of candidates) {
    const match = connections.find(c => c.connection === connectionId && c.showable);
    if (match) return match;
  }
  return null;
}

// ─── Generate a calm human observation for a stage ───

function stageObservation(
  flavor: StageFlavor,
  agg: MonthAggregation,
  connections: EmpireConnectionSignal[],
  isPremium: boolean,
): string {
  const { intentionBalance } = agg;
  const { growth, tranquility, total } = intentionBalance;

  let base: string;

  switch (flavor) {
    case 'calm':
      if (total > 0 && tranquility / total > 0.5)
        base = 'Este fue uno de tus períodos con más calma.';
      else
        base = 'Un período tranquilo, con poca presión.';
      break;

    case 'growth':
      if (total > 0 && growth / total > 0.5)
        base = 'Este fue uno de tus períodos más activos.';
      else
        base = 'Tu actividad fue mayor que en meses anteriores.';
      break;

    case 'intensity':
      base = 'Fue un período con mucha actividad y varios cambios.';
      break;

    case 'dispersion':
      base = 'Tus días fueron muy distintos entre sí durante este período.';
      break;

    case 'exhaustion':
      base = 'Tu energía fue más baja durante estas semanas.';
      break;

    case 'quiet':
      base = 'Hubo menos registros, por lo que este período ofrece menos información.';
      break;

    case 'stability':
      base = 'Mantuviste un ritmo constante durante estas semanas.';
      break;

    default:
      return '';
  }

  // FREE: no connection enrichment (brief narrative)
  if (!isPremium) return base;

  // ÉLITE: enrich with a relevant connection from the engine
  const relevant = findRelevantConnection(flavor, connections);
  if (relevant) {
    const enrichment = CONNECTION_ENRICHMENT[relevant.connection];
    if (enrichment) return `${base} ${enrichment}`;
  }

  return base;
}

// ─── Enrich transition observations with connections ───

const TRANSITION_ENRICHMENT: Record<string, string> = {
  'exhaustion->calm': 'Tus finanzas también reflejan ese cambio.',
  'exhaustion->stability': 'Esa estabilidad se nota también en otras áreas.',
  'intensity->calm': 'Tu práctica mental también se reflejó en ese cambio.',
  'intensity->stability': 'Ese ritmo más constante se observa en varias áreas.',
  'quiet->growth': 'Esa actividad aumentó de forma coordinada en varias áreas.',
  'quiet->stability': 'Encontraste un ritmo constante en varios aspectos de tu vida.',
  'growth->stability': 'Esa estabilidad abarca varios aspectos de tu vida.',
  'exhaustion->growth': 'Esa recuperación se observa en varias áreas a la vez.',
};

// Connections that validate a transition (same empire domains)
const TRANSITION_CONNECTION_VALIDATION: Record<string, string[]> = {
  'exhaustion->calm': ['finanzas-energia', 'energia-mente'],
  'exhaustion->stability': ['finanzas-energia', 'energia-mente'],
  'intensity->calm': ['finanzas-mente', 'energia-mente'],
  'intensity->stability': ['finanzas-mente', 'checkin-mente'],
  'quiet->growth': ['energia-mente', 'checkin-mente', 'finanzas-mente'],
  'quiet->stability': ['finanzas-mente', 'energia-mente'],
  'growth->stability': ['energia-mente', 'checkin-mente'],
  'exhaustion->growth': ['energia-mente'],
};

// ─── Detect stage transitions ───

function detectTransitions(
  stages: LifeStage[],
  connections: EmpireConnectionSignal[],
  isPremium: boolean,
): StageTransition[] {
  const transitions: StageTransition[] = [];

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const curr = stages[i];

    if (prev.flavor === curr.flavor) continue;

    const observation = generateTransitionObservation(prev.flavor, curr.flavor, connections, isPremium);
    if (observation) {
      transitions.push({
        from: prev.flavor,
        to: curr.flavor,
        month: curr.month,
        monthLabel: curr.monthLabel,
        observation,
      });
    }
  }

  return transitions;
}

function generateTransitionObservation(
  from: StageFlavor,
  to: StageFlavor,
  connections: EmpireConnectionSignal[],
  isPremium: boolean,
): string {
  // Just changes. Not improvements or setbacks.
  const transitions: Record<string, string> = {
    'exhaustion->calm': 'Tu nivel de tranquilidad aumentó respecto al período anterior.',
    'exhaustion->stability': 'Encontraste un ritmo más estable que antes.',
    'intensity->calm': 'Después de un período intenso, la actividad se calmó.',
    'intensity->stability': 'Tu ritmo se volvió más constante después de varias semanas activas.',
    'dispersion->stability': 'Tus días se volvieron más uniformes que antes.',
    'dispersion->calm': 'La variabilidad entre días disminuyó respecto al período anterior.',
    'quiet->growth': 'Después de un período con poca actividad, tu nivel de actividad aumentó.',
    'quiet->stability': 'Tu ritmo pasó de ser irregular a más constante.',
    'calm->growth': 'Después de un período tranquilo, aumentó tu nivel de actividad.',
    'calm->intensity': 'Un período tranquilo seguido de uno con más cambios y actividad.',
    'growth->calm': 'Después de un período activo, la actividad disminuyó.',
    'growth->stability': 'Tu actividad se estabilizó tras un período de crecimiento.',
    'stability->intensity': 'Después de un ritmo constante, el nivel de actividad aumentó.',
    'stability->dispersion': 'Tus días se volvieron más irregulares que en el período anterior.',
    'stability->exhaustion': 'Tu nivel de energía disminuyó respecto al período anterior.',
    'calm->dispersion': 'Tus días se volvieron más distintos entre sí.',
    'growth->intensity': 'La alta actividad del período anterior trajo consigo más intensidad.',
    'intensity->exhaustion': 'Después de un período muy activo, tu energía bajó.',
    'exhaustion->growth': 'Tras un período con poca energía, la actividad volvió a subir.',
    'quiet->calm': 'Tu nivel de actividad fue mayor tras un período con poca información.',
  };

  const key = `${from}->${to}`;
  const base = transitions[key] || '';
  if (!base) return '';

  // FREE: no connection enrichment
  if (!isPremium) return base;

  // ÉLITE: enrich if a relevant connection validates the transition
  const validConnections = TRANSITION_CONNECTION_VALIDATION[key] || [];
  const hasValidation = validConnections.some(
    connId => connections.some(c => c.connection === connId && c.showable),
  );
  if (hasValidation) {
    const enrichment = TRANSITION_ENRICHMENT[key];
    if (enrichment) return `${base} ${enrichment}`;
  }

  return base;
}

// ─── Main: Detect all life stages ───

export async function detectLifeStages(
  userId: string,
  months: string[],
  options?: {
    connections?: EmpireConnectionSignal[];
    isPremium?: boolean;
  },
): Promise<{
  stages: LifeStage[];
  transitions: StageTransition[];
}> {
  const connections = options?.connections || [];
  const isPremium = options?.isPremium ?? false;

  // Aggregate each month in parallel
  const aggregations = await Promise.all(
    months.map(m => aggregateMonth(userId, m))
  );

  // Classify each month
  const stages: LifeStage[] = [];
  for (let i = 0; i < months.length; i++) {
    const agg = aggregations[i];
    if (!agg) continue;

    const flavor = classifyStage(agg);
    stages.push({
      month: agg.month,
      monthLabel: formatMonthLabel(agg.month),
      flavor,
      observation: stageObservation(flavor, agg, connections, isPremium),
      dataPoints: agg.totalActivity,
    });
  }

  // Detect transitions between stages
  const transitions = detectTransitions(stages, connections, isPremium);

  return { stages, transitions };
}

// ─── Generate list of past months ───

export const getPastMonths = getPastMonthKeys;
