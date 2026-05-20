// ═══════════════════════════════════════════
// Patrones de Vida — Human Confidence Validation
// ═══════════════════════════════════════════
//
// Beyond Pearson. Human-centric validation that prevents
// false positives, trivial observations, and AI-sounding
// conclusions.
//
// Now includes emotional weight calculation.
// Weight is NEVER shown to the user.
// It silently controls how long an observation persists
// and how easily it can be replaced.
//
// Philosophy:
// - If in doubt: don't show anything.
// - Silence has priority over a mediocre observation.
// - Stability over novelty.
// - An observation that stays is more trustworthy
//   than one that keeps changing.
// ═══════════════════════════════════════════

import type { ObservationWeight } from './types';

// ─── Anomaly Detection ───
// Exclude weeks where values are extreme outliers
// (>2 standard deviations from the mean).

export interface AnomalyResult {
  cleanIndices: number[];
  anomalyCount: number;
  totalCount: number;
}

export function detectAnomalies(values: number[]): AnomalyResult {
  if (values.length < 4) {
    return {
      cleanIndices: values.map((_, i) => i),
      anomalyCount: 0,
      totalCount: values.length,
    };
  }

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const stdDev = Math.sqrt(
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  );

  if (stdDev === 0) {
    return {
      cleanIndices: values.map((_, i) => i),
      anomalyCount: 0,
      totalCount: values.length,
    };
  }

  const threshold = 2 * stdDev;
  const cleanIndices: number[] = [];
  let anomalyCount = 0;

  for (let i = 0; i < values.length; i++) {
    if (Math.abs(values[i] - mean) <= threshold) {
      cleanIndices.push(i);
    } else {
      anomalyCount++;
    }
  }

  return { cleanIndices, anomalyCount, totalCount: values.length };
}

// ─── Consistency Check ───
// The relationship must be present in the majority
// of individual clean weeks.

export function computeConsistency(
  valuesA: number[],
  valuesB: number[],
  direction: 'positive' | 'negative'
): number {
  if (valuesA.length < 3) return 0;

  const meanA = valuesA.reduce((s, v) => s + v, 0) / valuesA.length;
  const meanB = valuesB.reduce((s, v) => s + v, 0) / valuesB.length;

  let consistentWeeks = 0;

  for (let i = 0; i < valuesA.length; i++) {
    const aAbove = valuesA[i] >= meanA;
    const bAbove = valuesB[i] >= meanB;

    if (direction === 'positive') {
      if (aAbove === bAbove) consistentWeeks++;
    } else {
      if (aAbove !== bAbove) consistentWeeks++;
    }
  }

  return valuesA.length > 0 ? consistentWeeks / valuesA.length : 0;
}

// ─── Emotional Weight Calculation ───
// Combines confidence + consistency + temporal depth
// into a silent internal weight.
// NEVER shown to user. Controls persistence only.

export function computeWeight(
  confidence: number,
  consistencyScore: number,
  overlapWeeks: number
): ObservationWeight {
  // profunda: high confidence, high consistency, sustained over time
  if (confidence >= 0.80 && consistencyScore >= 0.70 && overlapWeeks >= 5) {
    return 'profunda';
  }

  // relevante: solid confidence and consistency
  if (confidence >= 0.70 && consistencyScore >= 0.60) {
    return 'relevante';
  }

  // ligera: meets minimum threshold but not especially strong
  return 'ligera';
}

// ─── Semantic Overlap Groups ───

export const SEMANTIC_GROUPS: string[][] = [
  ['finanzas-energia', 'finanzas-sueno', 'finanzas-estres'],
  ['finanzas-mente'],
];

export function findSemanticGroup(connection: string): number {
  return SEMANTIC_GROUPS.findIndex((group) => group.includes(connection));
}

export function filterSemanticOverlap<T extends { connection: string; confidence: number; weight: ObservationWeight }>(
  observations: T[]
): T[] {
  const groupMap = new Map<number, T>();

  for (const obs of observations) {
    const groupIdx = findSemanticGroup(obs.connection);
    if (groupIdx === -1) {
      groupMap.set(-obs.connection.length, obs);
      continue;
    }

    const existing = groupMap.get(groupIdx);
    if (!existing) {
      groupMap.set(groupIdx, obs);
      continue;
    }

    // Replace only if new observation has equal or higher weight
    // AND higher confidence. Stability over novelty.
    const weightOrder: Record<ObservationWeight, number> = { ligera: 0, relevante: 1, profunda: 2 };
    const currentWeight = weightOrder[obs.weight];
    const existingWeight = weightOrder[existing.weight];

    if (currentWeight > existingWeight || (currentWeight === existingWeight && obs.confidence > existing.confidence)) {
      groupMap.set(groupIdx, obs);
    }
  }

  return Array.from(groupMap.values());
}

