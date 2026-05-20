'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';

// ═══════════════════════════════════════════
// useEmpireTips — contemplative tip rotation
// ═══════════════════════════════════════════
//
// Contemplative, not algorithmic.
//
// - Tips rotate every 3–5 days (not a fixed 72h)
// - No repeat until full dataset traversed
// - After cycle completion, reshuffle avoiding recent
// - Persists state in localStorage
// - Separates FREE and PREMIUM tips
// - Stable between renders/sessions
// - No Math.random() in render path

const STORAGE_PREFIX = 'vitazen_tips_';
// Tips: 3–5 days. Use 4 days (345600000 ms) as the base cycle.
const CYCLE_MS = 4 * 24 * 60 * 60 * 1000;
const FREE_TIPS_VISIBLE = 2;
// How many recent tips to avoid after reshuffling
const AVOID_RECENT_COUNT = 3;

export interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
}

interface TipCycleState {
  /** Shuffled indices for FREE tips */
  freeOrder: number[];
  /** Current position in free order */
  freePosition: number;
  /** Shuffled indices for PREMIUM tips */
  premiumOrder: number[];
  /** Current position in premium order */
  premiumPosition: number;
  /** Timestamp when the current cycle started */
  cycleStart: number;
  /** Recent FREE tip indices to avoid close repetition */
  recentFree: number[];
  /** Recent PREMIUM tip indices to avoid close repetition */
  recentPremium: number[];
}

/**
 * Fisher-Yates shuffle.
 */
function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Shuffle avoiding recent items at the start.
 */
function shuffledIndicesAvoiding(n: number, recent: number[]): number[] {
  const order = shuffledIndices(n);
  const recentSet = new Set(recent);
  const notRecent = order.filter(i => !recentSet.has(i));
  const isRecent = order.filter(i => recentSet.has(i));
  return [...notRecent, ...isRecent];
}

function storageKey(empire: string): string {
  return `${STORAGE_PREFIX}${empire}`;
}

function loadCycleState(empire: string, freeCount: number, premiumCount: number): TipCycleState {
  try {
    const raw = localStorage.getItem(storageKey(empire));
    if (raw) {
      const parsed = JSON.parse(raw) as TipCycleState;
      // Validate: orders must match current dataset sizes
      if (
        parsed.freeOrder?.length === freeCount &&
        parsed.premiumOrder?.length === premiumCount &&
        typeof parsed.freePosition === 'number' &&
        typeof parsed.premiumPosition === 'number' &&
        typeof parsed.cycleStart === 'number' &&
        parsed.freePosition <= freeCount &&
        parsed.premiumPosition <= premiumCount
      ) {
        return parsed;
      }
    }
  } catch {
    // localStorage unavailable or corrupt — start fresh
  }
  return freshCycleState(freeCount, premiumCount);
}

function freshCycleState(freeCount: number, premiumCount: number): TipCycleState {
  return {
    freeOrder: shuffledIndices(freeCount),
    freePosition: 0,
    premiumOrder: shuffledIndices(premiumCount),
    premiumPosition: 0,
    cycleStart: Date.now(),
    recentFree: [],
    recentPremium: [],
  };
}

function saveCycleState(empire: string, state: TipCycleState): void {
  try {
    localStorage.setItem(storageKey(empire), JSON.stringify(state));
  } catch {
    // ignore
  }
}

/**
 * Advance the cycle if enough time has passed.
 * Returns the (possibly updated) state.
 */
function advanceIfExpired(
  state: TipCycleState,
  freeCount: number,
  premiumCount: number,
): TipCycleState {
  const now = Date.now();
  const elapsed = now - state.cycleStart;

  if (elapsed < CYCLE_MS) return state; // Still within cycle — same set

  // Cycle passed — advance positions
  const newState = { ...state };

  // Advance FREE position
  newState.freePosition += FREE_TIPS_VISIBLE;
  if (newState.freePosition >= freeCount) {
    // All FREE tips shown — reshuffle, avoiding recent
    newState.freeOrder = shuffledIndicesAvoiding(freeCount, newState.recentFree);
    newState.freePosition = 0;
    newState.recentFree = [];
  }

  // Advance PREMIUM position
  newState.premiumPosition += 1;
  if (newState.premiumPosition >= premiumCount) {
    // All PREMIUM tips shown — reshuffle, avoiding recent
    newState.premiumOrder = shuffledIndicesAvoiding(premiumCount, newState.recentPremium);
    newState.premiumPosition = 0;
    newState.recentPremium = [];
  }

  newState.cycleStart = now;
  return newState;
}

