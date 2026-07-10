'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_FROZEN_TIPS } from '@/lib/screenshot-data';

// ═══════════════════════════════════════════
// useEmpireTips — stable tip rotation
// ═══════════════════════════════════════════
//
// Single source of truth: the server.
// No Math.random(). No localStorage.
//
// Rules:
//   - FREE users: always 2 FREE tips
//   - ÉLITE users: always 2 FREE + 1 PREMIUM
//   - Tips rotate every 3 days (server-side)
//   - No disappearance. No silence. No hiding.
//
// Screenshot mode:
//   - Uses frozen tips from SCREENSHOT_FROZEN_TIPS
//   - Same tips every time for consistent screenshots
//   - No API calls, no auth dependency, no loading state
//
// Safety:
//   - Loading always resolves (max 8s timeout)
//   - Retry once on API failure
//   - Never stuck in loading forever

export interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
}

export interface EmpireTipsResult {
  /** Current FREE tips to display (always 2) */
  freeTips: Tip[];
  /** Current PREMIUM tips (1 for ÉLITE, 0 for FREE) */
  premiumTips: Tip[];
  /** Whether user is premium */
  isPremium: boolean;
  /** Loading state — guaranteed to resolve */
  loading: boolean;
  /** Whether the fetch failed */
  error: boolean;
}

const MAX_LOADING_MS = 8000; // Safety: loading always resolves within 8s

export function useEmpireTips(empire: string): EmpireTipsResult {
  const { apiFetch } = useApi();
  const { user, firebaseUser } = useAuth();
  const { isActive: screenshotMode } = useScreenshotMode();
  const isPremium = screenshotMode ? true : (user?.plan === 'PREMIUM');

  const [freeTips, setFreeTips] = useState<Tip[]>([]);
  const [premiumTips, setPremiumTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  // ── Screenshot mode: use frozen tips, skip API ──
  useEffect(() => {
    if (!screenshotMode) return;

    const frozen = SCREENSHOT_FROZEN_TIPS[empire];
    if (frozen) {
      setFreeTips(
        frozen.freeTips.map((t, i) => ({
          id: `frozen-free-${empire}-${i}`,
          title: t.title,
          content: t.content,
          plan: 'FREE',
        }))
      );
      setPremiumTips(
        frozen.premiumTips.map((t, i) => ({
          id: `frozen-premium-${empire}-${i}`,
          title: t.title,
          content: t.content,
          plan: 'PREMIUM',
        }))
      );
    }
    setLoading(false);
    setError(false);
  }, [empire, screenshotMode]);

  const fetchTips = useCallback(async () => {
    if (screenshotMode) return; // Already handled above

    try {
      const res = await apiFetch(`/api/empire/tips?empire=${empire}`);

      if (!mountedRef.current) return;

      if (res.ok) {
        const data = await res.json();

        // ─── Server-side rotated tips (primary) ───
        const hasRotatedFree = Array.isArray(data.rotatedFreeTips) && data.rotatedFreeTips.length > 0;
        const hasRotatedPremium = Array.isArray(data.rotatedPremiumTips) && data.rotatedPremiumTips.length > 0;

        if (hasRotatedFree) {
          setFreeTips(data.rotatedFreeTips.slice(0, 2));
        }

        if (hasRotatedPremium) {
          setPremiumTips(data.rotatedPremiumTips.slice(0, 1));
        }

        // ─── Fallback: raw tips with client-side filtering ───
        if (!hasRotatedFree || !hasRotatedPremium) {
          const allTips: Tip[] = data.tips || [];

          if (!hasRotatedFree && allTips.length > 0) {
            setFreeTips(allTips.filter(t => t.plan !== 'PREMIUM').slice(0, 2));
          }

          if (!hasRotatedPremium && allTips.length > 0) {
            setPremiumTips(allTips.filter(t => t.plan === 'PREMIUM').slice(0, 1));
          }
        }

        setError(false);
      } else {
        // API returned error status — retry once after delay
        console.warn(`[Tips] API returned ${res.status} for empire=${empire}`);

        // Wait and retry once
        await new Promise(r => setTimeout(r, 2000));
        if (!mountedRef.current) return;

        const retryRes = await apiFetch(`/api/empire/tips?empire=${empire}`);
        if (retryRes.ok) {
          const data = await retryRes.json();
          const hasRotatedFree = Array.isArray(data.rotatedFreeTips) && data.rotatedFreeTips.length > 0;
          const hasRotatedPremium = Array.isArray(data.rotatedPremiumTips) && data.rotatedPremiumTips.length > 0;

          if (hasRotatedFree) {
            setFreeTips(data.rotatedFreeTips.slice(0, 2));
          }
          if (hasRotatedPremium) {
            setPremiumTips(data.rotatedPremiumTips.slice(0, 1));
          }

          if (!hasRotatedFree || !hasRotatedPremium) {
            const allTips: Tip[] = data.tips || [];
            if (!hasRotatedFree && allTips.length > 0) {
              setFreeTips(allTips.filter(t => t.plan !== 'PREMIUM').slice(0, 2));
            }
            if (!hasRotatedPremium && allTips.length > 0) {
              setPremiumTips(allTips.filter(t => t.plan === 'PREMIUM').slice(0, 1));
            }
          }
          setError(false);
        } else {
          setError(true);
        }
      }
    } catch (err) {
      console.error('[Tips] Fetch error:', err);
      setError(true);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [empire, apiFetch, screenshotMode]);

  useEffect(() => {
    if (screenshotMode) return; // Already handled above

    mountedRef.current = true;

    // Only fetch when we have Firebase auth confirmed
    if (!firebaseUser) return;

    fetchTips();

    // Safety: force loading=false after MAX_LOADING_MS no matter what
    const timeout = setTimeout(() => {
      if (mountedRef.current) {
        setLoading(false);
      }
    }, MAX_LOADING_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(timeout);
    };
  }, [fetchTips, firebaseUser, screenshotMode]);

  return {
    freeTips,
    premiumTips,
    isPremium,
    loading,
    error,
  };
}
