// ═════════════════════════════════════════════════════════
// CONNECTIONS ENGINE — Single Source of Truth
// ═════════════════════════════════════════════════════════
//
// Detects statistical relationships between empires.
// No text. No causality. Only observed correlations.
//
// This is the ONLY place in VitaZen where empire connections
// are computed. Every module (Observaciones, Mentor, Memoria)
// must consume this engine — never calculate their own.
//
// DESIGN DECISIONS:
//
// 1. Only correlations with sufficient weekly data.
//    Pearson requires numeric time series aggregated by week.
//    Not all empires have continuous numeric data.
//
// 2. Possible connections with EXISTING CrossEmpireData:
//    - Riqueza ↔ Energía: finance amount ↔ wellness metrics
//    - Riqueza ↔ Mente: finance amount ↔ meditation metrics
//    - Energía ↔ Mente: wellness metrics ↔ meditation metrics
//    - Check-ins ↔ Mente: checkin metrics ↔ meditation metrics
//
// 3. NOT possible without changing data sources:
//    - Disciplina ↔ * : habitLogs only have streak + lastCompletedAt,
//      not per-week completion counts. Requires query changes.
//    - Crecimiento ↔ * : journalEntries have text + optional mood,
//      not continuous numeric metrics. Requires NLP or query changes.
//
//    These limitations are documented here. When the data sources
//    gain weekly-numeric granularity, new detectors can be added
//    to this engine without modifying consumers.
//
// 4. This engine is plan-agnostic. One engine, same output.
//    Free/Élite filtering is the consumer's responsibility.
// ═════════════════════════════════════════════════════════

import type { CrossEmpireData, EmpireConnection, EmpireConnectionSignal, ConnectionsEngineResult, ConfidenceLevel } from './types';
import { validateSignal, computeWeight, filterSemanticOverlap } from './validation';
import { getMadridWeekKey } from '@/lib/dates';

// ─── Configuration ───

const MIN_CONFIDENCE = 0.55;
const MIN_WEEKS_OVERLAP = 2;
const MIN_DATA_POINTS_PER_EMPIRE = 4;

// Showable thresholds — stricter than detection thresholds.
// A signal is "showable" if it could be presented to users.
const SHOWABLE_CONFIDENCE: Record<ConfidenceLevel, number> = {
  bajo: 0,
  medio: 0.60,
  alto: 0.75,
};

function toConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.75) return 'alto';
  if (confidence >= 0.60) return 'medio';
  return 'bajo';
}

// ─── Re-exports: weekly aggregation from detector.ts ───
// These are the same aggregation functions already used by
// the existing pattern detectors. Reusing them exactly as-is.

type WeeklyFinance = {
  weekKey: string;
  totalExpense: number;
  totalIncome: number;
  intentionDistribution: Record<string, number>;
  impulsiveRatio: number;
  socialCount: number;
  categoryCount: number;
};

type WeeklyWellness = {
  weekKey: string;
  avgSleep: number;
  avgEnergy: number;
  avgStress: number;
  avgMood: number;
};

type WeeklyMeditation = {
  weekKey: string;
  sessionCount: number;
  totalMinutes: number;
};

type WeeklyCheckin = {
  weekKey: string;
  avgEmotion: number;
  avgEnergy: number;
  avgFocus: number;
  avgStress: number;
  entryCount: number;
};

// ─── Aggregation ───

function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

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

const SOCIAL_KEYWORDS = /\b(amigos|amiga|amigo|social|cumple|fiesta|cena con|quedada|bar|copa|grupo|compañero|pareja|familia|mamá|papa|regalo)\b/i;

