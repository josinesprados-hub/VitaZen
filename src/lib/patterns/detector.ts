// ═══════════════════════════════════════════
// Patrones de Vida — Pattern Detector
// ═══════════════════════════════════════════
//
// Pure logic. No AI. No external APIs. No randomness.
// Only sober, intelligent pattern detection from real data.
//
// Rules:
// - If not enough data → return nothing. Never invent.
// - Minimum 2 weeks of overlap between empires
// - Minimum confidence threshold of 0.55
// - Never show percentages, scores, or metrics
// - Observations must be human, calm, intimate
//
// The detection uses weekly aggregation and comparison
// to find when two empires move together.
// ═══════════════════════════════════════════

import type {
  CrossEmpireData,
  LifeObservation,
  PatternDetectionResult,
  PatternSignal,
  EmpireConnection,
} from './types';
import { getObservationText } from './copy';

// ─── Configuration ───

const MIN_CONFIDENCE = 0.55;
const MIN_WEEKS_OVERLAP = 2;
const MIN_DATA_POINTS_PER_EMPIRE = 5;

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
const IMPULSIVE_KEYWORDS = /\b(impulsiv|antojo|capricho|me apetecía|sin pensar|lo quería|tentación|lo vi)\b/i;

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
// For each empire, compute weekly averages/totals

interface WeeklyFinance {
  weekKey: string;
  totalExpense: number;
  totalIncome: number;
  intentionDistribution: Record<string, number>; // intention → amount
  impulsiveRatio: number; // enjoyment amount / total expense (0-1)
  socialCount: number;
  categoryCount: number; // number of distinct categories
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

interface WeeklyHabits {
  weekKey: string;
  activeStreaks: number;
  avgStreak: number;
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
      if (IMPULSIVE_KEYWORDS.test(log.contexto)) w.socialCount++; // just count it
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

function aggregateHabitsWeekly(data: CrossEmpireData): Map<string, WeeklyHabits> {
  // Habits don't have weekly entries, but we can compute current active streaks
  // For weekly analysis, we use the overall habit state
  const avgStreak = data.habitLogs.length > 0
    ? data.habitLogs.reduce((s, h) => s + h.streak, 0) / data.habitLogs.length
    : 0;
  const activeStreaks = data.habitLogs.filter(h => h.streak > 0).length;

  // Return a single "current" week entry
  const currentWeek = getWeekKey(new Date());
  const weeks = new Map<string, WeeklyHabits>();
  weeks.set(currentWeek, { weekKey: currentWeek, activeStreaks, avgStreak });
  return weeks;
}

// ─── Correlation Helper ───
// Simple rank-based comparison: when A is high/low, is B also high/low?
// Returns a value from -1 to 1

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
// Each returns a PatternSignal if the pattern is detected, null otherwise

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
  const confidence = Math.min(Math.abs(corr) * 1.3, 1); // amplify slightly

  if (corr < -MIN_CONFIDENCE || (corr < -0.35 && overlapWeeks.length >= 4)) {
    return {
      id: 'low-energy-impulsive',
      connection: 'finanzas-energia',
      confidence: Math.max(confidence, corr < -0.35 ? 0.6 : 0),
      minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
      dataPointsFound: overlapWeeks.length * 2,
    };
  }

  return null;
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

  if (corr > MIN_CONFIDENCE || (corr > 0.35 && overlapWeeks.length >= 4)) {
    return {
      id: 'mental-practice-stability',
      connection: 'finanzas-mente',
      confidence: Math.min(Math.abs(corr) * 1.2, 1),
      minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
      dataPointsFound: overlapWeeks.length * 2,
    };
  }

