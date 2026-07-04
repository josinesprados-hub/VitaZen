'use client';

import { useEffect, useState } from 'react';

// ═══════════════════════════════════════════
// Return Trigger — quiet welcome back
// ═══════════════════════════════════════════
//
// A whisper, not a banner.
// Detects time since last session and shows
// a human, calm message. Never manipulative.
//
// The message appears under the greeting,
// like a quiet note. Not a card. Not a widget.

function getReturnMessage(daysSince: number): string {
  if (daysSince <= 0) return '';
  if (daysSince === 1) return 'De nuevo por aquí.';
  if (daysSince <= 3) return 'Hace unos días.';
  if (daysSince <= 7) return 'Bueno verte.';
  if (daysSince <= 14) return 'Tiempo sin pasar.';
  return 'Aquí estás.';
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
    <p className="text-sm text-[#555] mt-1 card-enter">{message}</p>
  );
}
