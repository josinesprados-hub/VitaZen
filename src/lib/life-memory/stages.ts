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
}

function getMonthRange(yyyyMM: string) {
  const [year, month] = yyyyMM.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
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

  const [wellness, checkins, finances, journals] = await Promise.all([
    db.wellnessLog.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { stress: true, energy: true, sleep: true, mood: true },
    }),
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { stress: true, energy: true, emotion: true },
    }),
    db.financeLog.findMany({
      where: { userId, date: { gte: start, lt: end }, mood: { not: null } },
      select: { mood: true },
    }),
    db.journalEntry.count({
      where: { userId, createdAt: { gte: start, lt: end } },
    }),
  ]);

  const totalLogs = wellness.length + checkins.length + finances.length;
  if (totalLogs === 0 && journals === 0) return null;

  // Average metrics from all available sources
  const allStress = [...wellness.map(w => w.stress), ...checkins.map(c => c.stress)];
  const allEnergy = [...wellness.map(w => w.energy), ...checkins.map(c => c.energy)];
  const allMood = [...wellness.map(w => w.mood), ...checkins.map(c => c.emotion)];
  const allSleep = wellness.map(w => w.sleep);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  // Intention balance
  const intentionBalance = { tranquility: 0, growth: 0, necessity: 0, enjoyment: 0, total: finances.length };
  for (const f of finances) {
    const m = f.mood?.toLowerCase();
    if (m === 'tranquility' || m === 'calm') intentionBalance.tranquility++;
    else if (m === 'growth' || m === 'conscious') intentionBalance.growth++;
    else if (m === 'necessity' || m === 'necessary') intentionBalance.necessity++;
    else if (m === 'enjoyment' || m === 'impulse') intentionBalance.enjoyment++;
  }

  return {
    month: yyyyMM,
    avgStress: avg(allStress),
    avgEnergy: avg(allEnergy),
    avgSleep: avg(allSleep),
    avgMood: avg(allMood),
    intentionBalance,
    totalActivity: totalLogs + journals,
    financeLogs: finances.length,
    checkins: checkins.length,
    wellnessLogs: wellness.length,
    journalEntries: journals,
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
        return 'Calma. Las decisiones desde la quietud.';
      return 'Un periodo con calma.';

    case 'growth':
      if (total > 0 && growth / total > 0.5)
        return 'Crecimiento. Cosas en movimiento.';
      return 'Movimiento.';

    case 'intensity':
      return 'Intensidad. Mucho pasó.';

    case 'dispersion':
      return 'Días muy distintos entre sí.';

    case 'exhaustion':
      return 'Agotamiento. Poco en el tanque.';

    case 'quiet':
      return 'Silencio.';

    case 'stability':
      return 'Estabilidad. Ritmo constante.';

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
    'exhaustion->calm': 'Más tranquilidad.',
    'exhaustion->stability': 'Más estabilidad.',
    'intensity->calm': 'Después de la intensidad, calma.',
    'intensity->stability': 'Ritmo más constante.',
    'dispersion->stability': 'Menos dispersión.',
    'dispersion->calm': 'Menos dispersión, más calma.',
    'quiet->growth': 'Después del silencio, movimiento.',
    'quiet->stability': 'Del silencio al ritmo.',
    'calm->growth': 'De la calma al movimiento.',
    'calm->intensity': 'Más intensidad.',
    'growth->calm': 'Más calma.',
    'growth->stability': 'El movimiento se asentó.',
    'stability->intensity': 'Más intensidad.',
    'stability->dispersion': 'Más dispersión.',
    'stability->exhaustion': 'Agotamiento.',
    'calm->dispersion': 'Más dispersión.',
    'growth->intensity': 'El movimiento trajo intensidad.',
    'intensity->exhaustion': 'La intensidad desgastó.',
    'exhaustion->growth': 'Del agotamiento, movimiento.',
    'quiet->calm': 'Del silencio a la calma.',
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
  const now = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months.reverse(); // oldest first
}
