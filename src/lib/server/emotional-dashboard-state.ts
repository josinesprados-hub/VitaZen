// ═══════════════════════════════════════════
// VITAZEN — Emotional Dashboard State
// Server-side single source of truth
// ═══════════════════════════════════════════
//
// The ONLY place where emotional dashboard content
// is decided. No client-side random. No localStorage.
// No per-device state.
//
// This module:
//   - Generates emotional content ONCE per state cycle
//   - Persists it in the database
//   - Shares it across all devices
//   - Keeps it stable for the day
//   - Invalidates with clear rules
//
// This module MUST NEVER be imported from client code.
// It accesses the database directly.

import { db } from '@/lib/db';
import {
  REFLECTIONS,
  isDeepReflection,
  type ReflectionWeight,
} from '@/lib/reflections';
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
import {
  deterministicHash,
  deterministicShuffle,
  deterministicIndex,
  getTodayDateKey,
} from '@/lib/deterministic';

// ─── Types ──────────────────────────────────

interface ReflectionState {
  currentIndex: number;
  visitCount: number;
  shown: number[];
  recent: number[];
  visitTotal: number;
}

interface MemoryState {
  lastShown: Record<SilentMemoryType, string | null>;
  shown: string[];
}

export interface EmotionalDashboardSnapshot {
  reflection: {
    text: string;
    isDeep: boolean;
    isSilent: boolean;
  } | null;
  silentMemory: SilentMemory | null;
}

// ─── Constants ──────────────────────────────

const SILENCE_PATTERN = [false, false, true]; // 2 show, 1 rest — ~35% silence
const FREE_TIPS_VISIBLE = 2;
const WEIGHTS: Record<ReflectionWeight, number> = {
  light: 0.50,
  relevant: 0.35,
  deep: 0.15,
};

// ─── Load / Create State ────────────────────

async function getOrCreateState(userId: string) {
  const todayKey = getTodayDateKey();

  let state = await db.emotionalDashboardState.findUnique({
    where: { userId },
  });

  if (!state) {
    // First time — create with deterministic initial values
    const initialReflection = selectDeterministicReflection(userId, todayKey, 0, []);
    const state = await db.emotionalDashboardState.create({
      data: {
        userId,
        reflectionState: JSON.stringify({
          currentIndex: initialReflection,
          visitCount: 0,
          shown: [initialReflection],
          recent: [initialReflection],
          visitTotal: 0,
        }),
        tipsState: JSON.stringify({}),
        memoryState: JSON.stringify({
          lastShown: { return: null, recurrence: null, shift: null, presence: null, temporal: null },
          shown: [],
        }),
        lastVisitAt: new Date(),
        dateKey: todayKey,
      },
    });
    return state;
  }

  // New day? Reset daily-sensitive state but keep accumulated state
  if (state.dateKey !== todayKey) {
    state = await db.emotionalDashboardState.update({
      where: { userId },
      data: {
        dateKey: todayKey,
        lastVisitAt: new Date(),
      },
    });
  }

  return state;
}

// ─── Deterministic Reflection Selection ─────
// Replaces Math.random()-based selectWeightedReflection().
// Same userId + dateKey + visitTotal = same result everywhere.

function selectDeterministicReflection(
  userId: string,
  dateKey: string,
  visitTotal: number,
  excludeIndices: number[],
): number {
  const excludeSet = new Set(excludeIndices);

  // Build available pool with weights
  const pool: { index: number; weight: number }[] = [];
  REFLECTIONS.forEach((r, i) => {
    if (!excludeSet.has(i)) {
      pool.push({ index: i, weight: WEIGHTS[r.weight] });
    }
  });

  if (pool.length === 0) {
    // Fallback: deterministic index from all reflections
    return deterministicIndex(userId + dateKey + visitTotal, REFLECTIONS.length);
  }

  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);

  // Use deterministic hash as "random" number
  const seed = `${userId}:${dateKey}:${visitTotal}`;
  const hash = deterministicHash(seed);
  let random = (hash % 10000) / 10000 * totalWeight;

  for (const item of pool) {
    random -= item.weight;
    if (random <= 0) return item.index;
  }

  return pool[pool.length - 1].index;
}

// ─── Advance Reflection on Visit ────────────

function shouldSilence(visitTotal: number): boolean {
  const patternIndex = visitTotal % SILENCE_PATTERN.length;
  return SILENCE_PATTERN[patternIndex];
}

