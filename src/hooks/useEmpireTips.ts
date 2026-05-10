'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';

// ═══════════════════════════════════════════
// useEmpireTips — 72h stable tip rotation
// ═══════════════════════════════════════════
//
// - Rotates tips every 72 hours (3 days)
// - No repeat until full dataset traversed
// - Persists state in localStorage
// - Separates FREE and PREMIUM tips
// - Stable between renders/sessions
// - No Math.random() in render path

const STORAGE_PREFIX = 'vitazen_tips_';
const CYCLE_MS = 72 * 60 * 60 * 1000; // 72 hours in ms
const FREE_TIPS_VISIBLE = 2;

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
}

/**
 * Fisher-Yates shuffle — returns a new shuffled array of indices.
 * Only called during cycle creation (never in render).
 */
function shuffledIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
 * Advance the cycle if 72h have passed.
 * Returns the (possibly updated) state and the current set of tips.
 */
function advanceIfExpired(
  state: TipCycleState,
  freeCount: number,
  premiumCount: number,
): TipCycleState {
  const now = Date.now();
  const elapsed = now - state.cycleStart;

  if (elapsed < CYCLE_MS) return state; // Still within 72h — same set

  // 72h passed — advance positions
  const newState = { ...state };

  // Advance FREE position by FREE_TIPS_VISIBLE
  newState.freePosition += FREE_TIPS_VISIBLE;
  if (newState.freePosition >= freeCount) {
    // All FREE tips shown — reshuffle and restart
    newState.freeOrder = shuffledIndices(freeCount);
    newState.freePosition = 0;
  }

  // Advance PREMIUM position by 1 (show 1 new premium hint per cycle)
  newState.premiumPosition += 1;
  if (newState.premiumPosition >= premiumCount) {
    // All PREMIUM tips shown — reshuffle and restart
    newState.premiumOrder = shuffledIndices(premiumCount);
    newState.premiumPosition = 0;
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

    // Load or create cycle state (read-only in render)
    let state = loadCycleState(empire, freeCount, premiumCount);

    // Advance if 72h have passed
    const newState = advanceIfExpired(state, freeCount, premiumCount);
    const changed = newState !== state;

    state = newState;
    stateRef.current = state;
    // NOTE: saveCycleState is deferred to useEffect below to avoid
    // side effects (localStorage write) during render.

    // Select FREE tips from shuffled order
    const selectedFree: Tip[] = [];
    for (let i = 0; i < Math.min(FREE_TIPS_VISIBLE, freeCount); i++) {
      const idx = state.freeOrder[(state.freePosition + i) % freeCount];
      if (idx !== undefined && freeTipsAll[idx]) {
        selectedFree.push(freeTipsAll[idx]);
      }
    }

    // Select PREMIUM tips — show all from current position onwards (or just the next one)
    const selectedPremium: Tip[] = [];
    if (premiumCount > 0) {
      // Show the current premium tip(s) in the cycle
      const startIdx = state.premiumOrder[state.premiumPosition % premiumCount];
      if (startIdx !== undefined && premiumTipsAll[startIdx]) {
        selectedPremium.push(premiumTipsAll[startIdx]);
      }
    }

    return { freeTips: selectedFree, premiumTips: selectedPremium, changed };
  }, [allTips, empire]);

  // Use ref to avoid re-computing on every render
  const tipsResult = computeTips();

  // Persist cycle state changes after render commit (avoids side effects during render)
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
