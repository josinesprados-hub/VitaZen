'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { REFLECTIONS } from '@/lib/reflections';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_REFLECTION } from '@/lib/screenshot-data';

// ═══════════════════════════════════════════
// PremiumReflection — contemplative rotation
// ═══════════════════════════════════════════
//
// Contemplative, not algorithmic.
//
// - Shows one reflection at a time
// - Changes when returning to dashboard (visit-based)
// - NO auto-rotation — the reflection stays until the user leaves
//   and comes back. A reflection doesn't rotate like a feed.
// - Never repeats until full collection traversed
// - After completing a cycle, reshuffles but avoids
//   the last N shown to prevent close repetition
// - Persists state in localStorage
// - Avoids hydration mismatch (client-only init)

const STORAGE_KEY = 'vitazen_reflection_state';
const FADE_DURATION = 600;
// How many recent reflections to avoid after reshuffling
const AVOID_RECENT_COUNT = 5;

interface ReflectionState {
  /** Index within the shuffled order */
  position: number;
  /** Shuffled indices — guarantees no repeat until full cycle */
  order: number[];
  /** Last N indices shown — to avoid close repetition after reshuffle */
  recent: number[];
}

/**
 * Fisher-Yates shuffle.
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
 * Shuffle that avoids placing recent items at the start.
 * The recent items get pushed towards the end of the shuffle.
 */
function shuffledOrderAvoiding(n: number, recent: number[]): number[] {
  const order = shuffledOrder(n);
  // Move recent items to the end so they won't appear first
  const recentSet = new Set(recent);
  const notRecent = order.filter(i => !recentSet.has(i));
  const isRecent = order.filter(i => recentSet.has(i));
  return [...notRecent, ...isRecent];
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
    recent: [],
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
  const { isActive: screenshotMode } = useScreenshotMode();
  const [visible, setVisible] = useState(false);
  const [reflection, setReflection] = useState('');
  const stateRef = useRef<ReflectionState | null>(null);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize on mount (client-only, avoids hydration mismatch)
  useEffect(() => {
    // ── Screenshot mode: use fixed premium reflection ──
    if (screenshotMode) {
      setReflection(SCREENSHOT_REFLECTION);
      setVisible(true);
      return;
    }

    const state = loadState();

    // Advance on every visit (change when returning to dashboard)
    // If position is 0 from a fresh state, show the first one without advancing
    const isFirstVisit = !localStorage.getItem(STORAGE_KEY);
    if (!isFirstVisit) {
      const nextPos = state.position + 1;
      if (nextPos >= state.order.length) {
        // Completed cycle — reshuffle, avoiding recent
        state.order = shuffledOrderAvoiding(REFLECTIONS.length, state.recent);
        state.position = 0;
        state.recent = [];
      } else {
        state.position = nextPos;
      }
    }

    // Track recent reflections to avoid close repetition
    const currentIdx = state.order[state.position];
    state.recent = [...state.recent, currentIdx].slice(-AVOID_RECENT_COUNT);

    stateRef.current = state;
    saveState(state);

    setReflection(REFLECTIONS[currentIdx]);

    // Show immediately — no artificial delay
    setVisible(true);

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [screenshotMode]);

  if (!reflection) {
    // Minimal placeholder — silence, not a loading state
    return <div className="py-2 sm:py-6 h-8 sm:h-12 flex items-center justify-center"><div className="h-2 w-16 rounded-full bg-[#c8a55a]/10 gentle-pulse" /></div>;
  }

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
