// ═══════════════════════════════════════════
// Patrones de Vida — Pattern Detector
// ═══════════════════════════════════════════
//
// Pure logic. No AI. No external APIs. No randomness.
// Only sober, intelligent pattern detection from real data.
//
// Refined principles:
// - If not enough data → return nothing. Never invent.
// - Minimum 3 weeks of overlap (raised from 2)
// - Minimum confidence 0.65 (raised from 0.55)
// - No backdoors (removed 0.35 + 4-week shortcut)
// - Anomaly weeks excluded before correlation
// - Consistency check: pattern must hold in 55%+ of clean weeks
// - Semantic overlap: related connections reduced to strongest
// - Philosophical filter: every observation text passes before showing
// - Max 2 observations (reduced from 3)
// - Removed: finanzas-habitos (can't validate weekly)
// - Removed: finanzas-social (trivially obvious)
//
// "Si hay duda: NO mostrar nada."
// ═══════════════════════════════════════════

import type {
  CrossEmpireData,
  LifeObservation,
  PatternDetectionResult,
  PatternSignal,
  EmpireConnection,
} from './types';
import { getObservationText } from './copy';
import {
  validateSignal,
  filterSemanticOverlap,
  passesPhilosophicalFilter,
} from './validation';

// ─── Configuration ───
// Raised thresholds. No shortcuts.

const MIN_CONFIDENCE = 0.65; // Was 0.55 — too many false positives
const MIN_WEEKS_OVERLAP = 3; // Was 2 — need more temporal evidence
const MIN_DATA_POINTS_PER_EMPIRE = 5;
const MAX_OBSERVATIONS = 2; // Was 3 — less is more

// ─── Intention Resolution ───
// Same as Finanzas page — keep in sync

const LEGACY_MOOD_MAP: Record<string, string> = {
  calm: 'tranquility',
  conscious: 'growth',
  necessary: 'necessity',
  impulse: 'enjoyment',
};

function resolveIntention(mood: string | null): string | null {
  if (!mood) return null;
  return LEGACY_MOOD_MAP[mood] || mood;
}

// ─── Context Detection ───

const SOCIAL_KEYWORDS = /\b(amigos|amiga|amigo|social|cumple|fiesta|cena con|quedada|bar|copa|grupo|compañero|pareja|familia|mamá|papa|regalo)\b/i;

// ─── Week Helpers ───

interface WeekBucket {
  weekKey: string; // YYYY-WNN
  startDate: Date;
  endDate: Date;
}

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return `${d.getFullYear()}-W${1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)}`;
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

// ─── Weekly Aggregation ───

interface WeeklyFinance {
  weekKey: string;
  totalExpense: number;
  totalIncome: number;
  intentionDistribution: Record<string, number>; // intention → amount
  impulsiveRatio: number; // enjoyment amount / total expense (0-1)
  socialCount: number;
  categoryCount: number;
}

interface WeeklyWellness {
  weekKey: string;
  avgSleep: number;
  avgEnergy: number;
  avgStress: number;
  avgMood: number;
}

interface WeeklyMeditation {
  weekKey: string;
  sessionCount: number;
  totalMinutes: number;
}

function aggregateFinanceWeekly(data: CrossEmpireData): Map<string, WeeklyFinance> {
  const weeks = new Map<string, WeeklyFinance>();

  for (const log of data.financeLogs) {
    const weekKey = getWeekKey(parseDate(log.date));
    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, {
        weekKey,
        totalExpense: 0,
        totalIncome: 0,
        intentionDistribution: {},
        impulsiveRatio: 0,
        socialCount: 0,
        categoryCount: 0,
      });
    }

    const w = weeks.get(weekKey)!;
    const categories = new Set<string>();

    if (log.type === 'expense') {
      w.totalExpense += log.amount;
      const intention = resolveIntention(log.mood);
      if (intention) {
        w.intentionDistribution[intention] = (w.intentionDistribution[intention] || 0) + log.amount;
      }
    } else {
      w.totalIncome += log.amount;
    }

    if (log.contexto) {
      if (SOCIAL_KEYWORDS.test(log.contexto)) w.socialCount++;
    }

    categories.add(log.category);
    w.categoryCount = categories.size;
  }

  // Compute impulsive ratio
  for (const w of weeks.values()) {
    const enjoymentAmount = w.intentionDistribution['enjoyment'] || 0;
    w.impulsiveRatio = w.totalExpense > 0 ? enjoymentAmount / w.totalExpense : 0;
  }

  return weeks;
}