function aggregateFinanceWeekly(data: CrossEmpireData): Map<string, WeeklyFinance> {
  const weeks = new Map<string, WeeklyFinance>();

  for (const log of data.financeLogs) {
    const weekKey = getMadridWeekKey(parseDate(log.date));
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

    const wExt = w as unknown as Record<string, unknown>;
    if (!wExt.categories) wExt.categories = new Set<string>();
    (wExt.categories as Set<string>).add(log.category);
    w.categoryCount = (wExt.categories as Set<string>).size;
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
    const weekKey = getMadridWeekKey(parseDate(log.date));
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
    const weekKey = getMadridWeekKey(parseDate(session.completedAt));
    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, { weekKey, sessionCount: 0, totalMinutes: 0 });
    }
    const w = weeks.get(weekKey)!;
    w.sessionCount++;
    w.totalMinutes += session.duration;
  }

  return weeks;
}

function aggregateCheckinWeekly(data: CrossEmpireData): Map<string, WeeklyCheckin> {
  const weeks = new Map<string, WeeklyCheckin>();

  for (const c of data.checkins) {
    const weekKey = getMadridWeekKey(parseDate(c.date));
    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, { weekKey, avgEmotion: 0, avgEnergy: 0, avgFocus: 0, avgStress: 0, entryCount: 0, _emotion: 0, _energy: 0, _focus: 0, _stress: 0 } as any);
    }
    const w = weeks.get(weekKey) as any;
    w.entryCount++;
    w._emotion += c.emotion;
    w._energy += c.energy;
    w._focus += c.focus;
    w._stress += c.stress;
  }

  for (const w of weeks.values() as any) {
    const c = w.entryCount || 1;
    w.avgEmotion = w._emotion / c;
    w.avgEnergy = w._energy / c;
    w.avgFocus = w._focus / c;
    w.avgStress = w._stress / c;
    delete w._emotion; delete w._energy; delete w._focus; delete w._stress;
  }

  return weeks;
}

// ─── Correlation ───

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

// ─── Signal → EmpireConnectionSignal ───

interface EmpireLabels {
  'finanzas-energia': string[];
  'finanzas-mente': string[];
  'finanzas-estres': string[];
  'finanzas-sueno': string[];
  'energia-mente': string[];
  'checkin-mente': string[];
}

const EMPIRE_LABEL_MAP: EmpireLabels = {
  'finanzas-energia': ['Finanzas', 'Energía'],
  'finanzas-mente': ['Finanzas', 'Mente'],
  'finanzas-estres': ['Finanzas', 'Energía'],
  'finanzas-sueno': ['Finanzas', 'Energía'],
  'energia-mente': ['Energía', 'Mente'],
  'checkin-mente': ['Disciplina', 'Mente'],
};

function toConnectionSignal(
  id: string,
  connection: EmpireConnection,
  confidence: number,
  consistencyScore: number,
  overlapWeeks: number,
  anomaliesExcluded: number,
  direction: 'positive' | 'negative',
): EmpireConnectionSignal | null {
  const weight = computeWeight(confidence, consistencyScore, overlapWeeks);
  const confidenceLevel = toConfidenceLevel(confidence);
  const showable = confidenceLevel !== 'bajo' && consistencyScore >= 0.50;

  return {
    id,
    connection,
    empires: EMPIRE_LABEL_MAP[connection] || [],
    confidence,
    confidenceLevel,
    weeksObserved: overlapWeeks,
    consistencyScore,
    showable,
    weight,
  };
}

// ─── Existing Detectors (migrated from detector.ts) ───
// These produce the EXACT same results as before.
// Only the output format changes: PatternSignal → EmpireConnectionSignal.

function detectLowEnergyImpulsiveSpending(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>,
): EmpireConnectionSignal | null {
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
  return toConnectionSignal('low-energy-impulsive', 'finanzas-energia', confidence, validation.consistencyScore, overlapWeeks.length, validation.anomaliesExcluded, 'negative');
}

function detectMentalPracticeFinancialStability(
  financeWeeks: Map<string, WeeklyFinance>,
  meditationWeeks: Map<string, WeeklyMeditation>,
): EmpireConnectionSignal | null {
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
  return toConnectionSignal('mental-practice-stability', 'finanzas-mente', confidence, validation.consistencyScore, overlapWeeks.length, validation.anomaliesExcluded, 'positive');
}

