'use client';

import { createContext, useContext, useMemo, useEffect, type ReactNode } from 'react';
import { useAuth, type UserData } from '@/context/AuthContext';
import { SCREENSHOT_USER } from '@/lib/screenshot-data';

// ═══════════════════════════════════════════
// Screenshot Mode — Premium editorial layer
// ═══════════════════════════════════════════
//
// Activated ONLY via ?screenshot=true query param.
// Never active by default. Zero impact on production.
//
// Query params:
//   ?screenshot=true              → activate screenshot mode
//   ?screenshot=true&device=mobile   → mobile layout variant
//   ?screenshot=true&device=desktop  → desktop layout variant
//
// Provides:
//   - isActive: boolean — whether screenshot mode is active
//   - device: 'mobile' | 'desktop' | null — device variant
//   - hideTransient: boolean — always true when active, for CSS class
//   - displayUser: UserData — editorial user in screenshot mode, real user otherwise
//
// Components check this to:
//   - Skip API calls and render frozen demo data
//   - Hide banners, toasts, loaders, skeletons, debug
//   - Show coherent, premium-looking editorial states
//   - Freeze rotations (tips, reflections, memories)
//
// Does NOT:
//   - Fake auth, payments, or premium entitlement
//   - Modify backend data or Prisma
//   - Persist any state
//   - Affect normal users
//   - Replace the real Firebase user — only overrides VISUAL display data

export type ScreenshotDevice = 'mobile' | 'desktop';

interface ScreenshotModeValue {
  /** Whether screenshot mode is active (only via ?screenshot=true) */
  isActive: boolean;
  /** Device variant for layout control */
  device: ScreenshotDevice | null;
  /** Whether to hide transient UI elements (always true when active) */
  hideTransient: boolean;
  /** Visual user identity: screenshot user when active, real user otherwise */
  displayUser: UserData | null;
}

const ScreenshotModeContext = createContext<ScreenshotModeValue>({
  isActive: false,
  device: null,
  hideTransient: false,
  displayUser: null,
});

/**
 * Parse screenshot query params from current URL.
 * Robust parser: handles malformed URLs, extra params, etc.
 */
function parseScreenshotParams(): { active: boolean; device: ScreenshotDevice | null } {
  if (typeof window === 'undefined') return { active: false, device: null };
  try {
    const params = new URLSearchParams(window.location.search);
    const active = params.get('screenshot') === 'true';
    if (!active) return { active: false, device: null };

    const deviceParam = params.get('device');
    let device: ScreenshotDevice | null = null;
    if (deviceParam === 'mobile' || deviceParam === 'desktop') {
      device = deviceParam;
    } else if (!deviceParam) {
      // Auto-detect from viewport width
      device = window.innerWidth < 768 ? 'mobile' : 'desktop';
    }

    return { active: true, device };
  } catch {
    return { active: false, device: null };
  }
}

export function ScreenshotModeProvider({ children }: { children: ReactNode }) {
  const parsed = useMemo(() => parseScreenshotParams(), []);
  const { user } = useAuth();

  // Build displayUser: editorial identity when screenshot mode, real user otherwise
  const displayUser = useMemo<UserData | null>(() => {
    if (parsed.active) {
      return SCREENSHOT_USER as UserData;
    }
    return user;
  }, [parsed.active, user]);

  const value = useMemo<ScreenshotModeValue>(() => ({
    isActive: parsed.active,
    device: parsed.device,
    hideTransient: parsed.active,
    displayUser,
  }), [parsed.active, parsed.device, displayUser]);

  // Add/remove body class for global CSS rules
  useEffect(() => {
    if (parsed.active) {
      document.body.classList.add('screenshot-mode');
      if (parsed.device) {
        document.body.classList.add(`screenshot-${parsed.device}`);
      }
    }
    return () => {
      document.body.classList.remove('screenshot-mode', 'screenshot-mobile', 'screenshot-desktop');
    };
  }, [parsed.active, parsed.device]);

  return (
    <ScreenshotModeContext.Provider value={value}>
      {children}
    </ScreenshotModeContext.Provider>
  );
}

/**
 * Hook to check screenshot mode state and get display user.
 * Returns { isActive, device, hideTransient, displayUser }.
 *
 * Usage:
 *   const { isActive, displayUser } = useScreenshotMode();
 *   // displayUser.name → 'Elena' in screenshot mode, real name otherwise
 */
export function useScreenshotMode(): ScreenshotModeValue {
  return useContext(ScreenshotModeContext);
}

/**
 * Standalone helper — can be used outside React components.
 * Reads from URL directly. Not reactive.
 */
export function isScreenshotMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('screenshot') === 'true';
  } catch {
    return false;
  }
}
