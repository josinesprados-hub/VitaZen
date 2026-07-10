// ═══════════════════════════════════════════
// VITAZEN — Silent Memory State (server-side)
// ═══════════════════════════════════════════
//
// Extracted from emotional-dashboard-state.ts during the reflections
// system removal. This module handles ONLY the silent memory
// (rare observations) — the reflection logic has been removed.
//
// Single source of truth for silent memory content.
// No client-side random. No localStorage.
// The server decides the memory, all devices show the same one.
//
// This module MUST NEVER be imported from client code.
// It accesses the database directly.

import { db } from '@/lib/db';
import {
  type SilentMemory,
  type SilentMemoryType,
  type SilentMemoryData,
  MIN_INTERVALS,
  observeReturn,
  observeRecurrence,
  observeShift,
  observePresence,
  observeTemporal,
} from '@/lib/silent-memories/shared';
import { getTodayDateKey } from '@/lib/deterministic';

// ─── Concurrency guard ──────────────────────
// Prevents race conditions when two concurrent requests
// (e.g., mobile + desktop opening simultaneously) both
// call getSilentMemorySnapshot for the same user.
const inFlightSnapshots = new Map<string, Promise<SilentMemorySnapshot>>();

// ─── Types ──────────────────────────────────

interface MemoryState {
  lastShown: Record<SilentMemoryType, string | null>;
  shown: string[];
}

export interface SilentMemorySnapshot {
  silentMemory: SilentMemory | null;
}

// ─── Silent Memory with Server-Side Rarity ──

function canShowMemory(state: MemoryState, type: SilentMemoryType): boolean {
  const last = state.lastShown[type];
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= MIN_INTERVALS[type];
}

function recordMemoryShown(state: MemoryState, memory: SilentMemory): MemoryState {
  return {
    lastShown: {
      ...state.lastShown,
      [memory.type]: new Date().toISOString(),
    },
    shown: [...state.shown, memory.observation].slice(-20),
  };
}

function selectSilentMemory(
  memoryState: MemoryState,
  serverData: SilentMemoryData,
  userId: string,
  lastVisitAt: Date | null,
): { memory: SilentMemory | null; updatedState: MemoryState } {
  const state = { ...memoryState, lastShown: { ...memoryState.lastShown }, shown: [...memoryState.shown] };
  const candidates: SilentMemory[] = [];

  // ─── 1. Return after silence ───
  if (canShowMemory(state, 'return') && lastVisitAt) {
    const daysSince = Math.floor(
      (Date.now() - lastVisitAt.getTime()) / 86400000
    );
    const memory = observeReturn(daysSince);
    if (memory && !state.shown.includes(memory.observation)) {
      candidates.push(memory);
    }
  }

  // ─── 2. Temporal observation ───
  if (canShowMemory(state, 'temporal') && serverData.firstActivityDate) {
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
  if (canShowMemory(state, 'presence')) {
    const memory = observePresence(serverData.consecutiveDays);
    if (memory && !state.shown.includes(memory.observation)) {
      candidates.push(memory);
    }
  }

  // ─── 4. Stage shift ───
  if (canShowMemory(state, 'shift') && serverData.thisWeek && serverData.prevWeek) {
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
    canShowMemory(state, 'recurrence') &&
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
    const updated = recordMemoryShown(state, selected);
    return { memory: selected, updatedState: updated };
  }

  return { memory: null, updatedState: state };
}

// ─── Main: Get Silent Memory Snapshot ───────

export async function getSilentMemorySnapshot(
  userId: string,
): Promise<SilentMemorySnapshot> {
  // ─── Concurrency guard ───────────────────
  const existing = inFlightSnapshots.get(userId);
  if (existing) return existing;

  const promise = computeSilentMemorySnapshot(userId).finally(() => {
    inFlightSnapshots.delete(userId);
  });
  inFlightSnapshots.set(userId, promise);
  return promise;
}

async function computeSilentMemorySnapshot(
  userId: string,
): Promise<SilentMemorySnapshot> {
  const dateKey = getTodayDateKey();

  // Read current state (or create if missing)
  const state = await db.emotionalDashboardState.findUnique({
    where: { userId },
  });

  let lastVisitAt: Date | null;
  let memState: MemoryState;

  const defaultMemoryState: MemoryState = {
    lastShown: { return: null, recurrence: null, shift: null, presence: null, temporal: null },
    shown: [],
  };

  if (!state) {
    lastVisitAt = null;
    memState = { ...defaultMemoryState };
  } else {
    lastVisitAt = state.lastVisitAt;
    try {
      memState = JSON.parse(state.memoryState);
      if (!memState.lastShown || !Array.isArray(memState.shown)) {
        memState = { ...defaultMemoryState };
      }
    } catch {
      memState = { ...defaultMemoryState };
    }
  }

  // ─── Compute silent memory ───
  let memoryResult: { memory: SilentMemory | null; updatedState: MemoryState } = {
    memory: null,
    updatedState: memState,
  };

  try {
    const { getSilentMemoryData } = await import('./silent-memories');
    const serverData = await getSilentMemoryData(userId);
    memoryResult = selectSilentMemory(memState, serverData, userId, lastVisitAt);
  } catch {
    // If memory computation fails, that's fine — silence
  }

  // ─── Persist updated state ───
  await db.emotionalDashboardState.upsert({
    where: { userId },
    update: {
      memoryState: JSON.stringify(memoryResult.updatedState),
      lastVisitAt: new Date(),
      dateKey,
    },
    create: {
      userId,
      memoryState: JSON.stringify(memoryResult.updatedState),
      lastVisitAt: new Date(),
      dateKey,
    },
  });

  return {
    silentMemory: memoryResult.memory,
  };
}