// ─── Philosophical Filter ───

const COACHING_WORDS = [
  'deberías', 'prueba', 'intenta', 'mejora', 'cambia', 'evita',
  'necesitas', 'empieza', 'plan', 'acción', 'recomendación',
  'consejo', 'sugerencia', 'ayudaría', 'podrías', 'te conviene',
  'te recomiendo', 'considera',
];

const EVALUATIVE_WORDS = [
  'mejor', 'peor', 'bien', 'mal', 'adecuado', 'inadecuado',
  'correcto', 'incorrecto', 'saludable', 'nocivo', 'excesivo',
  'insuficiente', 'demasiado', 'poco',
];

const AI_SOUNDING_PATTERNS = [
  /suele (acompañar|coincidir|ir de la mano)/i,
  /tiende a/i,
  /parece (que|como si)/i,
  /podría (ser|indicar)/i,
  /esto sugiere/i,
  /es notable que/i,
  /es interesante que/i,
  /de forma sutil/i,
  /se conectan de forma/i,
];

const OBVIOUS_PATTERNS = [
  /gastas más cuando/i,
  /gastas menos cuando/i,
  /los fines de semana/i,
  /cuando sales/i,
  /cuando tienes más dinero/i,
];

export function passesPhilosophicalFilter(text: string): {
  passes: boolean;
  reason?: string;
} {
  const lowerText = text.toLowerCase();

  for (const word of COACHING_WORDS) {
    if (lowerText.includes(word)) {
      return { passes: false, reason: `coaching: "${word}"` };
    }
  }

  for (const word of EVALUATIVE_WORDS) {
    if (lowerText.includes(word)) {
      return { passes: false, reason: `evaluative: "${word}"` };
    }
  }

  for (const pattern of AI_SOUNDING_PATTERNS) {
    if (pattern.test(text)) {
      return { passes: false, reason: `AI-sounding: ${pattern.source}` };
    }
  }

  for (const pattern of OBVIOUS_PATTERNS) {
    if (pattern.test(text)) {
      return { passes: false, reason: `obvious: ${pattern.source}` };
    }
  }

  return { passes: true };
}

// ─── Full Signal Validation ───

export interface SignalValidation {
  isValid: boolean;
  consistencyScore: number;
  anomaliesExcluded: number;
  reason?: string;
}

export function validateSignal(
  valuesA: number[],
  valuesB: number[],
  correlation: number,
  direction: 'positive' | 'negative',
  minConsistentWeeks: number = 3
): SignalValidation {
  const anomalyA = detectAnomalies(valuesA);
  const anomalyB = detectAnomalies(valuesB);

  const cleanSetA = new Set(anomalyA.cleanIndices);
  const cleanSetB = new Set(anomalyB.cleanIndices);
  const cleanIndices = anomalyA.cleanIndices.filter((i) => cleanSetB.has(i));

  if (cleanIndices.length < minConsistentWeeks) {
    return {
      isValid: false,
      consistencyScore: 0,
      anomaliesExcluded: anomalyA.anomalyCount + anomalyB.anomalyCount,
      reason: 'not enough clean weeks after anomaly exclusion',
    };
  }

  const cleanA = cleanIndices.map((i) => valuesA[i]);
  const cleanB = cleanIndices.map((i) => valuesB[i]);
  const consistencyScore = computeConsistency(cleanA, cleanB, direction);

  if (consistencyScore < 0.55) {
    return {
      isValid: false,
      consistencyScore,
      anomaliesExcluded: anomalyA.anomalyCount + anomalyB.anomalyCount,
      reason: `consistency too low: ${(consistencyScore * 100).toFixed(0)}%`,
    };
  }

  const totalAnomalies = anomalyA.anomalyCount + anomalyB.anomalyCount;
  const totalData = anomalyA.totalCount + anomalyB.totalCount;
  if (totalData > 0 && totalAnomalies / totalData > 0.3) {
    return {
      isValid: false,
      consistencyScore,
      anomaliesExcluded: totalAnomalies,
      reason: 'too many anomalous weeks — data is unstable',
    };
  }

  return {
    isValid: true,
    consistencyScore,
    anomaliesExcluded: totalAnomalies,
  };
}