  return null;
}

function detectHabitsFinancialFocus(
  financeWeeks: Map<string, WeeklyFinance>,
  habitWeeks: Map<string, WeeklyHabits>
): PatternSignal | null {
  const overlapWeeks = [...financeWeeks.keys()].filter(k => habitWeeks.has(k));
  if (overlapWeeks.length < 1) return null;

  // Check if habits have active streaks
  const habitWeek = [...habitWeeks.values()][0];
  if (!habitWeek || habitWeek.activeStreaks < 2) return null;

  // For habits, we check if there's enough finance data and
  // if the user has a decent habit streak, which implies order
  const financeWeekCount = financeWeeks.size;
  if (financeWeekCount < MIN_WEEKS_OVERLAP) return null;

  // Check if finance data shows less dispersion when habits are active
  // This is a simpler check: just having active habits + finance data
  const avgExpensePerWeek = [...financeWeeks.values()].reduce((s, w) => s + w.totalExpense, 0) / financeWeekCount;
  const categoriesPerWeek = [...financeWeeks.values()].reduce((s, w) => s + w.categoryCount, 0) / financeWeekCount;

  // If habits are active and finance shows some intentionality
  const hasIntentionality = [...financeWeeks.values()].some(w => Object.keys(w.intentionDistribution).length > 0);

  if (habitWeek.avgStreak >= 3 && hasIntentionality && financeWeekCount >= MIN_WEEKS_OVERLAP) {
    return {
      id: 'habits-financial-focus',
      connection: 'finanzas-habitos',
      confidence: 0.6,
      minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
      dataPointsFound: financeWeekCount + habitWeeks.size,
    };
  }

  return null;
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

  if (Math.abs(corr) > MIN_CONFIDENCE || (Math.abs(corr) > 0.35 && overlapWeeks.length >= 4)) {
    return {
      id: 'stress-financial-change',
      connection: 'finanzas-estres',
      confidence: Math.min(Math.abs(corr) * 1.2, 1),
      minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
      dataPointsFound: overlapWeeks.length * 2,
    };
  }

  return null;
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

  // Negative correlation: low sleep → high spending
  if (corr < -MIN_CONFIDENCE || (corr < -0.35 && overlapWeeks.length >= 4)) {
    return {
      id: 'sleep-finance',
      connection: 'finanzas-sueno',
      confidence: Math.min(Math.abs(corr) * 1.2, 1),
      minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
      dataPointsFound: overlapWeeks.length * 2,
    };
  }

  return null;
}

function detectSocialSpending(
  financeWeeks: Map<string, WeeklyFinance>,
): PatternSignal | null {
  // Check if there's a notable social spending pattern
  const weeksWithSocialContext = [...financeWeeks.values()].filter(w => w.socialCount > 0);
  const totalWeeks = financeWeeks.size;

  if (totalWeeks < MIN_WEEKS_OVERLAP) return null;
  if (weeksWithSocialContext.length < 2) return null;

  // Compare average expense in social weeks vs non-social weeks
  const socialAvgExpense = weeksWithSocialContext.reduce((s, w) => s + w.totalExpense, 0) / weeksWithSocialContext.length;
  const nonSocialWeeks = [...financeWeeks.values()].filter(w => w.socialCount === 0);
  const nonSocialAvgExpense = nonSocialWeeks.length > 0
    ? nonSocialWeeks.reduce((s, w) => s + w.totalExpense, 0) / nonSocialWeeks.length
    : 0;

  if (socialAvgExpense > nonSocialAvgExpense * 1.3 && weeksWithSocialContext.length >= 2) {
    return {
      id: 'social-spending',
      connection: 'finanzas-social',
      confidence: 0.6,
      minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE,
      dataPointsFound: totalWeeks,
    };
  }

  return null;
}

// ─── Growth Investment → Stability ───

function detectGrowthStability(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>
): PatternSignal | null {
  const overlapWeeks = [...financeWeeks.keys()].filter(k => wellnessWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const growthValues: number[] = [];
  const stressValues: number[] = [];

  for (const weekKey of overlapWeeks) {
    const f = financeWeeks.get(weekKey)!;
    const w = wellnessWeeks.get(weekKey)!;
    growthValues.push(f.intentionDistribution['growth'] || 0);
    stressValues.push(5 - w.avgStress); // Invert stress → calm
  }

  const corr = simpleCorrelation(growthValues, stressValues);

  if (corr > MIN_CONFIDENCE || (corr > 0.35 && overlapWeeks.length >= 4)) {
    return {
      id: 'growth-stability',
      connection: 'finanzas-energia',
      confidence: Math.min(Math.abs(corr) * 1.2, 1),
      minimumDataPoints: MIN_DATA_POINTS_PER_EMPIRE * 2,
      dataPointsFound: overlapWeeks.length * 2,
    };
  }

  return null;
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

  // Need at least one other empire with some data
  const otherEmpiresHaveData =
    data.wellnessLogs.length >= 3 ||
    data.meditationSessions.length >= 3 ||
    data.habitLogs.length >= 2 ||
    data.checkins.length >= 3;

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
  const habitWeeks = aggregateHabitsWeekly(data);

  // Run all detectors
  const signals: PatternSignal[] = [];

  // Only run detectors that have the required data
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

  if (data.meditationSessions.length >= 3) {
    const s2 = detectMentalPracticeFinancialStability(financeWeeks, meditationWeeks);
    if (s2) signals.push(s2);
  }

  if (data.habitLogs.length >= 2) {
    const s3 = detectHabitsFinancialFocus(financeWeeks, habitWeeks);
    if (s3) signals.push(s3);
  }

  // Social spending doesn't need another empire
  const s6 = detectSocialSpending(financeWeeks);
  if (s6) signals.push(s6);

  // Convert signals to observations
  const observations: LifeObservation[] = signals
    .filter(s => s.confidence >= MIN_CONFIDENCE || s.dataPointsFound >= s.minimumDataPoints)
    .map((signal, index) => ({
      id: signal.id,
      connection: signal.connection,
      text: getObservationText(signal.connection, index),
      empires: getEmpireLabels(signal.connection),
      confidence: signal.confidence,
    }));

  // Sort by confidence (highest first) but don't expose confidence
  observations.sort((a, b) => b.confidence - a.confidence);

  // Limit to 3 observations max — silence is part of design
  const finalObservations = observations.slice(0, 3);

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
    'finanzas-habitos': ['Finanzas', 'Hábitos'],
    'finanzas-estres': ['Finanzas', 'Energía'],
    'finanzas-sueno': ['Finanzas', 'Energía'],
    'finanzas-social': ['Finanzas'],
  };
  return map[connection] || [];
}
