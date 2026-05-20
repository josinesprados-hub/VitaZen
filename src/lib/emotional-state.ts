import { gatherData, type RawData } from './insights';

// ═══════════════════════════════════════════
// EMOTIONAL STATE ENGINE
// Computes user's current emotional state
// using simple rules from real activity data.
// No AI. No invented data.
// ═══════════════════════════════════════════

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

export type EmotionalStatus = 'estable' | 'en_progreso' | 'sobrecargado' | 'enfocado';

export interface EmotionalMetric {
  label: string;
  value: number;       // 0-100
  level: 'bajo' | 'medio' | 'alto';
  trend?: 'up' | 'down' | 'stable'; // PREMIUM only
}

export interface EmotionalState {
  status: EmotionalStatus;
  statusLabel: string;
  statusDescription: string;
  metrics: {
    energy: EmotionalMetric;
    focus: EmotionalMetric;
    stress: EmotionalMetric;
    consistency: EmotionalMetric;
    progress: EmotionalMetric;
    activity: EmotionalMetric;
  };
  recommendation: string;
  summary: string;
  plan: string;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function toLevel(value: number): 'bajo' | 'medio' | 'alto' {
  if (value >= 65) return 'alto';
  if (value >= 35) return 'medio';
  return 'bajo';
}

function scaleTo100(value1to5: number): number {
  return Math.round((value1to5 / 5) * 100);
}

// ─────────────────────────────────────────
// Compute metrics from raw data
// ─────────────────────────────────────────

function computeEnergy(data: RawData): { value: number; prevValue: number } {
  // Energy from check-ins (primary) + wellness sleep (secondary)
  const thisEnergy = avg(data.thisWeekCheckins.map((c: any) => c.energy));
  const thisSleep = avg(data.thisWeekWellness.map((w: any) => w.sleep));

  let value = 0;
  if (data.thisWeekCheckins.length > 0) {
    // 70% from check-in energy, 30% from sleep quality
    value = scaleTo100(thisEnergy) * 0.7;
    if (data.thisWeekWellness.length > 0) {
      value += scaleTo100(thisSleep) * 0.3;
    } else {
      value += scaleTo100(thisEnergy) * 0.3; // fallback to energy itself
    }
  } else if (data.thisWeekWellness.length > 0) {
    value = scaleTo100(thisSleep) * 0.6;
  }

  // Previous week for trend
  const prevEnergy = avg(data.prevWeekCheckins.map((c: any) => c.energy));
  let prevValue = 0;
  if (data.prevWeekCheckins.length > 0) {
    prevValue = scaleTo100(prevEnergy);
  }

  return { value: Math.round(value), prevValue: Math.round(prevValue) };
}

function computeFocus(data: RawData): { value: number; prevValue: number } {
  // Focus from check-ins (primary) + meditation consistency (secondary)
  const thisFocus = avg(data.thisWeekCheckins.map((c: any) => c.focus));
  const meditationRatio = Math.min(data.thisWeekMeditations.length / 4, 1); // 4 sessions = 100%

  let value = 0;
  if (data.thisWeekCheckins.length > 0) {
    value = scaleTo100(thisFocus) * 0.7;
    value += meditationRatio * 100 * 0.3;
  } else {
    value = meditationRatio * 100 * 0.5;
  }

  const prevFocus = avg(data.prevWeekCheckins.map((c: any) => c.focus));
  const prevValue = data.prevWeekCheckins.length > 0 ? scaleTo100(prevFocus) : 0;

  return { value: Math.round(value), prevValue: Math.round(prevValue) };
}

function computeStress(data: RawData): { value: number; prevValue: number } {
  // Stress from check-ins (inverted - high stress = low score)
  const thisStress = avg(data.thisWeekCheckins.map((c: any) => c.stress));
  const thisWellnessStress = avg(data.thisWeekWellness.map((w: any) => w.stress));

  let value = 0;
  if (data.thisWeekCheckins.length > 0) {
    value = scaleTo100(5 - thisStress) * 0.8; // Inverted: low stress = high score
    if (data.thisWeekWellness.length > 0) {
      value += scaleTo100(5 - thisWellnessStress) * 0.2;
    }
  } else if (data.thisWeekWellness.length > 0) {
    value = scaleTo100(5 - thisWellnessStress) * 0.7;
  } else {
    value = 60; // neutral default when no data
  }

  const prevStress = avg(data.prevWeekCheckins.map((c: any) => c.stress));
  const prevValue = data.prevWeekCheckins.length > 0 ? scaleTo100(5 - prevStress) : 60;

  return { value: Math.round(Math.min(value, 100)), prevValue: Math.round(Math.min(prevValue, 100)) };
}

function computeConsistency(data: RawData): { value: number; prevValue: number } {
  // Consistency from check-in frequency + habit completion + meditation frequency
  const checkinRatio = Math.min(data.thisWeekCheckins.length / 5, 1); // 5 check-ins = 100%
  const habitRatio = Math.min(data.thisWeekHabits.length / 7, 1); // 7 days = 100%
  const medRatio = Math.min(data.thisWeekMeditations.length / 4, 1); // 4 sessions = 100%

  let value = checkinRatio * 100 * 0.35;
  value += habitRatio * 100 * 0.35;
  value += medRatio * 100 * 0.3;

  // Previous week approximation
  const prevCheckinRatio = Math.min(data.prevWeekCheckins.length / 5, 1);
  const prevMedRatio = Math.min(data.prevWeekMeditations.length / 4, 1);
  let prevValue = prevCheckinRatio * 100 * 0.5;
  prevValue += prevMedRatio * 100 * 0.5;

  return { value: Math.round(value), prevValue: Math.round(prevValue) };
}

function computeProgress(data: RawData): { value: number; prevValue: number } {
  // Progress from total activity relative to a reasonable target
  const thisTotal =
    data.thisWeekCheckins.length +
    data.thisWeekHabits.length +
    data.thisWeekMeditations.length +
    data.thisWeekJournals.length +
    data.thisWeekWellness.length;

  const prevTotal =
    data.prevWeekCheckins.length +
    data.prevWeekMeditations.length +
    data.prevWeekJournals.length +
    data.prevWeekWellness.length;

  // Target: ~20 activities per week is "100%"
  const value = Math.min(Math.round((thisTotal / 20) * 100), 100);
  const prevValue = Math.min(Math.round((prevTotal / 20) * 100), 100);

  return { value, prevValue };
}

function computeActivity(data: RawData): { value: number; prevValue: number } {
  // Activity from last 3 days vs previous 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000);

  const recentCheckins = data.thisWeekCheckins.filter((c: any) => new Date(c.date) >= threeDaysAgo).length;
  const recentMeditations = data.thisWeekMeditations.filter((m: any) => new Date(m.completedAt) >= threeDaysAgo).length;
  const recentJournals = data.thisWeekJournals.filter((j: any) => new Date(j.createdAt) >= threeDaysAgo).length;

  const recentTotal = recentCheckins + recentMeditations + recentJournals;
  const value = Math.min(Math.round((recentTotal / 9) * 100), 100); // 3 activities/day * 3 days = 9

  // Full week as comparison baseline
  const weeklyTotal = data.thisWeekCheckins.length + data.thisWeekMeditations.length + data.thisWeekJournals.length;
  const prevValue = Math.min(Math.round((weeklyTotal / 15) * 100), 100);

  return { value, prevValue };
}

// ─────────────────────────────────────────
// Determine overall status
// ─────────────────────────────────────────

function determineStatus(metrics: Record<string, { value: number; prevValue: number }>): {
  status: EmotionalStatus;
  label: string;
  description: string;
} {
  const energy = metrics.energy.value;
  const focus = metrics.focus.value;
  const stress = metrics.stress.value; // Inverted: high = calm
  const consistency = metrics.consistency.value;
  const progress = metrics.progress.value;

  // Enfocado: high energy + high focus + low stress
  if (energy >= 65 && focus >= 65 && stress >= 60) {
    return {
      status: 'enfocado',
      label: 'Enfocado',
      description: 'Tu mente y energía están alineadas.',
    };
  }

  // Sobrecargado: high stress (low stress score) + low energy
  if (stress <= 35 && energy <= 40) {
    return {
      status: 'sobrecargado',
      label: 'Sobrecargado',
      description: 'Estrés alto, energía baja.',
    };
  }

  // Sobrecargado: very high stress alone
  if (stress <= 25) {
    return {
      status: 'sobrecargado',
      label: 'Sobrecargado',
      description: 'El estrés está pesando.',
    };
  }

  // En progreso: improving trends or moderate activity with growth
  if (progress >= 50 && consistency >= 40) {
    const energyImproving = metrics.energy.value > metrics.energy.prevValue;
    const consistencyImproving = metrics.consistency.value > metrics.consistency.prevValue;

    if (energyImproving || consistencyImproving) {
      return {
        status: 'en_progreso',
        label: 'En progreso',
        description: 'Tus hábitos se van asentando.',
      };
    }
  }

  // Estable: moderate levels across the board
  if (energy >= 40 && stress >= 40 && consistency >= 30) {
    return {
      status: 'estable',
      label: 'Estable',
      description: 'Equilibrio razonable.',
    };
  }

  // En progreso: has some activity
  if (progress >= 20) {
    return {
      status: 'en_progreso',
      label: 'En progreso',
      description: 'Va tomando forma.',
    };
  }

  // Default: estable
  return {
    status: 'estable',
    label: 'Estable',
    description: '',
  };
}

// ─────────────────────────────────────────
// Generate daily recommendation
// ─────────────────────────────────────────

function generateRecommendation(
  status: EmotionalStatus,
  metrics: Record<string, { value: number; prevValue: number }>,
  data: RawData
): string {
  const energy = metrics.energy.value;
  const focus = metrics.focus.value;
  const stress = metrics.stress.value;
  const consistency = metrics.consistency.value;

  // Stress-based
  if (stress <= 30) {
    if (energy <= 35) {
      return 'Reducir el ritmo hoy puede ayudar.';
    }
    return 'Una respiración consciente antes de seguir.';
  }

  // Energy-based
  if (energy <= 35) {
    return 'Descanso y lo esencial.';
  }

  // Focus-based
  if (focus >= 70 && energy >= 60) {
    return 'Buen momento para lo importante.';
  }

  // Consistency-based
  if (consistency >= 70) {
    return 'Consistencia notable esta semana.';
  }

  // Status-specific
  if (status === 'enfocado') {
    return 'Canaliza esta claridad.';
  }

  if (status === 'en_progreso') {
    return 'Va tomando forma.';
  }

  // Low activity
  if (data.thisWeekCheckins.length === 0) {
    return '';
  }

  // Default
  return '';
}

// ─────────────────────────────────────────
// Generate contextual summary
// ─────────────────────────────────────────

function generateSummary(
  status: EmotionalStatus,
  metrics: Record<string, { value: number; prevValue: number }>,
  data: RawData,
  isPremium: boolean
): string {
  const energy = metrics.energy.value;
  const stress = metrics.stress.value;
  const consistency = metrics.consistency.value;
  const progress = metrics.progress.value;

  const energyUp = metrics.energy.value > metrics.energy.prevValue + 5;
  const stressDown = metrics.stress.value > metrics.stress.prevValue + 5; // stress score going up = actual stress going down
  const consistencyUp = metrics.consistency.value > metrics.consistency.prevValue + 5;

  // Specific patterns
  if (consistencyUp && isPremium) {
    return 'Tu consistencia mejoró esta semana.';
  }

  if (energyUp && isPremium) {
    return 'Tu energía mejoró respecto a la semana pasada.';
  }

  if (stressDown && isPremium) {
    return 'Has reducido el estrés.';
  }

  if (consistency >= 70) {
    return 'Buena estabilidad estos días.';
  }

  if (status === 'sobrecargado') {
    return 'Tu cuerpo y mente piden una pausa.';
  }

  if (status === 'enfocado') {
    return 'Claridad y determinación.';
  }

  if (progress >= 60) {
    return 'Buena actividad esta semana.';
  }

  if (progress >= 30) {
    return 'Avanzas a tu ritmo.';
  }

  // No data
  if (data.thisWeekCheckins.length === 0 && data.thisWeekMeditations.length === 0) {
    return '';
  }

  return '';
}

// ─────────────────────────────────────────
// Determine trend direction (PREMIUM)
// ─────────────────────────────────────────

function getTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
  const diff = current - previous;
  if (diff > 5) return 'up';
  if (diff < -5) return 'down';
  return 'stable';
}

