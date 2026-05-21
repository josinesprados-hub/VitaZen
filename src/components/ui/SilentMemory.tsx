'use client';

import { useEffect, useState } from 'react';
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

interface SilentMemoryData {
  observation: string;
  type: string;
  rarity: 'rare' | 'very_rare';
}

export function SilentMemory() {
  const { apiFetch } = useApi();
  const [memory, setMemory] = useState<SilentMemoryData | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function observe() {
      try {
        // Fetch from unified emotional snapshot
        const res = await apiFetch('/api/emotional-snapshot');
        if (!res.ok || cancelled) return;

        const data = await res.json();
        if (cancelled) return;

        if (data.silentMemory) {
          setMemory(data.silentMemory);
          // Fade in after the page settles
          const timer = setTimeout(() => {
            if (!cancelled) setVisible(true);
          }, 1200);
          return () => {
            cancelled = true;
            clearTimeout(timer);
          };
        }
      } catch {
        // Network error — silence is fine
      }
    }

    observe();

    return () => {
      cancelled = true;
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
