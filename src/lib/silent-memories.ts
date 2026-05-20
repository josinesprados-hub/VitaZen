// ═══════════════════════════════════════════
// VITAZEN — Silent Memories
// ═══════════════════════════════════════════
//
// Rare, silent, memorable moments.
// Not a feature. Not a system. Just presence.
//
// The user should FEEL:
// "esta app me acompañó de una forma extrañamente humana"
//
// NOT:
// "qué feature más buena"
//
// Rules:
//  - NEVER coaching. NEVER advice. NEVER tips.
//  - NEVER constant. NEVER scheduled.
//  - Only when context genuinely produces a human observation.
//  - Each observer checks specific conditions from real data.
//  - If conditions aren't met: silence. Always silence.
//  - Rarity is protected by tracking shown memories.
//  - Deep memories appear at most once per month.
//  - Light memories at most once per week.
//  - No memory repeats until its type cycle completes.
//
// These are NOT notifications. They are quiet observations
// that appear in the flow of the app, like someone
// quietly noticing something.

import { db } from './db';

// ─── Types ───

export type SilentMemoryType = 'return' | 'recurrence' | 'shift' | 'presence' | 'temporal';

export interface SilentMemory {
  observation: string;
  type: SilentMemoryType;
  /** How rare this is — affects how often it can appear */
  rarity: 'rare' | 'very_rare';
}

interface MemoryState {
  /** ISO date strings of when each type was last shown */
  lastShown: Record<SilentMemoryType, string | null>;
  /** Observations already shown in current cycle */
  shown: string[];
}

const STORAGE_KEY = 'vitazen_silent_memories';

// ─── Minimum intervals between memories ───
// These protect rarity. A memory type can't appear
// again until its interval has passed.

const MIN_INTERVALS: Record<SilentMemoryType, number> = {
  return: 3 * 86400000,     // 3 days minimum between return observations
  recurrence: 14 * 86400000, // 2 weeks between recurrence observations
  shift: 7 * 86400000,      // 1 week between shift observations
  presence: 10 * 86400000,  // 10 days between presence observations
  temporal: 21 * 86400000,  // 3 weeks between temporal observations
};

// ─── State persistence ───

function loadState(): MemoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MemoryState;
      if (parsed.lastShown && parsed.shown) return parsed;
    }
  } catch {
    // unavailable or corrupt
  }
  return { lastShown: { return: null, recurrence: null, shift: null, presence: null, temporal: null }, shown: [] };
}

