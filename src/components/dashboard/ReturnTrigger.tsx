'use client';

import { useEffect, useState } from 'react';

// ═══════════════════════════════════════════
// Daily Return Trigger — Dynamic welcome back
// ═══════════════════════════════════════════
//
// Detects time since last session and shows
// a human, calm message. Never manipulative.
//
// Storage: localStorage 'vitazen_last_seen'
//
// Messages by gap:
//   Same day    → "Bienvenido de nuevo."
//   1 day       → "Mantienes el ritmo."
//   2-3 days    → "Hace unos días que no aparecías."
//   4-7 days    → "Pequeños pasos. Seguimos."
//   7+ days     → "Aquí estás. Eso es lo que importa."

function getReturnMessage(daysSince: number): string {
  if (daysSince <= 0) return 'Bienvenido de nuevo.';
  if (daysSince === 1) return 'Mantienes el ritmo.';
  if (daysSince <= 3) return 'Hace unos días que no aparecías.';
  if (daysSince <= 7) return 'Pequeños pasos. Seguimos.';
  return 'Aquí estás. Eso es lo que importa.';
}

export function ReturnTrigger() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem('vitazen_last_seen');
      const now = Date.now();

      if (lastSeen) {
        const diff = now - parseInt(lastSeen, 10);
        const daysSince = Math.floor(diff / (24 * 60 * 60 * 1000));

        if (daysSince >= 1) {
          setMessage(getReturnMessage(daysSince));
        }
      }

      // Always update last seen to now
      localStorage.setItem('vitazen_last_seen', now.toString());
    } catch {
      // localStorage not available, silent fail
    }
  }, []);

  if (!message) return null;

  return (
    <div className="bg-[#0a0a0a] border border-[#c8a55a]/10 rounded-xl px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3 card-enter">
      <div className="w-1 h-6 sm:h-8 rounded-full bg-[#c8a55a]/20 shrink-0" />
      <p className="text-xs sm:text-sm text-[#999] italic">{message}</p>
    </div>
  );
}