function computeReflectionState(
  currentState: ReflectionState,
  userId: string,
  dateKey: string,
): ReflectionState & { isSilent: boolean; text: string; isDeep: boolean } {
  const state = { ...currentState, shown: [...currentState.shown], recent: [...currentState.recent] };

  // Increment total visits for silence rhythm
  state.visitTotal = (state.visitTotal || 0) + 1;

  // ── Silence check ──
  // Skip silence for the very first visits
  if (state.visitTotal > 2 && shouldSilence(state.visitTotal)) {
    return { ...state, isSilent: true, text: '', isDeep: false };
  }

  // Advance on every visit
  const currentIsDeep = isDeepReflection(state.currentIndex);
  const requiredVisits = currentIsDeep ? 2 : 1;

  if (state.visitCount < requiredVisits - 1) {
    // Stay on current reflection for one more visit
    state.visitCount++;
    const reflection = REFLECTIONS[state.currentIndex];
    return { ...state, isSilent: false, text: reflection.text, isDeep: currentIsDeep };
  }

  // Time to advance to a new reflection
  const newIndex = selectDeterministicReflection(userId, dateKey, state.visitTotal, state.recent);

  state.currentIndex = newIndex;
  state.visitCount = 0;
  state.shown = [...state.shown, newIndex];

  // Track recent (last 10 to avoid close repetition)
  state.recent = [...state.recent, newIndex].slice(-10);

  // Check if we've shown most reflections — reset cycle
  if (state.shown.length >= REFLECTIONS.length - 5) {
    state.shown = state.recent.slice(-5);
  }

  const newIsDeep = isDeepReflection(state.currentIndex);
  const reflection = REFLECTIONS[state.currentIndex];
  return { ...state, isSilent: false, text: reflection.text, isDeep: newIsDeep };
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
  // Uses the server-tracked lastVisitAt from EmotionalDashboardState
  // instead of per-device localStorage
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

// ─── Main: Get Emotional Dashboard Snapshot ─

export async function getEmotionalDashboardSnapshot(
  userId: string,
): Promise<EmotionalDashboardSnapshot> {
  const state = await getOrCreateState(userId);
  const dateKey = getTodayDateKey();

  // ─── 1. Reflection ───
  let reflectionState: ReflectionState;
  try {
    reflectionState = JSON.parse(state.reflectionState);
    // Validate
    if (
      typeof reflectionState.currentIndex !== 'number' ||
      reflectionState.currentIndex < 0 ||
      reflectionState.currentIndex >= REFLECTIONS.length ||
      !Array.isArray(reflectionState.shown)
    ) {
      reflectionState = {
        currentIndex: selectDeterministicReflection(userId, dateKey, 0, []),
        visitCount: 0,
        shown: [],
        recent: [],
        visitTotal: 0,
      };
    }
  } catch {
    reflectionState = {
      currentIndex: selectDeterministicReflection(userId, dateKey, 0, []),
      visitCount: 0,
      shown: [],
      recent: [],
      visitTotal: 0,
    };
  }

  // Check if we already advanced for this visit
  // (avoid double-advancing on multiple device loads within same second)
  const timeSinceLastVisit = Date.now() - state.lastVisitAt.getTime();
  const MIN_VISIT_INTERVAL = 5 * 60 * 1000; // 5 minutes minimum between visit advances

  let reflectionResult;
  if (timeSinceLastVisit < MIN_VISIT_INTERVAL) {
    // Same visit — don't advance, just return current state
    const isSilent = reflectionState.visitTotal > 2 && shouldSilence(reflectionState.visitTotal);
    const currentIsDeep = isDeepReflection(reflectionState.currentIndex);
    reflectionResult = {
      ...reflectionState,
      isSilent,
      text: isSilent ? '' : REFLECTIONS[reflectionState.currentIndex].text,
      isDeep: currentIsDeep,
    };
  } else {
    // New visit — advance the reflection
    reflectionResult = computeReflectionState(reflectionState, userId, dateKey);
  }

  // ─── 2. Silent Memory ───
  // Fetch server data for observations
  let memoryResult: { memory: SilentMemory | null; updatedState: MemoryState } = {
    memory: null,
    updatedState: { lastShown: { return: null, recurrence: null, shift: null, presence: null, temporal: null }, shown: [] },
  };

  try {
    // Import dynamically to avoid circular deps
    const { getSilentMemoryData } = await import('./silent-memories');
    const serverData = await getSilentMemoryData(userId);

    let memState: MemoryState;
    try {
      memState = JSON.parse(state.memoryState);
      if (!memState.lastShown || !Array.isArray(memState.shown)) {
        memState = { lastShown: { return: null, recurrence: null, shift: null, presence: null, temporal: null }, shown: [] };
      }
    } catch {
      memState = { lastShown: { return: null, recurrence: null, shift: null, presence: null, temporal: null }, shown: [] };
    }

    memoryResult = selectSilentMemory(memState, serverData, userId, state.lastVisitAt);
  } catch {
    // If memory computation fails, that's fine — silence
  }

  // ─── 3. Persist updated state ───
  const updatedReflectionState: ReflectionState = {
    currentIndex: reflectionResult.currentIndex,
    visitCount: reflectionResult.visitCount,
    shown: reflectionResult.shown,
    recent: reflectionResult.recent,
    visitTotal: reflectionResult.visitTotal,
  };

  await db.emotionalDashboardState.upsert({
    where: { userId },
    update: {
      reflectionState: JSON.stringify(updatedReflectionState),
      memoryState: JSON.stringify(memoryResult.updatedState),
      lastVisitAt: new Date(),
      dateKey,
    },
    create: {
      userId,
      reflectionState: JSON.stringify(updatedReflectionState),
      memoryState: JSON.stringify(memoryResult.updatedState),
      lastVisitAt: new Date(),
      dateKey,
    },
  });

  return {
    reflection: reflectionResult.isSilent
      ? null
      : {
          text: reflectionResult.text,
          isDeep: reflectionResult.isDeep,
          isSilent: false,
        },
    silentMemory: memoryResult.memory,
  };
}

// ─── Tips: Server-Side Deterministic Date-Based Rotation ─
//
// The position is computed from the date — NOT stored in DB state.
// This eliminates all rotation bugs caused by:
//   - Write race conditions (emotional snapshot + tips writing concurrently)
//   - Lost state (server restarts, DB errors, corrupted JSON)
//   - cycleStart drift (timezone, server clock differences)
//
// How it works:
//   - cycleIndex = floor(daysSinceEpoch / 3) — changes every 3 days
//   - For each cycleIndex, a deterministic shuffle is produced
//     from seed = userId:empire:cycleIndex
//   - FREE position = (cycleIndex * 2) % freeCount within that shuffle
//   - PREMIUM position = cycleIndex % premiumCount within that shuffle
//
// Same userId + same date = same tips everywhere. No state needed for position.
// State is only persisted for recentFree/recentPremium (avoid-recent tracking).

// Reference epoch: 2025-01-01 (a fixed date so cycleIndex is predictable)
const TIPS_EPOCH = new Date('2025-01-01T00:00:00Z').getTime();
const CYCLE_DAYS = 3; // Tips rotate every 3 days

export async function getDeterministicTips(
  userId: string,
  empire: string,
  allTips: { id: string; title: string; content: string; plan: string }[],
) {
  if (allTips.length === 0) return { freeTips: [], premiumTips: [] };

  const freeTipsAll = allTips.filter(t => t.plan !== 'PREMIUM');
  const premiumTipsAll = allTips.filter(t => t.plan === 'PREMIUM');
  const freeCount = freeTipsAll.length;
  const premiumCount = premiumTipsAll.length;

  // ─── Compute cycle index from date ───
  // cycleIndex increments every 3 days since epoch.
  // Same date on any device = same cycleIndex = same tips.
  const daysSinceEpoch = Math.floor((Date.now() - TIPS_EPOCH) / 86400000);
  const cycleIndex = Math.floor(daysSinceEpoch / CYCLE_DAYS);

  // ─── Deterministic shuffle for this cycle ───
  // Each cycleIndex produces a unique shuffle order.
  // With 50 FREE tips and 3-day cycles, we get 25 unique cycles
  // before wrapping — enough variety for 75 days before repeating.
  const freeOrder = deterministicShuffle(freeCount, `${userId}:${empire}:${cycleIndex}:free`);
  const premiumOrder = deterministicShuffle(premiumCount, `${userId}:${empire}:${cycleIndex}:premium`);

  // ─── Select FREE tips — ALWAYS exactly 2 ───
  // Position within the shuffled order: advances 2 per cycle.
  // Wraps around when it reaches the end.
  const selectedFree: typeof allTips = [];
  if (freeCount > 0) {
    const basePosition = (cycleIndex * FREE_TIPS_VISIBLE) % freeCount;
    const needed = Math.min(FREE_TIPS_VISIBLE, freeCount);
    for (let i = 0; i < needed; i++) {
      const pos = (basePosition + i) % freeCount;
      const idx = freeOrder[pos];
      if (idx !== undefined && freeTipsAll[idx]) {
        selectedFree.push(freeTipsAll[idx]);
      }
    }
  }

  // ─── Select PREMIUM tip — ALWAYS exactly 1 ───
  // From the ÉLITE-only battery. Never mixed with FREE.
  // Advances 1 per cycle.
  const selectedPremium: typeof allTips = [];
  if (premiumCount > 0) {
    const pos = cycleIndex % premiumCount;
    const idx = premiumOrder[pos];
    if (idx !== undefined && premiumTipsAll[idx]) {
      selectedPremium.push(premiumTipsAll[idx]);
    }
  }

  return { freeTips: selectedFree, premiumTips: selectedPremium };
}
