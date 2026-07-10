// ═══════════════════════════════════════════
// Etapas — Stage Detection
// ═══════════════════════════════════════════
//
// Detects soft human "stages" from accumulated data.
// NO scores. NO diagnostics. NO clinical labels.
// Only gentle observations: calm, growth, intensity, dispersion.
//
// If insufficient data: silence.
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { getMadridDateKey } from '@/lib/deterministic';

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

function getMonthRange(yyyyMM: string) {
  const [year, month] = yyyyMM.split('-').map(Number);
  // Use Date.UTC to avoid server-local timezone interpretation.
  // Month boundaries must align with Madrid midnight, not server-local midnight.
  // Since Prisma compares dates as UTC timestamps, we shift the UTC midnight
  // by the Madrid offset so the DB query covers the correct Madrid-day range.
  const startUTC = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endUTC = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  // Compute Madrid offset at noon on the 15th of the respective month (avoids DST edge cases)
  const startOffset = getMadridOffsetMs(startUTC);
  const endOffset = getMadridOffsetMs(endUTC);
  return {
    start: new Date(startUTC.getTime() - startOffset),
    end: new Date(endUTC.getTime() - endOffset),
  };
}

/**
 * Compute the Madrid timezone offset in milliseconds at a given UTC time.
 * Positive offset means Madrid is ahead of UTC (CET = +1h, CEST = +2h).
 * Uses the same technique as getMadridStartOfNextDay() in limits.ts.
 */
function getMadridOffsetMs(utcDate: Date): number {
  const madridStr = utcDate.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  const madridDate = new Date(madridStr.replace(' ', 'T'));
  return madridDate.getTime() - utcDate.getTime();
}

const MONTH_NAMES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
};

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number);
  return `${MONTH_NAMES[month] || ''} ${year}`;
}

// ─── Aggregate a single month ───

async function aggregateMonth(userId: string, yyyyMM: string): Promise<MonthAggregation | null> {
  const { start, end } = getMonthRange(yyyyMM);

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

// ─── Generate a calm human observation for a stage ───

function stageObservation(flavor: StageFlavor, agg: MonthAggregation): string {
  const { intentionBalance } = agg;
  const { growth, tranquility, total } = intentionBalance;

  switch (flavor) {
    case 'calm':
      if (total > 0 && tranquility / total > 0.5)
        return 'Este fue uno de tus periodos con más calma.';
      return 'Un periodo tranquilo, con poca presión.';

    case 'growth':
      if (total > 0 && growth / total > 0.5)
        return 'Este fue uno de tus periodos más activos.';
      return 'Tu actividad fue mayor que en meses anteriores.';

    case 'intensity':
      return 'Fue un periodo con mucha actividad y varios cambios.';

    case 'dispersion':
      return 'Tus días fueron muy distintos entre sí durante este periodo.';

    case 'exhaustion':
      return 'Tu energía fue más baja durante estas semanas.';

    case 'quiet':
      return 'Hubo menos registros, por lo que este periodo ofrece menos información.';

    case 'stability':
      return 'Mantuviste un ritmo constante durante estas semanas.';

    default:
      return '';
  }
}

// ─── Detect stage transitions ───

function detectTransitions(stages: LifeStage[]): StageTransition[] {
  const transitions: StageTransition[] = [];

  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1];
    const curr = stages[i];

    if (prev.flavor === curr.flavor) continue;

    const observation = generateTransitionObservation(prev.flavor, curr.flavor);
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

function generateTransitionObservation(from: StageFlavor, to: StageFlavor): string {
  // Just changes. Not improvements or setbacks.
  const transitions: Record<string, string> = {
    'exhaustion->calm': 'Tu nivel de tranquilidad aumentó respecto al periodo anterior.',
    'exhaustion->stability': 'Encontraste un ritmo más estable que antes.',
    'intensity->calm': 'Después de un periodo intenso, la actividad se calmó.',
    'intensity->stability': 'Tu ritmo se volvió más constante después de varias semanas activas.',
    'dispersion->stability': 'Tus días se volvieron más uniformes que antes.',
    'dispersion->calm': 'La variabilidad entre días disminuyó respecto al periodo anterior.',
    'quiet->growth': 'Después de un periodo con poca actividad, tu nivel de actividad aumentó.',
    'quiet->stability': 'Tu ritmo pasó de ser irregular a más constante.',
    'calm->growth': 'Después de un periodo tranquilo, aumentó tu nivel de actividad.',
    'calm->intensity': 'Un periodo tranquilo seguido de uno con más cambios y actividad.',
    'growth->calm': 'Después de un periodo activo, la actividad disminuyó.',
    'growth->stability': 'Tu actividad se estabilizó tras un periodo de crecimiento.',
    'stability->intensity': 'Después de un ritmo constante, el nivel de actividad aumentó.',
    'stability->dispersion': 'Tus días se volvieron más irregulares que en el periodo anterior.',
    'stability->exhaustion': 'Tu nivel de energía disminuyó respecto al periodo anterior.',
    'calm->dispersion': 'Tus días se volvieron más distintos entre sí.',
    'growth->intensity': 'La alta actividad del periodo anterior trajo consigo más intensidad.',
    'intensity->exhaustion': 'Después de un periodo muy activo, tu energía bajó.',
    'exhaustion->growth': 'Tras un periodo con poca energía, la actividad volvió a subir.',
    'quiet->calm': 'Tu nivel de actividad fue mayor tras un periodo con poca información.',
  };

  const key = `${from}->${to}`;
  return transitions[key] || '';
}

// ─── Main: Detect all life stages ───

export async function detectLifeStages(userId: string, months: string[]): Promise<{
  stages: LifeStage[];
  transitions: StageTransition[];
}> {
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
      observation: stageObservation(flavor, agg),
      dataPoints: agg.totalActivity,
    });
  }

  // Detect transitions between stages
  const transitions = detectTransitions(stages);

  return { stages, transitions };
}

// ─── Generate list of past months ───

export function getPastMonths(count: number = 6): string[] {
  const months: string[] = [];
  // Use Madrid timezone to determine the current month — same source of truth
  // as the rest of the system (deterministic.ts, limits.ts, mentor-context.ts).
  // Without this, a UTC server at 23:30 Madrid time could compute the wrong month.
  const todayKey = getMadridDateKey(new Date());
  const [currentYear, currentMonth] = todayKey.split('-').map(Number);
  for (let i = 1; i <= count; i++) {
    const monthIndex = currentMonth - i;
    const year = currentYear + Math.floor((monthIndex - 1) / 12);
    const month = ((monthIndex - 1) % 12 + 12) % 12 + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return months.reverse(); // oldest first
}
