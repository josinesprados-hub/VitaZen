'use client';

import { useEffect, useState, useRef } from 'react';
import { REFLECTIONS, selectWeightedReflection, isDeepReflection } from '@/lib/reflections';
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
// - Deep reflections stay for 2 visits (not 1)
// - Weighted selection: light 50%, relevant 35%, deep 15%
// - Persists state in localStorage
// - Avoids hydration mismatch (client-only init)

const STORAGE_KEY = 'vitazen_reflection_state';
const FADE_DURATION = 600;

interface ReflectionState {
  /** Current reflection index in REFLECTIONS array */
  currentIndex: number;
  /** Visit count for current reflection (deep ones stay 2 visits) */
  visitCount: number;
  /** Already-shown indices — no repeat until full cycle */
  shown: number[];
  /** Last N indices — avoid close repetition after cycle reset */
  recent: number[];
}

/**
 * Load persisted state or create a fresh one.
 */
function loadState(): ReflectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ReflectionState;
      // Validate: must have valid index
      if (
        typeof parsed.currentIndex === 'number' &&
        parsed.currentIndex >= 0 &&
        parsed.currentIndex < REFLECTIONS.length &&
        Array.isArray(parsed.shown)
      ) {
        return parsed;
      }
    }
  } catch {
    // localStorage unavailable or corrupt — start fresh
  }
  return freshState();
}

function freshState(): ReflectionState {
  // First reflection: weighted selection
  const index = selectWeightedReflection([]);
  return {
    currentIndex: index,
    visitCount: 0,
    shown: [index],
    recent: [index],
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
  const [isDeep, setIsDeep] = useState(false);
  const stateRef = useRef<ReflectionState | null>(null);

  // Initialize on mount (client-only, avoids hydration mismatch)
  useEffect(() => {
    // ── Screenshot mode: use fixed premium reflection ──
    if (screenshotMode) {
      setReflection(SCREENSHOT_REFLECTION);
      setVisible(true);
      return;
    }

    const state = loadState();

    // Advance on every visit
    // If visitCount < required visits, keep the same reflection
    const currentIsDeep = isDeepReflection(state.currentIndex);
    const requiredVisits = currentIsDeep ? 2 : 1;

    if (state.visitCount < requiredVisits - 1) {
      // Stay on current reflection for one more visit
      state.visitCount++;
      stateRef.current = state;
      saveState(state);
      setReflection(REFLECTIONS[state.currentIndex].text);
      setIsDeep(currentIsDeep);
      setVisible(true);
      return;
    }

    // Time to advance to a new reflection
    const isFirstVisit = !localStorage.getItem(STORAGE_KEY);
    if (isFirstVisit) {
      // Fresh state: show first reflection without advancing
      state.visitCount = 0;
    } else {
      // Select next reflection using weighted system, avoiding recently shown
      const excludeIndices = state.recent;
      const newIndex = selectWeightedReflection(excludeIndices);

      state.currentIndex = newIndex;
      state.visitCount = 0;
      state.shown = [...state.shown, newIndex];

      // Track recent (last 10 to avoid close repetition)
      state.recent = [...state.recent, newIndex].slice(-10);

      // Check if we've shown most reflections — reset cycle
      if (state.shown.length >= REFLECTIONS.length - 5) {
        state.shown = state.recent.slice(-5);
      }
    }

    stateRef.current = state;
    saveState(state);

    const newIsDeep = isDeepReflection(state.currentIndex);
    setReflection(REFLECTIONS[state.currentIndex].text);
    setIsDeep(newIsDeep);
    setVisible(true);
  }, [screenshotMode]);

  if (!reflection) {
    // Minimal placeholder — silence, not a loading state
    return <div className="py-2 sm:py-6 h-8 sm:h-12 flex items-center justify-center"><div className="h-2 w-16 rounded-full bg-[#c8a55a]/10 gentle-pulse" /></div>;
  }

  return (
    <div className="flex justify-center py-3 sm:py-8">
      <p
        className={`text-center text-[#c8a55a]/70 text-sm sm:text-lg font-light italic tracking-wide max-w-xl transition-opacity duration-700 px-4 select-none leading-relaxed ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        «{reflection}»
      </p>
    </div>
  );
}
