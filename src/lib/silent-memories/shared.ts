// ═══════════════════════════════════════════
// VITAZEN — Silent Memories: Shared Layer
// ═══════════════════════════════════════════
//
// Types, constants, and pure observer functions.
//
// This module has ZERO side effects.
// No db. No localStorage. No server. No client.
// Just types and pure functions.
//
// Both server and client import from here.
// This is the ONLY shared surface between them.
// ═══════════════════════════════════════════

// ─── Types ───

export type SilentMemoryType = 'return' | 'recurrence' | 'shift' | 'presence' | 'temporal';

export interface SilentMemory {
  observation: string;
  type: SilentMemoryType;
  /** How rare this is — affects how often it can appear */
  rarity: 'rare' | 'very_rare';
}

export interface MemoryState {
  /** ISO date strings of when each type was last shown */
  lastShown: Record<SilentMemoryType, string | null>;
  /** Observations already shown in current cycle */
  shown: string[];
}

export const STORAGE_KEY = 'vitazen_silent_memories';

// ─── Minimum intervals between memories ───
// These protect rarity. A memory type can't appear
// again until its interval has passed.

export const MIN_INTERVALS: Record<SilentMemoryType, number> = {
  return: 3 * 86400000,     // 3 days minimum between return observations
  recurrence: 14 * 86400000, // 2 weeks between recurrence observations
  shift: 7 * 86400000,      // 1 week between shift observations
  presence: 10 * 86400000,  // 10 days between presence observations
  temporal: 21 * 86400000,  // 3 weeks between temporal observations
};

// ─── Server response type ───
// The API route returns this raw data.
// The client uses it to compute observations.

export interface SilentMemoryData {
  /** For temporal observation: date of first activity */
  firstActivityDate: string | null;
  /** For presence observation: consecutive active days */
  consecutiveDays: number;
  /** For shift observation: this week's averages */
  thisWeek: { avgEnergy: number; avgStress: number; count: number } | null;
  /** For shift observation: previous week's averages */
  prevWeek: { avgEnergy: number; avgStress: number; count: number } | null;
  /** For recurrence observation: this week vs month ago */
  thisWeekForRecurrence: { avgEnergy: number; avgStress: number; count: number } | null;
  monthAgo: { avgEnergy: number; avgStress: number; count: number } | null;
}

// ─── Pure Observer Functions ───
// These take raw numbers and return a SilentMemory or null.
// No side effects. No I/O. No state.
// Pure computation only.

/**
 * Return after silence.
 * When someone comes back after being away for a while.
 * NOT a nudge to return. Just noticing they're here.
 *
 * Each message was chosen to be distinct from the
 * ReturnTrigger that was removed. No overlap with
 * any other emotional voice in the app.
 */
export function observeReturn(daysSince: number): SilentMemory | null {
  if (daysSince < 5) return null;

  if (daysSince <= 7) {
    return { observation: 'Hacía unos días.', type: 'return', rarity: 'rare' };
  }
  if (daysSince <= 14) {
    return { observation: 'Vuelves después de un tiempo.', type: 'return', rarity: 'rare' };
  }
  if (daysSince <= 30) {
    return { observation: 'Aquí estás de nuevo.', type: 'return', rarity: 'very_rare' };
  }
  return { observation: 'Hacía tiempo sin pasar por aquí.', type: 'return', rarity: 'very_rare' };
}

/**
 * Recurring pattern.
 * When a pattern from months ago is happening again.
 * Not "tu patrón se repite" — just a quiet recognition.
 */
export function observeRecurrence(
  currentStress: number,
  currentEnergy: number,
  prevStress: number,
  prevEnergy: number
): SilentMemory | null {
  // Only when current state closely matches a past state
  const stressSimilar = Math.abs(currentStress - prevStress) < 0.5;
  const energySimilar = Math.abs(currentEnergy - prevEnergy) < 0.5;

  if (!stressSimilar && !energySimilar) return null;

  if (stressSimilar && currentStress > 3) {
    return { observation: 'Este ritmo ya te había acompañado antes.', type: 'recurrence', rarity: 'very_rare' };
  }
  if (energySimilar && currentEnergy > 3.5) {
    return { observation: 'Ya habías estado así.', type: 'recurrence', rarity: 'rare' };
  }
  return null;
}

/**
 * Stage shift.
 * When emotional state has noticeably changed over several weeks.
 * Quiet, not dramatic.
 */
export function observeShift(
  thisWeekEnergy: number,
  prevWeekEnergy: number,
  thisWeekStress: number,
  prevWeekStress: number
): SilentMemory | null {
  const energyShift = thisWeekEnergy - prevWeekEnergy;
  const stressShift = prevWeekStress - thisWeekStress; // positive = stress went down

  // Significant shift over time
  if (energyShift > 1.0) {
    return { observation: 'La energía cambió estas semanas.', type: 'shift', rarity: 'rare' };
  }
  if (energyShift < -1.0) {
    return { observation: 'Menos energía últimamente.', type: 'shift', rarity: 'rare' };
  }
  if (stressShift > 1.0) {
    return { observation: 'Menos peso últimamente.', type: 'shift', rarity: 'rare' };
  }
  return null;
}

/**
 * Presence observation.
 * When someone has been consistently present for a while.
 * NOT "¡Buen trabajo!" — just a quiet recognition.
 *
 * Only two milestones: 30 days and 365 days.
 * 21 and 60 days felt like streak markers.
 * Real presence isn't measured in weeks — it's measured
 * in months and years. Two observations are enough.
 */
export function observePresence(consistencyDays: number): SilentMemory | null {
  // Range-based check: if the user has reached or passed a milestone
  // since the last time this could have been shown (MIN_INTERVAL is 10 days),
  // they'll see it. Previously used exact equality (=== 30, === 365),
  // which meant missing the observation if they didn't open the app
  // on the exact day.
  if (consistencyDays >= 30 && consistencyDays <= 39) {
    return { observation: 'Un mes así.', type: 'presence', rarity: 'very_rare' };
  }
  if (consistencyDays >= 365 && consistencyDays <= 374) {
    return { observation: 'Un año así.', type: 'presence', rarity: 'very_rare' };
  }
  return null;
}

/**
 * Temporal observation.
 * Noting the passage of time, seasons, months.
 * Rare. Only when it genuinely adds presence.
 */
export function observeTemporal(monthsSinceStart: number): SilentMemory | null {
  // Range-based check: uses a window of ±0 (floor months) so that
  // if the user doesn't open the app on the exact month boundary,
  // they still see the observation within a reasonable window.
  // The MIN_INTERVAL for temporal is 21 days, so the window is safe.
  if (monthsSinceStart === 3) {
    return { observation: 'Ya tres meses.', type: 'temporal', rarity: 'very_rare' };
  }
  if (monthsSinceStart === 6) {
    return { observation: 'Medio año.', type: 'temporal', rarity: 'very_rare' };
  }
  if (monthsSinceStart === 12) {
    return { observation: 'Un año.', type: 'temporal', rarity: 'very_rare' };
  }
  return null;
}