function aggregateWellnessWeekly(data: CrossEmpireData): Map<string, WeeklyWellness> {
  const weeks = new Map<string, WeeklyWellness>();

  for (const log of data.wellnessLogs) {
    const weekKey = getWeekKey(parseDate(log.date));
    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, { weekKey, avgSleep: 0, avgEnergy: 0, avgStress: 0, avgMood: 0, _count: 0, _sleep: 0, _energy: 0, _stress: 0, _mood: 0 } as any);
    }
    const w = weeks.get(weekKey) as any;
    w._count = (w._count || 0) + 1;
    w._sleep = (w._sleep || 0) + log.sleep;
    w._energy = (w._energy || 0) + log.energy;
    w._stress = (w._stress || 0) + log.stress;
    w._mood = (w._mood || 0) + log.mood;
  }

  for (const w of weeks.values() as any) {
    const c = w._count || 1;
    w.avgSleep = (w._sleep || 0) / c;
    w.avgEnergy = (w._energy || 0) / c;
    w.avgStress = (w._stress || 0) / c;
    w.avgMood = (w._mood || 0) / c;
    delete w._count; delete w._sleep; delete w._energy; delete w._stress; delete w._mood;
  }

  return weeks;
}

function aggregateMeditationWeekly(data: CrossEmpireData): Map<string, WeeklyMeditation> {
  const weeks = new Map<string, WeeklyMeditation>();

  for (const session of data.meditationSessions) {
    const weekKey = getWeekKey(parseDate(session.completedAt));
    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, { weekKey, sessionCount: 0, totalMinutes: 0 });
    }
    const w = weeks.get(weekKey)!;
    w.sessionCount++;
    w.totalMinutes += session.duration;
  }

  return weeks;
}

// ─── Correlation Helper ───
// Pearson correlation coefficient

function simpleCorrelation(valuesA: number[], valuesB: number[]): number {
  if (valuesA.length < 3 || valuesB.length < 3) return 0;
  const n = Math.min(valuesA.length, valuesB.length);
  const a = valuesA.slice(0, n);
  const b = valuesB.slice(0, n);

  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  if (den === 0) return 0;
  return num / den;
}

// ─── Pattern Detectors ───
// Each returns a PatternSignal if the pattern is detected, null otherwise.
// Now includes validation: anomaly exclusion + consistency check.

