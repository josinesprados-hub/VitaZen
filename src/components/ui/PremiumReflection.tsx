'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { REFLECTIONS } from '@/lib/reflections';

// ═══════════════════════════════════════════
// PremiumReflection — rotating reflections
// ═══════════════════════════════════════════
//
// - Shows one reflection at a time
// - Auto-rotates every ~80 seconds with fade
// - Changes when returning to dashboard
// - Never repeats until full collection traversed
// - Persists index in localStorage
// - Avoids hydration mismatch (client-only init)
// - No external APIs, no new libraries

const STORAGE_KEY = 'vitazen_reflection_state';
const ROTATE_INTERVAL = 80000;
const FADE_DURATION = 600;

interface ReflectionState {
  /** Index within the shuffled order */
  position: number;
  /** Shuffled indices — guarantees no repeat until full cycle */
  order: number[];
}

/**
 * Fisher-Yates shuffle (deterministic given a seed).
 * Returns a new array of indices 0..n-1 in random order.
 */
function shuffledOrder(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Load persisted state or create a fresh one.
 */
function loadState(): ReflectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ReflectionState;
      // Validate: order must match current collection length
      if (parsed.order && parsed.order.length === REFLECTIONS.length && parsed.position < parsed.order.length) {
        return parsed;
      }
    }
  } catch {
    // localStorage unavailable or corrupt — start fresh
  }
  return freshState();
}

function freshState(): ReflectionState {
  return {
    position: 0,
    order: shuffledOrder(REFLECTIONS.length),
  };
}

function saveState(state: ReflectionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export default function PremiumReflection() {
  const [visible, setVisible] = useState(false);
  const [reflection, setReflection] = useState('');
  const stateRef = useRef<ReflectionState | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const advance = useCallback((withFade = true) => {
    if (!stateRef.current) return;

    const state = stateRef.current;
    const nextPos = state.position + 1;

    // Cycle: if we've shown all, reshuffle
    if (nextPos >= state.order.length) {
      state.order = shuffledOrder(REFLECTIONS.length);
      state.position = 0;
    } else {
      state.position = nextPos;
    }

    saveState(state);

    const nextIdx = state.order[state.position];
    const nextText = REFLECTIONS[nextIdx];

    if (withFade) {
      setVisible(false);
      setTimeout(() => {
        setReflection(nextText);
        setVisible(true);
      }, FADE_DURATION);
    } else {
      setReflection(nextText);
      setVisible(true);
    }
  }, []);

  // Initialize on mount (client-only, avoids hydration mismatch)
  useEffect(() => {
    const state = loadState();

    // Advance on every visit (change when returning to dashboard)
    // If position is 0 from a fresh state, show the first one without advancing
    const isFirstVisit = !localStorage.getItem(STORAGE_KEY);
    if (!isFirstVisit) {
      const nextPos = state.position + 1;
      if (nextPos >= state.order.length) {
        state.order = shuffledOrder(REFLECTIONS.length);
        state.position = 0;
      } else {
        state.position = nextPos;
      }
    }

    stateRef.current = state;
    saveState(state);

    const idx = state.order[state.position];
    setReflection(REFLECTIONS[idx]);

    // Small delay before showing for a smooth entrance
    const showTimer = setTimeout(() => setVisible(true), 300);

    // Auto-rotate every ~80 seconds
    intervalRef.current = setInterval(() => advance(true), ROTATE_INTERVAL);

    return () => {
      clearTimeout(showTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [advance]);

  if (!reflection) return null;

  return (
    <div className="flex justify-center py-2 sm:py-6">
      <p
        className={`text-center text-[#c8a55a]/90 text-sm sm:text-lg font-light italic tracking-wide max-w-2xl transition-opacity duration-500 px-4 select-none ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        «{reflection}»
      </p>
    </div>
  );
}