function detectStressFinancialChange(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>,
): EmpireConnectionSignal | null {
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
  return toConnectionSignal('stress-financial-change', 'finanzas-estres', confidence, validation.consistencyScore, overlapWeeks.length, validation.anomaliesExcluded, direction);
}

function detectSleepFinanceConnection(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>,
): EmpireConnectionSignal | null {
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
  return toConnectionSignal('sleep-finance', 'finanzas-sueno', confidence, validation.consistencyScore, overlapWeeks.length, validation.anomaliesExcluded, 'negative');
}

function detectGrowthStability(
  financeWeeks: Map<string, WeeklyFinance>,
  wellnessWeeks: Map<string, WeeklyWellness>,
): EmpireConnectionSignal | null {
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
  return toConnectionSignal('growth-stability', 'finanzas-energia', confidence, validation.consistencyScore, overlapWeeks.length, validation.anomaliesExcluded, 'positive');
}

// ─── New Detectors ───
// Relationships not previously detected.

function detectEnergyMeditationConnection(
  wellnessWeeks: Map<string, WeeklyWellness>,
  meditationWeeks: Map<string, WeeklyMeditation>,
): EmpireConnectionSignal | null {
  const overlapWeeks = [...wellnessWeeks.keys()].filter(k => meditationWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const energyValues: number[] = [];
  const meditationMinutes: number[] = [];

  for (const weekKey of overlapWeeks) {
    const w = wellnessWeeks.get(weekKey)!;
    const m = meditationWeeks.get(weekKey)!;
    energyValues.push(w.avgEnergy);
    meditationMinutes.push(m.totalMinutes);
  }

  const corr = simpleCorrelation(energyValues, meditationMinutes);
  if (Math.abs(corr) <= MIN_CONFIDENCE) return null;

  const direction = corr > 0 ? 'positive' : 'negative';
  const validation = validateSignal(energyValues, meditationMinutes, corr, direction);
  if (!validation.isValid) return null;

  const confidence = Math.min(Math.abs(corr), 1);
  return toConnectionSignal('energy-meditation', 'energia-mente', confidence, validation.consistencyScore, overlapWeeks.length, validation.anomaliesExcluded, direction);
}

function detectCheckinMeditationConnection(
  checkinWeeks: Map<string, WeeklyCheckin>,
  meditationWeeks: Map<string, WeeklyMeditation>,
): EmpireConnectionSignal | null {
  const overlapWeeks = [...checkinWeeks.keys()].filter(k => meditationWeeks.has(k));
  if (overlapWeeks.length < MIN_WEEKS_OVERLAP) return null;

  const focusValues: number[] = [];
  const meditationMinutes: number[] = [];

  for (const weekKey of overlapWeeks) {
    const c = checkinWeeks.get(weekKey)!;
    const m = meditationWeeks.get(weekKey)!;
    focusValues.push(c.avgFocus);
    meditationMinutes.push(m.totalMinutes);
  }

  const corr = simpleCorrelation(focusValues, meditationMinutes);
  if (Math.abs(corr) <= MIN_CONFIDENCE) return null;

  const direction = corr > 0 ? 'positive' : 'negative';
  const validation = validateSignal(focusValues, meditationMinutes, corr, direction);
  if (!validation.isValid) return null;

  const confidence = Math.min(Math.abs(corr), 1);
  return toConnectionSignal('checkin-meditation', 'checkin-mente', confidence, validation.consistencyScore, overlapWeeks.length, validation.anomaliesExcluded, direction);
}

// ─── Semantic Overlap Groups (extended) ───

const ENGINE_SEMANTIC_GROUPS: string[][] = [
  ['finanzas-energia', 'finanzas-sueno', 'finanzas-estres'],
  ['finanzas-mente'],
  ['energia-mente'],
  ['checkin-mente'],
];

function engineFilterOverlap(signals: EmpireConnectionSignal[]): EmpireConnectionSignal[] {
  const groupMap = new Map<number, EmpireConnectionSignal>();

  for (const signal of signals) {
    const groupIdx = ENGINE_SEMANTIC_GROUPS.findIndex(g => g.includes(signal.connection));
    if (groupIdx === -1) {
      groupMap.set(-signal.connection.length, signal);
      continue;
    }

    const existing = groupMap.get(groupIdx);
    if (!existing) {
      groupMap.set(groupIdx, signal);
      continue;
    }

    const weightOrder: Record<string, number> = { ligera: 0, relevante: 1, profunda: 2 };
    const currentW = weightOrder[signal.weight] ?? 0;
    const existingW = weightOrder[existing.weight] ?? 0;

    if (currentW > existingW || (currentW === existingW && signal.confidence > existing.confidence)) {
      groupMap.set(groupIdx, signal);
    }
  }

  return Array.from(groupMap.values());
}

// ─── Main Engine ───

/**
 * Single source of truth for empire connections.
 *
 * Returns all detected connections as raw signals (no user-facing text).
 * Consumers decide what to show based on plan, context, etc.
 *
 * This function is plan-agnostic: same output for FREE and ÉLITE.
 * Free/Élite filtering is the consumer's responsibility.
 */
export function detectConnections(data: CrossEmpireData): ConnectionsEngineResult {
  const totalDataPoints =
    data.financeLogs.length +
    data.wellnessLogs.length +
    data.meditationSessions.length +
    data.habitLogs.length +
    data.checkins.length +
    data.journalEntries.length;

  if (data.financeLogs.length < MIN_DATA_POINTS_PER_EMPIRE) {
    return { connections: [], showableConnections: [], hasEnoughData: false, totalDataPoints };
  }

  const otherEmpiresHaveData =
    data.wellnessLogs.length >= 5 ||
    data.meditationSessions.length >= 5;

  if (!otherEmpiresHaveData) {
    return { connections: [], showableConnections: [], hasEnoughData: false, totalDataPoints };
  }

  // Aggregate all empires by week (using same logic as existing detector.ts)
  const financeWeeks = aggregateFinanceWeekly(data);
  const wellnessWeeks = aggregateWellnessWeekly(data);
  const meditationWeeks = aggregateMeditationWeekly(data);
  const checkinWeeks = aggregateCheckinWeekly(data);

  const signals: EmpireConnectionSignal[] = [];

  // ── Existing: Riqueza ↔ Energía (finanzas-energia, finanzas-estres, finanzas-sueno) ──
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

  // ── Existing: Riqueza ↔ Mente (finanzas-mente) ──
  if (data.meditationSessions.length >= MIN_DATA_POINTS_PER_EMPIRE) {
    const s2 = detectMentalPracticeFinancialStability(financeWeeks, meditationWeeks);
    if (s2) signals.push(s2);
  }

  // ── New: Energía ↔ Mente (energia-mente) ──
  if (data.wellnessLogs.length >= MIN_DATA_POINTS_PER_EMPIRE &&
      data.meditationSessions.length >= MIN_DATA_POINTS_PER_EMPIRE) {
    const s8 = detectEnergyMeditationConnection(wellnessWeeks, meditationWeeks);
    if (s8) signals.push(s8);
  }

  // ── New: Check-ins ↔ Mente (checkin-mente) ──
  if (data.checkins.length >= MIN_DATA_POINTS_PER_EMPIRE &&
      data.meditationSessions.length >= MIN_DATA_POINTS_PER_EMPIRE) {
    const s9 = detectCheckinMeditationConnection(checkinWeeks, meditationWeeks);
    if (s9) signals.push(s9);
  }

  // Filter semantic overlap (keep strongest per group)
  const filtered = engineFilterOverlap(signals);

  const hasEnoughData = totalDataPoints >= MIN_DATA_POINTS_PER_EMPIRE * 2;

  return {
    connections: filtered,
    showableConnections: filtered.filter(s => s.showable),
    hasEnoughData,
    totalDataPoints,
  };
}