function saveState(state: MemoryState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function canShow(state: MemoryState, type: SilentMemoryType): boolean {
  const last = state.lastShown[type];
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= MIN_INTERVALS[type];
}

// ─── Observers ───
// Each checks specific conditions and returns a SilentMemory or null.
// They use REAL data. No invention. No fabrication.

/**
 * Return after silence.
 * When someone comes back after being away for a while.
 * NOT a nudge to return. Just noticing they're here.
 */
function observeReturn(daysSince: number): SilentMemory | null {
  if (daysSince < 5) return null;

  if (daysSince <= 7) {
    return { observation: 'Hacía unos días.', type: 'return', rarity: 'rare' };
  }
  if (daysSince <= 14) {
    return { observation: 'Tiempo sin pasar.', type: 'return', rarity: 'rare' };
  }
  if (daysSince <= 30) {
    return { observation: 'Aquí estás de nuevo.', type: 'return', rarity: 'very_rare' };
  }
  return { observation: 'Hacía mucho.', type: 'return', rarity: 'very_rare' };
}

/**
 * Recurring pattern.
 * When a pattern from months ago is happening again.
 * Not "tu patrón se repite" — just a quiet recognition.
 */
function observeRecurrence(
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
function observeShift(
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
 */
function observePresence(consistencyDays: number): SilentMemory | null {
  // Only at meaningful thresholds. Not every streak.
  if (consistencyDays === 21) {
    return { observation: 'Tres semanas.', type: 'presence', rarity: 'very_rare' };
  }
  if (consistencyDays === 30) {
    return { observation: 'Un mes así.', type: 'presence', rarity: 'very_rare' };
  }
  if (consistencyDays === 60) {
    return { observation: 'Llevas tiempo así.', type: 'presence', rarity: 'very_rare' };
  }
  if (consistencyDays === 100) {
    return { observation: 'Ya es costumbre.', type: 'presence', rarity: 'very_rare' };
  }
  return null;
}

/**
 * Temporal observation.
 * Noting the passage of time, seasons, months.
 * Rare. Only when it genuinely adds presence.
 */
function observeTemporal(monthsSinceStart: number): SilentMemory | null {
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

// ─── Main function ───
// Called from the dashboard. Checks all observers.
// Returns the FIRST valid memory, or null (silence).
// Priority: very_rare > rare (rarity is more memorable).

export async function checkSilentMemories(userId: string): Promise<SilentMemory | null> {
  const state = loadState();

  // ─── 1. Return after silence ───
  if (canShow(state, 'return')) {
    const lastSeen = localStorage.getItem('vitazen_last_seen');
    if (lastSeen) {
      const daysSince = Math.floor((Date.now() - parseInt(lastSeen, 10)) / 86400000);
      const memory = observeReturn(daysSince);
      if (memory && !state.shown.includes(memory.observation)) {
        state.lastShown[memory.type] = new Date().toISOString();
        state.shown = [...state.shown, memory.observation].slice(-20);
        saveState(state);
        return memory;
      }
    }
  }

  // ─── 2. Temporal observation ───
  if (canShow(state, 'temporal')) {
    try {
      const firstActivity = await db.dailyCheckin.findFirst({
        where: { userId },
        orderBy: { date: 'asc' },
        select: { date: true },
      });
      if (firstActivity) {
        const months = Math.floor(
          (Date.now() - new Date(firstActivity.date).getTime()) / (30 * 86400000)
        );
        const memory = observeTemporal(months);
        if (memory && !state.shown.includes(memory.observation)) {
          state.lastShown[memory.type] = new Date().toISOString();
          state.shown = [...state.shown, memory.observation].slice(-20);
          saveState(state);
          return memory;
        }
      }
    } catch {
      // DB unavailable — skip
    }
  }

  // ─── 3. Presence observation ───
  if (canShow(state, 'presence')) {
    try {
      // Count consecutive days with activity
      const recentDays = new Set<string>();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

      const [checkins, habits, wellness] = await Promise.all([
        db.dailyCheckin.findMany({
          where: { userId, date: { gte: thirtyDaysAgo } },
          select: { date: true },
        }),
        db.habitLog.findMany({
          where: { userId, lastCompletedAt: { gte: thirtyDaysAgo, not: null } },
          select: { lastCompletedAt: true },
        }),
        db.wellnessLog.findMany({
          where: { userId, date: { gte: thirtyDaysAgo } },
          select: { date: true },
        }),
      ]);

      const addDay = (d: Date) => {
        const day = new Date(d);
        recentDays.add(`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`);
      };
      checkins.forEach(c => addDay(c.date));
      habits.forEach(h => { if (h.lastCompletedAt) addDay(h.lastCompletedAt); });
      wellness.forEach(w => addDay(w.date));

      // Count consecutive days backwards from today
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today.getTime() - i * 86400000);
        const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (recentDays.has(dateStr)) {
          streak++;
        } else {
          break;
        }
      }

      const memory = observePresence(streak);
      if (memory && !state.shown.includes(memory.observation)) {
        state.lastShown[memory.type] = new Date().toISOString();
        state.shown = [...state.shown, memory.observation].slice(-20);
        saveState(state);
        return memory;
      }
    } catch {
      // DB unavailable — skip
    }
  }

  // ─── 4. Stage shift ───
  if (canShow(state, 'shift')) {
    try {
      const [thisWeek, prevWeek] = await Promise.all([
        db.dailyCheckin.findMany({
          where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
          select: { energy: true, stress: true },
        }),
        db.dailyCheckin.findMany({
          where: { userId, date: { gte: new Date(Date.now() - 14 * 86400000), lt: new Date(Date.now() - 7 * 86400000) } },
          select: { energy: true, stress: true },
        }),
      ]);

      if (thisWeek.length >= 3 && prevWeek.length >= 3) {
        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const memory = observeShift(
          avg(thisWeek.map(c => c.energy)),
          avg(prevWeek.map(c => c.energy)),
          avg(thisWeek.map(c => c.stress)),
          avg(prevWeek.map(c => c.stress)),
        );
        if (memory && !state.shown.includes(memory.observation)) {
          state.lastShown[memory.type] = new Date().toISOString();
          state.shown = [...state.shown, memory.observation].slice(-20);
          saveState(state);
          return memory;
        }
      }
    } catch {
      // DB unavailable — skip
    }
  }

  // ─── 5. Recurring pattern ───
  if (canShow(state, 'recurrence')) {
    try {
      // Compare current week to a month ago
      const [thisWeek, monthAgo] = await Promise.all([
        db.dailyCheckin.findMany({
          where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
          select: { energy: true, stress: true },
        }),
        db.dailyCheckin.findMany({
          where: {
            userId,
            date: {
              gte: new Date(Date.now() - 35 * 86400000),
              lt: new Date(Date.now() - 28 * 86400000),
            },
          },
          select: { energy: true, stress: true },
        }),
      ]);

      if (thisWeek.length >= 3 && monthAgo.length >= 3) {
        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const memory = observeRecurrence(
          avg(thisWeek.map(c => c.stress)),
          avg(thisWeek.map(c => c.energy)),
          avg(monthAgo.map(c => c.stress)),
          avg(monthAgo.map(c => c.energy)),
        );
        if (memory && !state.shown.includes(memory.observation)) {
          state.lastShown[memory.type] = new Date().toISOString();
          state.shown = [...state.shown, memory.observation].slice(-20);
          saveState(state);
          return memory;
        }
      }
    } catch {
      // DB unavailable — skip
    }
  }

  // No memory conditions met — silence
  return null;
}

// ─── Client-side only observer ───
// For observations that don't need DB access.
// Used in the SilentMemory component directly.

export function checkClientSilentMemory(): SilentMemory | null {
  const state = loadState();

  // Return after silence (client-side)
  if (canShow(state, 'return')) {
    const lastSeen = localStorage.getItem('vitazen_last_seen');
    if (lastSeen) {
      const daysSince = Math.floor((Date.now() - parseInt(lastSeen, 10)) / 86400000);
      const memory = observeReturn(daysSince);
      if (memory && !state.shown.includes(memory.observation)) {
        state.lastShown[memory.type] = new Date().toISOString();
        state.shown = [...state.shown, memory.observation].slice(-20);
        saveState(state);
        return memory;
      }
    }
  }

  return null;
}