function detectLowEnergyImpulsiveSpending(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>
): PatternSignal | null {
  // Find overlapping weeks
  const overlapWeeks = [...financeWeeks.keys()].filter(k => wellnessWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const sleepValues: number[] = [];
  const impulsiveValues: number[] = [];

  for (const weekKey of overlapWeeks) {
    const w = wellnessWeeks.get(weekKey)!;
    const f = financeWeeks.get(weekKey)!;
    sleepValues.push(w.avgSleep);
    impulsiveValues.push(f.impulsiveRatio);
  }

  // Negative correlation: low sleep → high impulsive
  const corr = simpleCorrelation(sleepValues, impulsiveValues);

  // Strict threshold — no backdoors
  if (corr >= -MIN_CONFIDENCE) return null;

  // Validate: anomaly exclusion + consistency
  const validation = validateSignal(sleepValues, impulsiveValues, corr, 'negative');
  if (!validation.isValid) return null;

  return {
    id: 'low-energy-impulsive',
    connection: 'finanzas-energia',
    confidence: Math.min(Math.abs(corr), 1),
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
  };
}

function detectMentalPracticeFinancialStability(
  financeWeeks: Map<string, WeeklyFinance>,
  meditationWeeks: Map<string, WeeklyMeditation>
): PatternSignal | null {
  const overlapWeeks = [...financeWeeks.keys()].filter(k => meditationWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const sessionCounts: number[] = [];
  const balanceStability: number[] = [];

  for (const weekKey of overlapWeeks) {
    const m = meditationWeeks.get(weekKey)!;
    const f = financeWeeks.get(weekKey)!;
    sessionCounts.push(m.sessionCount);
    // Stability = less impulsive ratio (inverse)
    balanceStability.push(1 - f.impulsiveRatio);
  }

  const corr = simpleCorrelation(sessionCounts, balanceStability);

  // Strict threshold
  if (corr <= MIN_CONFIDENCE) return null;

  // Validate
  const validation = validateSignal(sessionCounts, balanceStability, corr, 'positive');
  if (!validation.isValid) return null;

  return {
    id: 'mental-practice-stability',
    connection: 'finanzas-mente',
    confidence: Math.min(Math.abs(corr), 1),
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
  };
}

function detectStressFinancialChange(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>
): PatternSignal | null {
  const overlapWeeks = [...financeWeeks.keys()].filter(k => wellnessWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const stressValues: number[] = [];
  const expenseValues: number[] = [];

  for (const weekKey of overlapWeeks) {
    const w = wellnessWeeks.get(weekKey)!;
    const f = financeWeeks.get(weekKey)!;
    stressValues.push(w.avgStress);
    expenseValues.push(f.totalExpense);
  }

  const corr = simpleCorrelation(stressValues, expenseValues);

  // Strict threshold — accept both positive and negative correlation
  if (Math.abs(corr) <= MIN_CONFIDENCE) return null;

  // Validate
  const direction = corr > 0 ? 'positive' : 'negative';
  const validation = validateSignal(stressValues, expenseValues, corr, direction);
  if (!validation.isValid) return null;

  return {
    id: 'stress-financial-change',
    connection: 'finanzas-estres',
    confidence: Math.min(Math.abs(corr), 1),
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
  };
}

function detectSleepFinanceConnection(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>
): PatternSignal | null {
  const overlapWeeks = [...financeWeeks.keys()].filter(k => wellnessWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const sleepValues: number[] = [];
  const totalExpenseValues: number[] = [];

  for (const weekKey of overlapWeeks) {
    const w = wellnessWeeks.get(weekKey)!;
    const f = financeWeeks.get(weekKey)!;
    sleepValues.push(w.avgSleep);
    totalExpenseValues.push(f.totalExpense);
  }

  const corr = simpleCorrelation(sleepValues, totalExpenseValues);

  // Strict threshold — negative correlation: low sleep → high spending
  if (corr >= -MIN_CONFIDENCE) return null;

  // Validate
  const validation = validateSignal(sleepValues, totalExpenseValues, corr, 'negative');
  if (!validation.isValid) return null;

  return {
    id: 'sleep-finance',
    connection: 'finanzas-sueno',
    confidence: Math.min(Math.abs(corr), 1),
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
  };
}

function detectGrowthStability(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>
): PatternSignal | null {
  const overlapWeeks = [...financeWeeks.keys()].filter(k => wellnessWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const growthValues: number[] = [];
  const calmValues: number[] = [];

  for (const weekKey of overlapWeeks) {
    const f = financeWeeks.get(weekKey)!;
    const w = wellnessWeeks.get(weekKey)!;
    growthValues.push(f.intentionDistribution['growth'] || 0);
    calmValues.push(5 - w.avgStress); // Invert stress → calm
  }

  const corr = simpleCorrelation(growthValues, calmValues);

  // Strict threshold
  if (corr <= MIN_CONFIDENCE) return null;

  // Validate
  const validation = validateSignal(growthValues, calmValues, corr, 'positive');
  if (!validation.isValid) return null;

  return {
    id: 'growth-stability',
    connection: 'finanzas-energia',
    confidence: Math.min(Math.abs(corr), 1),
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
  };
}

// ─── Main Detection Function ───

export function detectPatterns(data: CrossEmpireData): PatternDetectionResult {
  // Count total data points
  const totalDataPoints =
    data.financeLogs.length +
    data.wellnessLogs.length +
    data.meditationSessions.length +
    data.habitLogs.length +
    data.checkins.length +
    data.journalEntries.length;

  // Need absolute minimum to even try
  if (data.financeLogs.length < MIN_DATA_POINTS_PER_EMPIRE) {
    return {
      observations: [],
      hasEnoughData: false,
      totalDataPoints,
    };
  }

  // Need at least one other empire with sufficient data
  const otherEmpiresHaveData =
    data.wellnessLogs.length >= 5 ||
    data.meditationSessions.length >= 5;

  if (!otherEmpiresHaveData) {
    return {
      observations: [],
      hasEnoughData: false,
      totalDataPoints,
    };
  }

  // Aggregate weekly data
  const financeWeeks = aggregateFinanceWeekly(data);
  const wellnessWeeks = aggregateWellnessWeekly(data);
  const meditationWeeks = aggregateMeditationWeekly(data);

  // Run detectors — only with sufficient data
  const signals: PatternSignal[] = [];

  if (data.wellnessLogs.length >= MIN_DATA_POINTS_PER_EMPIRE) {
    const s1 = detectLowEnergyImpulsiveSpending(financeWeeks, wellnessWeeks);
    if (s1) signals.push(s1);

    const s4 = detectStressFinancialChange(financeWeeks, wellnessWeeks);
    if (s4) signals.push(s4);

    const s5 = detectSleepFinanceConnection(financeWeeks, wellnessWeeks);
    if (s5) signals.push(s5);

    const s7 = detectGrowthStability(financeWeeks, wellnessWeeks);
    if (s7) signals.push(s7);
  }

  if (data.meditationSessions.length >= 5) {
    const s2 = detectMentalPracticeFinancialStability(financeWeeks, meditationWeeks);
    if (s2) signals.push(s2);
  }

  // ── Semantic overlap filter ──
  // If multiple connections point to the same theme,
  // keep only the strongest one from each group.
  const filteredSignals = filterSemanticOverlap(signals);

  // ── Convert signals to observations ──
  const observations: LifeObservation[] = [];

  for (let i = 0; i < filteredSignals.length; i++) {
    const signal = filteredSignals[i];

    // Get the observation text
    const text = getObservationText(signal.connection, i);

    // ── Philosophical filter ──
    // Every observation text must pass before being shown
    const filterResult = passesPhilosophicalFilter(text);
    if (!filterResult.passes) {
      // Log internally for debugging — never show to user
      console.log(
        `[Patrones] Observation filtered: "${text}" — reason: ${filterResult.reason}`
      );
      continue;
    }

    observations.push({
      id: signal.id,
      connection: signal.connection,
      text,
      empires: getEmpireLabels(signal.connection),
      confidence: signal.confidence,
    });
  }

  // Sort by confidence (highest first)
  observations.sort((a, b) => b.confidence - a.confidence);

  // Limit to MAX_OBSERVATIONS — silence is part of design
  const finalObservations = observations.slice(0, MAX_OBSERVATIONS);

  return {
    observations: finalObservations,
    hasEnoughData: totalDataPoints >= MIN_DATA_POINTS_PER_EMPIRE * 2,
    totalDataPoints,
  };
}

// ─── Helper: Get empire labels from connection ───

function getEmpireLabels(connection: EmpireConnection): string[] {
  const map: Record<EmpireConnection, string[]> = {
    'finanzas-energia': ['Finanzas', 'Energía'],
    'finanzas-mente': ['Finanzas', 'Mente'],
    'finanzas-estres': ['Finanzas', 'Energía'],
    'finanzas-sueno': ['Finanzas', 'Energía'],
  };
  return map[connection] || [];
}
