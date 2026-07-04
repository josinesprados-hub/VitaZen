// ═══════════════════════════════════════════
// VITAZEN — Silent Memories: Client Layer
// ═══════════════════════════════════════════
//
// Client-safe state management and observation selection.
// Uses localStorage for rarity tracking.
// Uses server-fetched data for DB-dependent observations.
//
// This module MUST NEVER import:
//   - db, Prisma, pg, or any server module
//   - Anything from @/lib/server/
//
// It only imports from the shared layer (pure functions, types).
// ═══════════════════════════════════════════

import {
  type SilentMemory,
  type SilentMemoryType,
  type SilentMemoryData,
  type MemoryState,
  STORAGE_KEY,
  MIN_INTERVALS,
  observeReturn,
  observeRecurrence,
  observeShift,
  observePresence,
  observeTemporal,
} from '@/lib/silent-memories/shared';

// Re-export types for convenience
export type { SilentMemory, SilentMemoryType, SilentMemoryData };

// ─── State persistence (localStorage) ───

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
  return {
    lastShown: {
      return: null,
      recurrence: null,
      shift: null,
      presence: null,
      temporal: null,
    },
    shown: [],
  };
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

/**
 * Record that a memory was shown.
 * Updates state and persists to localStorage.
 */
function recordShown(state: MemoryState, memory: SilentMemory): MemoryState {
  return {
    lastShown: {
      ...state.lastShown,
      [memory.type]: new Date().toISOString(),
    },
    shown: [...state.shown, memory.observation].slice(-20),
  };
}

// ─── Client-only observation (no server data needed) ───

/**
 * Check for a return-after-silence observation.
 * Uses only localStorage — no DB access needed.
 */
export function checkClientSilentMemory(): SilentMemory | null {
  const state = loadState();

  // Return after silence (client-side)
  if (canShow(state, 'return')) {
    const lastSeen = localStorage.getItem('vitazen_last_seen');
    if (lastSeen) {
      const daysSince = Math.floor(
        (Date.now() - parseInt(lastSeen, 10)) / 86400000
      );
      const memory = observeReturn(daysSince);
      if (memory && !state.shown.includes(memory.observation)) {
        const updated = recordShown(state, memory);
        saveState(updated);
        return memory;
      }
    }
  }

  return null;
}

// ─── Full observation check (uses server data) ───

/**
 * Check all silent memory observations using server-fetched data.
 * Handles state management (rarity, intervals) on the client side.
 * Returns the FIRST valid memory, or null (silence).
 * Priority: very_rare > rare (rarity is more memorable).
 */
export function checkAllSilentMemories(
  serverData: SilentMemoryData
): SilentMemory | null {
  const state = loadState();

  // Collect all valid memories
  const candidates: SilentMemory[] = [];

  // ─── 1. Return after silence (client-side, no server data) ───
  if (canShow(state, 'return')) {
    const lastSeen = localStorage.getItem('vitazen_last_seen');
    if (lastSeen) {
      const daysSince = Math.floor(
        (Date.now() - parseInt(lastSeen, 10)) / 86400000
      );
      const memory = observeReturn(daysSince);
      if (memory && !state.shown.includes(memory.observation)) {
        candidates.push(memory);
      }
    }
  }

  // ─── 2. Temporal observation ───
  if (canShow(state, 'temporal') && serverData.firstActivityDate) {
    const months = Math.floor(
      (Date.now() - new Date(serverData.firstActivityDate).getTime()) /
        (30 * 86400000)
    );
    const memory = observeTemporal(months);
    if (memory && !state.shown.includes(memory.observation)) {
      candidates.push(memory);
    }
  }

  // ─── 3. Presence observation ───
  if (canShow(state, 'presence')) {
    const memory = observePresence(serverData.consecutiveDays);
    if (memory && !state.shown.includes(memory.observation)) {
      candidates.push(memory);
    }
  }

  // ─── 4. Stage shift ───
  if (canShow(state, 'shift') && serverData.thisWeek && serverData.prevWeek) {
    const memory = observeShift(
      serverData.thisWeek.avgEnergy,
      serverData.prevWeek.avgEnergy,
      serverData.thisWeek.avgStress,
      serverData.prevWeek.avgStress
    );
    if (memory && !state.shown.includes(memory.observation)) {
      candidates.push(memory);
    }
  }

  // ─── 5. Recurring pattern ───
  if (
    canShow(state, 'recurrence') &&
    serverData.thisWeekForRecurrence &&
    serverData.monthAgo
  ) {
    const memory = observeRecurrence(
      serverData.thisWeekForRecurrence.avgStress,
      serverData.thisWeekForRecurrence.avgEnergy,
      serverData.monthAgo.avgStress,
      serverData.monthAgo.avgEnergy
    );
    if (memory && !state.shown.includes(memory.observation)) {
      candidates.push(memory);
    }
  }

  // ─── Select: very_rare first, then rare ───
  const veryRare = candidates.find((m) => m.rarity === 'very_rare');
  const selected = veryRare || candidates[0] || null;

  // ─── Record and persist ───
  if (selected) {
    const updated = recordShown(state, selected);
    saveState(updated);
  }

  return selected;
}
