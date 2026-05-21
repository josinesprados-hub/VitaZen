'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import {
  checkAllSilentMemories,
  checkClientSilentMemory,
  type SilentMemory,
  type SilentMemoryData,
} from '@/lib/client/silent-memories';

// ═══════════════════════════════════════════
// SilentMemory — quiet, rare observation
// ═══════════════════════════════════════════
//
// A whisper, not a banner.
// A quiet note that appears when the app
// notices something human about the user's rhythm.
//
// Appears only when a silent memory condition is met.
// Disappears after being seen. Doesn't persist.
// Doesn't ask for attention. Doesn't explain.
//
// The user should feel:
// "no sé por qué, pero esta app acaba de tocar algo real"
//
// Architecture:
//   1. First, check client-only observations (return after silence)
//   2. Then, fetch server data for DB-dependent observations
//   3. Combine both using checkAllSilentMemories()
//   4. Show only the first valid, rare-enough observation
//
// Server data is fetched ONCE on mount.
// No polling. No subscriptions. No re-fetching.

export function SilentMemory() {
  const { apiFetch } = useApi();
  const [memory, setMemory] = useState<SilentMemory | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function observe() {
      // 1. Quick client-only check (no network needed)
      const clientMemory = checkClientSilentMemory();
      if (clientMemory && !cancelled) {
        setMemory(clientMemory);
        // Fade in after the page settles
        const timer = setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 1200);
        return () => {
          cancelled = true;
          clearTimeout(timer);
        };
      }

      // 2. Fetch server data for deeper observations
      // Only if the client-only check didn't produce a memory
      try {
        const res = await apiFetch('/api/silent-memories');
        if (!res.ok || cancelled) return;

        const serverData: SilentMemoryData = await res.json();

        if (cancelled) return;

        // 3. Check ALL observations (client + server data)
        const observed = checkAllSilentMemories(serverData);
        if (observed) {
          setMemory(observed);
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
        // The client-only check already handled return observations
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
