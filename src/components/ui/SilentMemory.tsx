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
// This component calls /api/silent-memory directly.
// The old fetchSnapshot helper (which called
// /api/emotional-snapshot for both reflection and
// silent memory) has been removed along with the
// reflections system. The daily quote is now served
// by /api/daily-quote, consumed by PremiumReflection.

interface SilentMemoryData {
  observation: string;
  type: string;
  rarity: 'rare' | 'very_rare';
}

// Shared cache: prevents duplicate /api/silent-memory calls
// when the component re-mounts rapidly.
let snapshotPromise: Promise<any> | null = null;
let snapshotTimestamp = 0;
const SNAPSHOT_CACHE_TTL = 30000; // 30s cache — prevents rapid re-fetches

export function SilentMemory() {
  const { apiFetch } = useApi();
  const [memory, setMemory] = useState<SilentMemoryData | null>(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function observe() {
      try {
        // Use cached promise if within TTL
        const now = Date.now();
        if (!snapshotPromise || now - snapshotTimestamp >= SNAPSHOT_CACHE_TTL) {
          snapshotTimestamp = now;
          snapshotPromise = apiFetch('/api/silent-memory')
            .then(res => {
              if (!res.ok) throw new Error('Snapshot fetch failed');
              return res.json();
            })
            .catch(() => ({ silentMemory: null }))
            .finally(() => {
              setTimeout(() => { snapshotPromise = null; }, SNAPSHOT_CACHE_TTL);
            });
        }

        const data = await snapshotPromise;
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
