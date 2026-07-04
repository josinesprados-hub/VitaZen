// ═══════════════════════════════════════════
// Patrones de Vida — Pattern Detector
// ═══════════════════════════════════════════
//
// Pure logic. No AI. No external APIs. No randomness.
//
// Emotional weight system:
// - ligera:   appears briefly, replaced easily
// - relevante: stays 2 weeks, replaced only by igual or stronger
// - profunda:  stays 4 weeks, replaced only by another profunda
//
// Stability over novelty.
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
  computeWeight,
} from './validation';
import { getMadridDateKey } from '@/lib/deterministic';

// ─── Configuration ───

const MIN_CONFIDENCE = 0.55;
const MIN_WEEKS_OVERLAP = 2;
const MIN_DATA_POINTS_PER_EMPIRE = 4;
const MAX_OBSERVATIONS = 2;

// ─── Intention Resolution ───

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

function getWeekKey(date: Date): string {
  // Normalize to Madrid date first, then compute ISO week from that date.
  // This ensures the week boundary matches the user's perceived day,
  // not UTC midnight — same source of truth as Dashboard, Momentum, etc.
  const madridDateStr = getMadridDateKey(date); // "YYYY-MM-DD"
  const d = new Date(madridDateStr + 'T12:00:00Z'); // noon UTC avoids any day-boundary issue
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
  intentionDistribution: Record<string, number>;
  impulsiveRatio: number;
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

function detectLowEnergyImpulsiveSpending(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>
): PatternSignal | null {
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

  const corr = simpleCorrelation(sleepValues, impulsiveValues);
  if (corr >= -MIN_CONFIDENCE) return null;

  const validation = validateSignal(sleepValues, impulsiveValues, corr, 'negative');
  if (!validation.isValid) return null;

  const confidence = Math.min(Math.abs(corr), 1);
  const weight = computeWeight(confidence, validation.consistencyScore, overlapWeeks.length);

  return {
    id: 'low-energy-impulsive',
    connection: 'finanzas-energia',
    confidence,
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
    weight,
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
    balanceStability.push(1 - f.impulsiveRatio);
  }

  const corr = simpleCorrelation(sessionCounts, balanceStability);
  if (corr <= MIN_CONFIDENCE) return null;

  const validation = validateSignal(sessionCounts, balanceStability, corr, 'positive');
  if (!validation.isValid) return null;

  const confidence = Math.min(Math.abs(corr), 1);
  const weight = computeWeight(confidence, validation.consistencyScore, overlapWeeks.length);

  return {
    id: 'mental-practice-stability',
    connection: 'finanzas-mente',
    confidence,
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
    weight,
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
  if (Math.abs(corr) <= MIN_CONFIDENCE) return null;

  const direction = corr > 0 ? 'positive' : 'negative';
  const validation = validateSignal(stressValues, expenseValues, corr, direction);
  if (!validation.isValid) return null;

  const confidence = Math.min(Math.abs(corr), 1);
  const weight = computeWeight(confidence, validation.consistencyScore, overlapWeeks.length);

  return {
    id: 'stress-financial-change',
    connection: 'finanzas-estres',
    confidence,
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
    weight,
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
  if (corr >= -MIN_CONFIDENCE) return null;

  const validation = validateSignal(sleepValues, totalExpenseValues, corr, 'negative');
  if (!validation.isValid) return null;

  const confidence = Math.min(Math.abs(corr), 1);
  const weight = computeWeight(confidence, validation.consistencyScore, overlapWeeks.length);

  return {
    id: 'sleep-finance',
    connection: 'finanzas-sueno',
    confidence,
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
    weight,
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
    calmValues.push(5 - w.avgStress);
  }

  const corr = simpleCorrelation(growthValues, calmValues);
  if (corr <= MIN_CONFIDENCE) return null;

  const validation = validateSignal(growthValues, calmValues, corr, 'positive');
  if (!validation.isValid) return null;

  const confidence = Math.min(Math.abs(corr), 1);
  const weight = computeWeight(confidence, validation.consistencyScore, overlapWeeks.length);

  return {
    id: 'growth-stability',
    connection: 'finanzas-energia',
    confidence,
    minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
    dataPointsFound: overlapWeeks.length * 2,
    consistencyScore: validation.consistencyScore,
    anomaliesExcluded: validation.anomaliesExcluded,
    weight,
  };
}

// ─── Main Detection Function ───

export function detectPatterns(data: CrossEmpireData): PatternDetectionResult {
  const totalDataPoints =
    data.financeLogs.length +
    data.wellnessLogs.length +
    data.meditationSessions.length +
    data.habitLogs.length +
    data.checkins.length +
    data.journalEntries.length;

  if (data.financeLogs.length < MIN_DATA_POINTS_PER_EMPIRE) {
    return { observations: [], hasEnoughData: false, totalDataPoints };
  }

  const otherEmpiresHaveData =
    data.wellnessLogs.length >= 5 ||
    data.meditationSessions.length >= 5;

  if (!otherEmpiresHaveData) {
    return { observations: [], hasEnoughData: false, totalDataPoints };
  }

  const financeWeeks = aggregateFinanceWeekly(data);
  const wellnessWeeks = aggregateWellnessWeekly(data);
  const meditationWeeks = aggregateMeditationWeekly(data);

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

  if (data.meditationSessions.length >= MIN_DATA_POINTS_PER_EMPIRE) {
    const s2 = detectMentalPracticeFinancialStability(financeWeeks, meditationWeeks);
    if (s2) signals.push(s2);
  }

  // ── Semantic overlap: keep strongest from each group ──
  // Stability: only replace if new is equal or stronger weight
  const filteredSignals = filterSemanticOverlap(signals);

  // ── Convert signals to observations ──
  const observations: LifeObservation[] = [];

  for (let i = 0; i < filteredSignals.length; i++) {
    const signal = filteredSignals[i];
    const text = getObservationText(signal.connection, i);

    const filterResult = passesPhilosophicalFilter(text);
    if (!filterResult.passes) {
      console.log(`[Patrones] Filtered: "${text}" — ${filterResult.reason}`);
      continue;
    }

    observations.push({
      id: signal.id,
      connection: signal.connection,
      text,
      empires: getEmpireLabels(signal.connection),
      confidence: signal.confidence,
      weight: signal.weight,
    });
  }

  // Sort: profunda first, then relevante, then ligera
  // Within same weight: higher confidence first
  const weightOrder = { profunda: 2, relevante: 1, ligera: 0 };
  observations.sort((a, b) => {
    const wDiff = weightOrder[b.weight] - weightOrder[a.weight];
    if (wDiff !== 0) return wDiff;
    return b.confidence - a.confidence;
  });

  const finalObservations = observations.slice(0, MAX_OBSERVATIONS);

  return {
    observations: finalObservations,
    hasEnoughData: totalDataPoints >= MIN_DATA_POINTS_PER_EMPIRE * 2,
    totalDataPoints,
  };
}

// ─── Helper ───

function getEmpireLabels(connection: EmpireConnection): string[] {
  const map: Record<EmpireConnection, string[]> = {
    'finanzas-energia': ['Finanzas', 'Energía'],
    'finanzas-mente': ['Finanzas', 'Mente'],
    'finanzas-estres': ['Finanzas', 'Energía'],
    'finanzas-sueno': ['Finanzas', 'Energía'],
  };
  return map[connection] || [];
}
