'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';

// ═══════════════════════════════════════════
// useEmpireTips — stable tip rotation
// ═══════════════════════════════════════════
//
// Single source of truth: the server.
// No Math.random(). No localStorage.
// The server decides the tip order and rotation,
// all devices show the same tips.
//
// Rules:
//   - FREE users: always 2 FREE tips
//   - ÉLITE users: always 2 FREE + 1 PREMIUM
//   - Tips rotate every 3 days (server-side)
//   - No disappearance. No silence. No hiding.

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
  /** Loading state */
  loading: boolean;
}

export function useEmpireTips(empire: string): EmpireTipsResult {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const isPremium = user?.plan === 'PREMIUM';

  const [freeTips, setFreeTips] = useState<Tip[]>([]);
  const [premiumTips, setPremiumTips] = useState<Tip[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTips = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/empire/tips?empire=${empire}`);
      if (res.ok) {
        const data = await res.json();

        // ─── Priority 1: Server-side rotated tips ───
        // The server returns rotatedFreeTips and rotatedPremiumTips
        // which are already filtered by plan (FREE battery / PREMIUM battery).
        const hasRotatedFree = Array.isArray(data.rotatedFreeTips) && data.rotatedFreeTips.length > 0;
        const hasRotatedPremium = Array.isArray(data.rotatedPremiumTips) && data.rotatedPremiumTips.length > 0;

        if (hasRotatedFree) {
          setFreeTips(data.rotatedFreeTips.slice(0, 2)); // Always exactly 2 FREE
        }

        if (hasRotatedPremium) {
          setPremiumTips(data.rotatedPremiumTips.slice(0, 1)); // Always exactly 1 PREMIUM
        }

        // ─── Priority 2: Fallback from raw tips ───
        // If server rotation didn't return results, use raw tips with client-side filtering.
        // This ensures tips ALWAYS render even if rotation logic has an edge case.
        if (!hasRotatedFree || !hasRotatedPremium) {
          const allTips: Tip[] = data.tips || [];

          if (!hasRotatedFree && allTips.length > 0) {
            const freeFromRaw = allTips.filter(t => t.plan !== 'PREMIUM').slice(0, 2);
            setFreeTips(freeFromRaw);
          }

          if (!hasRotatedPremium && allTips.length > 0) {
            const premiumFromRaw = allTips.filter(t => t.plan === 'PREMIUM').slice(0, 1);
            setPremiumTips(premiumFromRaw);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching tips:', error);
      // Don't clear existing tips on error — keep showing what we have
    } finally {
      setLoading(false);
    }
  }, [empire, apiFetch]);

  useEffect(() => {
    fetchTips();
  }, [fetchTips]);

  return {
    freeTips,
    premiumTips,
    isPremium,
    loading,
  };
}
