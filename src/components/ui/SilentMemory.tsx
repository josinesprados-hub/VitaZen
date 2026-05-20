'use client';

import { useEffect, useState } from 'react';
import { checkClientSilentMemory, type SilentMemory } from '@/lib/silent-memories';

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

export function SilentMemory() {
  const [memory, setMemory] = useState<SilentMemory | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only check on mount — not constantly
    const observed = checkClientSilentMemory();
    if (observed) {
      setMemory(observed);
      // Fade in after a short delay (let the page settle first)
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

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