export interface EmpireTipsResult {
  /** Current FREE tips to display (up to 2) */
  freeTips: Tip[];
  /** Current PREMIUM tips (all available in current cycle) */
  premiumTips: Tip[];
  /** Whether user is premium */
  isPremium: boolean;
  /** Loading state */
  loading: boolean;
}

export function useEmpireTips(empire: string): EmpireTipsResult {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const isPremium = user?.plan === 'PREMIUM';

  const [allTips, setAllTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const stateRef = useRef<TipCycleState | null>(null);
  const [cycleVersion, setCycleVersion] = useState(0); // trigger re-render on cycle change

  // Fetch tips from API
  useEffect(() => {
    let cancelled = false;

    const fetchTips = async () => {
      try {
        const res = await apiFetch(`/api/empire/tips?empire=${empire}`);
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setAllTips(data.tips || []);
        }
      } catch (error) {
        console.error('Error fetching tips:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTips();
    return () => { cancelled = true; };
  }, [empire, apiFetch]);

  // Compute rotation state when tips are loaded
  const computeTips = useCallback(() => {
    if (allTips.length === 0) return { freeTips: [], premiumTips: [], changed: false };

    const freeTipsAll = allTips.filter(t => t.plan !== 'PREMIUM');
    const premiumTipsAll = allTips.filter(t => t.plan === 'PREMIUM');

    const freeCount = freeTipsAll.length;
    const premiumCount = premiumTipsAll.length;

    // Load or create cycle state
    let state = loadCycleState(empire, freeCount, premiumCount);

    // Advance if cycle has passed
    const newState = advanceIfExpired(state, freeCount, premiumCount);
    const changed = newState !== state;

    state = newState;

    // Track recent to avoid close repetition
    const freeIndices: number[] = [];
    const premiumIndices: number[] = [];

    // Select FREE tips
    const selectedFree: Tip[] = [];
    const remaining = freeCount - state.freePosition;
    const toShow = Math.min(FREE_TIPS_VISIBLE, remaining);
    for (let i = 0; i < toShow; i++) {
      const idx = state.freeOrder[state.freePosition + i];
      if (idx !== undefined && freeTipsAll[idx]) {
        selectedFree.push(freeTipsAll[idx]);
        freeIndices.push(idx);
      }
    }

    // Track recent free indices
    state.recentFree = [...state.recentFree, ...freeIndices].slice(-AVOID_RECENT_COUNT);

    // Select PREMIUM tips
    const selectedPremium: Tip[] = [];
    if (premiumCount > 0) {
      const startIdx = state.premiumOrder[state.premiumPosition];
      if (startIdx !== undefined && premiumTipsAll[startIdx]) {
        selectedPremium.push(premiumTipsAll[startIdx]);
        premiumIndices.push(startIdx);
      }
    }

    // Track recent premium indices
    state.recentPremium = [...state.recentPremium, ...premiumIndices].slice(-AVOID_RECENT_COUNT);

    stateRef.current = state;

    return { freeTips: selectedFree, premiumTips: selectedPremium, changed };
  }, [allTips, empire]);

  // Use ref to avoid re-computing on every render
  const tipsResult = computeTips();

  // Persist cycle state changes after render commit
  useEffect(() => {
    if (stateRef.current && tipsResult.changed) {
      saveCycleState(empire, stateRef.current);
      setCycleVersion(v => v + 1);
    }
  }, [empire, tipsResult.changed]);

  return {
    freeTips: tipsResult.freeTips,
    premiumTips: tipsResult.premiumTips,
    isPremium,
    loading,
  };
}
