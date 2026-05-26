'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_REFLECTION } from '@/lib/screenshot-data';
import { fetchSnapshot } from './SilentMemory';

// ═══════════════════════════════════════════
// PremiumReflection — contemplative rotation
// ═══════════════════════════════════════════
//
// Single source of truth: the server.
// No Math.random(). No localStorage.
// The server decides the reflection, all devices
// show the same one.
//
// Silence is still preserved — it's computed
// server-side with the same visit-based rhythm.

interface ReflectionSnapshot {
  text: string;
  isDeep: boolean;
  isSilent: boolean;
}

export default function PremiumReflection() {
  const { apiFetch } = useApi();
  const { isActive: screenshotMode } = useScreenshotMode();
  const [visible, setVisible] = useState(false);
  const [reflection, setReflection] = useState('');
  const [isDeep, setIsDeep] = useState(false);
  const [isSilent, setIsSilent] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (screenshotMode) {
      setReflection(SCREENSHOT_REFLECTION);
      setVisible(true);
      setLoaded(true);
      return;
    }

    let cancelled = false;

    async function fetchReflection() {
      try {
        const data = await fetchSnapshot(apiFetch);
        if (cancelled) return;

        if (data.reflection && !data.reflection.isSilent) {
          setReflection(data.reflection.text);
          setIsDeep(data.reflection.isDeep);
          setVisible(true);
        } else {
          // Silent visit — the reflection space breathes empty
          setIsSilent(true);
        }
      } catch {
        // Network error — silence is fine
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    fetchReflection();
    return () => { cancelled = true; };
  }, [apiFetch, screenshotMode]);

  // Silent visit — the reflection space breathes empty.
  // Not a bug. Not a missing feature. Intentional silence.
  if (isSilent) {
    return <div className="py-3 sm:py-8" />;
  }

  if (!loaded || !reflection) {
    // Minimal placeholder — silence, not a loading state
    return <div className="py-2 sm:py-6 h-8 sm:h-12 flex items-center justify-center"><div className="h-2 w-16 rounded-full bg-[#c8a55a]/10 gentle-pulse" /></div>;
  }

  return (
    <div className="flex justify-center py-3 sm:py-8">
      <p
        className={`text-center text-[#c8a55a]/70 text-sm sm:text-lg font-light italic tracking-wide max-w-xl transition-opacity duration-700 px-4 select-none leading-relaxed ${visible ? 'opacity-100' : 'opacity-0'}`}
      >
        «{reflection}»
      </p>
    </div>
  );
}