// ─────────────────────────────────────────
// Main function
// ─────────────────────────────────────────

export async function getEmotionalState(userId: string, plan: string): Promise<EmotionalState> {
  const data = await gatherData(userId);
  const isPremium = plan === 'PREMIUM';

  // Compute all metrics
  const rawMetrics = {
    energy: computeEnergy(data),
    focus: computeFocus(data),
    stress: computeStress(data),
    consistency: computeConsistency(data),
    progress: computeProgress(data),
    activity: computeActivity(data),
  };

  // Determine overall status
  const { status, label, description } = determineStatus(rawMetrics);

  // Build metric objects
  const metrics: EmotionalState['metrics'] = {
    energy: {
      label: 'Energía',
      value: rawMetrics.energy.value,
      level: toLevel(rawMetrics.energy.value),
      ...(isPremium ? { trend: getTrend(rawMetrics.energy.value, rawMetrics.energy.prevValue) } : {}),
    },
    focus: {
      label: 'Enfoque',
      value: rawMetrics.focus.value,
      level: toLevel(rawMetrics.focus.value),
      ...(isPremium ? { trend: getTrend(rawMetrics.focus.value, rawMetrics.focus.prevValue) } : {}),
    },
    stress: {
      label: 'Calma',
      value: rawMetrics.stress.value,
      level: toLevel(rawMetrics.stress.value),
      ...(isPremium ? { trend: getTrend(rawMetrics.stress.value, rawMetrics.stress.prevValue) } : {}),
    },
    consistency: {
      label: 'Consistencia',
      value: rawMetrics.consistency.value,
      level: toLevel(rawMetrics.consistency.value),
      ...(isPremium ? { trend: getTrend(rawMetrics.consistency.value, rawMetrics.consistency.prevValue) } : {}),
    },
    progress: {
      label: 'Progreso semanal',
      value: rawMetrics.progress.value,
      level: toLevel(rawMetrics.progress.value),
      ...(isPremium ? { trend: getTrend(rawMetrics.progress.value, rawMetrics.progress.prevValue) } : {}),
    },
    activity: {
      label: 'Actividad reciente',
      value: rawMetrics.activity.value,
      level: toLevel(rawMetrics.activity.value),
      ...(isPremium ? { trend: getTrend(rawMetrics.activity.value, rawMetrics.activity.prevValue) } : {}),
    },
  };

  // Generate recommendation and summary
  const recommendation = generateRecommendation(status, rawMetrics, data);
  const summary = generateSummary(status, rawMetrics, data, isPremium);

  return {
    status,
    statusLabel: label,
    statusDescription: description,
    metrics,
    recommendation,
    summary,
    plan,
  };
}
