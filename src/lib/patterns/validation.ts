// ═══════════════════════════════════════════
// Patrones de Vida — Human Confidence Validation
// ═══════════════════════════════════════════
//
// Beyond Pearson. Human-centric validation that prevents
// false positives, trivial observations, and AI-sounding
// conclusions.
//
// Philosophy:
// - If in doubt: don't show anything.
// - Silence has priority over a mediocre observation.
// - One honest observation > three suspicious ones.
// - A single false observation destroys all trust.
//
// This module does NOT detect patterns.
// It validates whether a detected pattern deserves
// to be shown to a human being.
// ═══════════════════════════════════════════

// ─── Anomaly Detection ───
// Exclude weeks where values are extreme outliers
// (>2 standard deviations from the mean).
// A single anomalous week can create a false correlation.

export interface AnomalyResult {
  cleanIndices: number[];
  anomalyCount: number;
  totalCount: number;
}

export function detectAnomalies(values: number[]): AnomalyResult {
  if (values.length < 4) {
    // Not enough data to reliably detect anomalies
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
    // All values identical — no variance, no anomalies
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
// A correlation is not enough. The relationship must be
// present in the majority of individual weeks.
// "Direction" means: when A goes up, does B go up (positive)
// or down (negative)?

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

// ─── Semantic Overlap Groups ───
// Multiple connection types can point to the same underlying
// theme. When overlap exists, keep only the strongest
// observation from each group. Otherwise the user sees
// 3 variations of the same insight, which feels like
// generated content.

export const SEMANTIC_GROUPS: string[][] = [
  // "Low wellness → different spending"
  ['finanzas-energia', 'finanzas-sueno', 'finanzas-estres'],
  // "Mental practice → financial intentionality"
  ['finanzas-mente'],
];

export function findSemanticGroup(connection: string): number {
  return SEMANTIC_GROUPS.findIndex((group) => group.includes(connection));
}

export function filterSemanticOverlap<T extends { connection: string; confidence: number }>(
  observations: T[]
): T[] {
  const groupMap = new Map<number, T>();

  for (const obs of observations) {
    const groupIdx = findSemanticGroup(obs.connection);
    if (groupIdx === -1) {
      // No group — always keep
      groupMap.set(-obs.connection.length, obs); // unique key
      continue;
    }

    const existing = groupMap.get(groupIdx);
    if (!existing || obs.confidence > existing.confidence) {
      groupMap.set(groupIdx, obs);
    }
  }

  return Array.from(groupMap.values());
}

// ─── Philosophical Filter ───
// Every observation text must pass this before being shown.
// The three product questions, plus anti-AI, anti-coaching,
// anti-obvious checks.

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

  // Coaching words — never acceptable
  for (const word of COACHING_WORDS) {
    if (lowerText.includes(word)) {
      return { passes: false, reason: `coaching: "${word}"` };
    }
  }

  // Evaluative words — these judge the user's behavior
  for (const word of EVALUATIVE_WORDS) {
    if (lowerText.includes(word)) {
      return { passes: false, reason: `evaluative: "${word}"` };
    }
  }

  // AI-sounding patterns — the mark of generated content
  for (const pattern of AI_SOUNDING_PATTERNS) {
    if (pattern.test(text)) {
      return { passes: false, reason: `AI-sounding: ${pattern.source}` };
    }
  }

  // Obvious patterns — trivially true statements
  for (const pattern of OBVIOUS_PATTERNS) {
    if (pattern.test(text)) {
      return { passes: false, reason: `obvious: ${pattern.source}` };
    }
  }

  return { passes: true };
}

// ─── Full Signal Validation ───
// Combines all checks into one validation result.

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
  // 1. Anomaly detection on both series
  const anomalyA = detectAnomalies(valuesA);
  const anomalyB = detectAnomalies(valuesB);

  // Intersection of clean indices from both series
  const cleanSetA = new Set(anomalyA.cleanIndices);
  const cleanSetB = new Set(anomalyB.cleanIndices);
  const cleanIndices = anomalyA.cleanIndices.filter((i) => cleanSetB.has(i));

  // Need enough clean weeks after anomaly exclusion
  if (cleanIndices.length < minConsistentWeeks) {
    return {
      isValid: false,
      consistencyScore: 0,
      anomaliesExcluded: anomalyA.anomalyCount + anomalyB.anomalyCount,
      reason: 'not enough clean weeks after anomaly exclusion',
    };
  }

  // 2. Compute consistency on clean data
  const cleanA = cleanIndices.map((i) => valuesA[i]);
  const cleanB = cleanIndices.map((i) => valuesB[i]);
  const consistencyScore = computeConsistency(cleanA, cleanB, direction);

  // Must be consistent in at least 55% of clean weeks
  if (consistencyScore < 0.55) {
    return {
      isValid: false,
      consistencyScore,
      anomaliesExcluded: anomalyA.anomalyCount + anomalyB.anomalyCount,
      reason: `consistency too low: ${(consistencyScore * 100).toFixed(0)}%`,
    };
  }

  // 3. If too many anomalies were excluded, data is unstable
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
