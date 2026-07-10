'use client';

import { useEffect, useState, useCallback } from 'react';

// ═══════════════════════════════════════════
// useProgressiveDisclosure — progressive help
// ═══════════════════════════════════════════
//
// Inspired by Notion, Headspace, Arc:
//   - Full help on first visit
//   - Compact hint icon on visits 2-5
//   - Hidden (but re-accessible) on visit 6+
//
// Each section tracks its own visit count and
// dismissed level in localStorage. The user
// can always re-open hints from a subtle icon.
//
// Levels:
//   1 = full  (banner with title + text + dismiss)
//   2 = compact (small info icon, tooltip on hover/focus)
//   3 = hidden (nothing visible, accessible via help icon)
//
// Storage format per key:
//   { v: number, d: number }
//   v = visit count, d = highest dismissed level (0=never)

const STORAGE_PREFIX = 'vitazen_pd_';

interface PDState {
  level: 1 | 2 | 3;
  visits: number;
  dismissedLevel: number;
}

interface PDActions {
  /** Current visibility level (1=full, 2=compact, 3=hidden) */
  level: 1 | 2 | 3;
  /** Total visits to this section */
  visits: number;
  /** Dismiss from current level to next */
  dismiss: () => void;
  /** Re-show at full level (e.g., user clicked help icon) */
  reshown: () => void;
  /** Whether client has hydrated (for SSR safety) */
  ready: boolean;
}

function readState(key: string): { visits: number; dismissedLevel: number } {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        visits: typeof parsed.v === 'number' ? parsed.v : 0,
        dismissedLevel: typeof parsed.d === 'number' ? parsed.d : 0,
      };
    }
  } catch {
    // localStorage unavailable
  }
  return { visits: 0, dismissedLevel: 0 };
}

function writeState(key: string, visits: number, dismissedLevel: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ v: visits, d: dismissedLevel }));
  } catch {
    // ignore
  }
}

function computeLevel(visits: number, dismissedLevel: number): 1 | 2 | 3 {
  // If user explicitly dismissed a level, respect that
  if (dismissedLevel >= 2) return 3;
  if (dismissedLevel >= 1) return 2;

  // Otherwise, auto-progression based on visits
  if (visits <= 1) return 1;   // First visit → full
  if (visits <= 5) return 2;   // Visits 2-5 → compact
  return 3;                     // Visit 6+ → hidden
}

export function useProgressiveDisclosure(storageKey: string): PDActions {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<PDState>({
    level: 1,
    visits: 0,
    dismissedLevel: 0,
  });

  // Hydrate from localStorage on mount + increment visit
  useEffect(() => {
    const current = readState(storageKey);
    const newVisits = current.visits + 1;
    const level = computeLevel(newVisits, current.dismissedLevel);

    writeState(storageKey, newVisits, current.dismissedLevel);
    setState({ level, visits: newVisits, dismissedLevel: current.dismissedLevel });
    setReady(true);
  }, [storageKey]);

  const dismiss = useCallback(() => {
    setState(prev => {
      const newDismissed = prev.dismissedLevel + 1;
      // Persist the new dismissed level (visits stay the same)
      const current = readState(storageKey);
      writeState(storageKey, current.visits, newDismissed);

      const level = computeLevel(prev.visits, newDismissed);
      return { ...prev, dismissedLevel: newDismissed, level };
    });
  }, [storageKey]);

  const reshown = useCallback(() => {
    // Reset dismissed level to 0 so it shows at full again
    setState(prev => {
      const current = readState(storageKey);
      writeState(storageKey, current.visits, 0);
      return { ...prev, dismissedLevel: 0, level: 1 };
    });
  }, [storageKey]);

  return {
    level: state.level,
    visits: state.visits,
    dismiss,
    reshown,
    ready,
  };
}
