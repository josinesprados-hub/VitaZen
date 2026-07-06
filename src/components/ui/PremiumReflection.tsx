'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_REFLECTION } from '@/lib/screenshot-data';

// ═══════════════════════════════════════════
// PremiumReflection — daily quote rotation
// ═══════════════════════════════════════════
//
// Single source of truth: the server.
// No Math.random(). No localStorage.
// The server decides the daily quote, all devices
// show the same one for the entire Madrid day.
//
// Source: src/lib/daily-quotes.ts (300 personal development quotes)
// Endpoint: GET /api/daily-quote → src/lib/server/daily-quote.ts
//
// One quote per day. Persistent for the whole day.
// Changes at Madrid midnight. Never repeats until
// the full battery is exhausted, then a new cycle
// begins with a different deterministic shuffle.
//
// This component previously consumed /api/emotional-snapshot
// (reflections — emotional, visit-based rotation). It now
// consumes /api/daily-quote (personal development quotes,
// day-based rotation). The visual design is unchanged.

export default function PremiumReflection() {
  const { apiFetch } = useApi();
  const { isActive: screenshotMode } = useScreenshotMode();
  const [visible, setVisible] = useState(false);
  const [reflection, setReflection] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (screenshotMode) {
      setReflection(SCREENSHOT_REFLECTION);
      setVisible(true);
      setLoaded(true);
      return;
    }

    let cancelled = false;

    async function fetchDailyQuote() {
      try {
        const res = await apiFetch('/api/daily-quote');
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.text) {
          setReflection(data.text);
          setVisible(true);
        }
      } catch {
        // Network error — silence is fine
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    fetchDailyQuote();
    return () => { cancelled = true; };
  }, [apiFetch, screenshotMode]);

  if (!loaded || !reflection) {
    // Minimal placeholder — silence, not a loading state
    return <div className="py-2 sm:py-6 h-8 sm:h-12 flex items-center justify-center"><div className="h-2 w-16 rounded-full bg-champagne/10 gentle-pulse" /></div>;
  }

  return (
    <div className="flex justify-center py-3 sm:py-8">
      <p
        className={`text-center text-champagne/70 text-sm sm:text-lg font-light italic tracking-wide max-w-xl transition-opacity duration-700 px-4 select-none leading-relaxed ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        «{reflection}»
      </p>
    </div>
  );
}
