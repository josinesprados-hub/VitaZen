'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

// ═══════════════════════════════════════════
// Screenshot Mode — Premium demo layer
// ═══════════════════════════════════════════
//
// Activated ONLY via ?screenshot=true query param.
// Never active by default. Zero impact on production.
//
// Provides:
//   - useScreenshotMode() → { isActive: boolean }
//
// Components check this to:
//   - Skip API calls and render mock premium data
//   - Hide banners, empty states, loading skeletons
//   - Show coherent, premium-looking demo states
//
// Does NOT:
//   - Fake auth, payments, or premium entitlement
//   - Modify backend data or Prisma
//   - Persist any state
//   - Affect normal users

interface ScreenshotModeValue {
  /** Whether screenshot mode is active (only via ?screenshot=true) */
  isActive: boolean;
}

const ScreenshotModeContext = createContext<ScreenshotModeValue>({
  isActive: false,
});

const PARAM_NAME = 'screenshot';
const PARAM_VALUE = 'true';

/**
 * Detects ?screenshot=true in the current URL.
 * Uses useMemo so it's stable across renders within the same page load.
 * Client-only (window is not available during SSR, but this is a client component).
 */
function detectScreenshotMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(PARAM_NAME) === PARAM_VALUE;
  } catch {
    return false;
  }
}

export function ScreenshotModeProvider({ children }: { children: ReactNode }) {
  const isActive = useMemo(() => detectScreenshotMode(), []);

  const value = useMemo(() => ({ isActive }), [isActive]);

  return (
    <ScreenshotModeContext.Provider value={value}>
      {children}
    </ScreenshotModeContext.Provider>
  );
}

/**
 * Hook to check if screenshot mode is active.
 * Returns { isActive: boolean }.
 *
 * Usage:
 *   const { isActive } = useScreenshotMode();
 *   if (isActive) { /* use mock data *\/ }
 */
export function useScreenshotMode(): ScreenshotModeValue {
  return useContext(ScreenshotModeContext);
}
