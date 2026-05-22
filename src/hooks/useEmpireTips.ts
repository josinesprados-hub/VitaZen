'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';

// ═══════════════════════════════════════════
// useEmpireTips — contemplative tip rotation
// ═══════════════════════════════════════════
//
// Single source of truth: the server.
// No Math.random(). No localStorage.
// The server decides the tip order and rotation,
// all devices show the same tips.
//
// Rarity and cycle timing are still preserved —
// they're tracked server-side with the same rules.

export interface Tip {
  id: string;
  title: string;
  content: string;
  plan: string;
}

export interface EmpireTipsResult {
  /** Current FREE tips to display (rotated server-side) */
  freeTips: Tip[];
  /** Current PREMIUM tips (rotated server-side) */
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

        // Use server-side rotated tips when available AND non-empty.
        // NOTE: JavaScript empty arrays [] are truthy, so we must
        // explicitly check for Array.isArray + length to avoid setting
        // empty arrays when the fallback (data.tips) has real data.
        const hasRotatedFree = Array.isArray(data.rotatedFreeTips) && data.rotatedFreeTips.length > 0;
        const hasRotatedPremium = Array.isArray(data.rotatedPremiumTips) && data.rotatedPremiumTips.length > 0;

        if (hasRotatedFree || hasRotatedPremium) {
          setFreeTips(hasRotatedFree ? data.rotatedFreeTips : []);
          setPremiumTips(hasRotatedPremium ? data.rotatedPremiumTips : []);
        } else {
          // Fallback: use raw tips (backwards compatibility / empty rotation)
          const allTips: Tip[] = data.tips || [];
          setFreeTips(allTips.filter(t => t.plan !== 'PREMIUM').slice(0, 2));
          setPremiumTips(allTips.filter(t => t.plan === 'PREMIUM').slice(0, 1));
        }
      }
    } catch (error) {
      console.error('Error fetching tips:', error);
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
