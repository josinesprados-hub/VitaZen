'use client';

import { useEffect, useState, useRef } from 'react';
import { useApi } from '@/hooks/useApi';

// ═══════════════════════════════════════════
// SilentMemory — quiet, rare observation
// ═══════════════════════════════════════════
//
// Single source of truth: the server.
// No localStorage. No client-side rarity tracking.
// The server decides the memory, all devices
// show the same one.
//
// Rarity is still preserved — it's tracked
// server-side with the same interval rules.
//
// IMPORTANT: This component now shares the
// /api/emotional-snapshot response with
// PremiumReflection via the shared context
// in EmotionalHero. No duplicate API calls.

interface SilentMemoryData {
  observation: string;
  type: string;
  rarity: 'rare' | 'very_rare';
}

// Shared cache: prevents duplicate /api/emotional-snapshot calls
// when both PremiumReflection and SilentMemory mount simultaneously.
// The first component to call fetchSnapshot() wins; the second
// reuses the in-flight promise.
let snapshotPromise: Promise<any> | null = null;
let snapshotTimestamp = 0;
const SNAPSHOT_CACHE_TTL = 30000; // 30s cache — prevents rapid re-fetches

export function fetchSnapshot(apiFetch: (path: string, options?: RequestInit) => Promise<Response>): Promise<any> {
  const now = Date.now();
  if (snapshotPromise && now - snapshotTimestamp < SNAPSHOT_CACHE_TTL) {
    return snapshotPromise;
  }
  snapshotTimestamp = now;
  snapshotPromise = apiFetch('/api/emotional-snapshot')
    .then(res => {
      if (!res.ok) throw new Error('Snapshot fetch failed');
      return res.json();
    })
    .catch(() => ({ reflection: null, silentMemory: null }))
    .finally(() => {
      // Clear promise reference after cache TTL so next fetch is fresh
      setTimeout(() => { snapshotPromise = null; }, SNAPSHOT_CACHE_TTL);
    });
  return snapshotPromise;
}

export function SilentMemory() {
  const { apiFetch } = useApi();
  const [memory, setMemory] = useState<SilentMemoryData | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function observe() {
      try {
        const data = await fetchSnapshot(apiFetch);
        if (cancelled) return;

        if (data.silentMemory) {
          setMemory(data.silentMemory);
          // Fade in after the page settles
          timerRef.current = setTimeout(() => {
            if (!cancelled) setVisible(true);
          }, 1200);
        }
      } catch {
        // Network error — silence is fine
      }
    }

    observe();

    return () => {
      cancelled = true;
      // PROPERLY clear the timeout on unmount
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [apiFetch]);

  if (!memory) return null;

  return (
    <p
      className={`text-[13px] sm:text-sm text-[#555] italic tracking-wide transition-opacity duration-1000 select-none ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {memory.observation}
    </p>
  );
}
