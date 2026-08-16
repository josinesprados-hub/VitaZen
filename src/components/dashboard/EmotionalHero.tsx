'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { SCREENSHOT_EMOTIONAL_STATE } from '@/lib/screenshot-data';
import { EmotionalHeroSkeleton } from '@/components/ui/PremiumSkeleton';
import type { EmotionalState, EmotionalStatus } from '@/lib/emotional-state';

// ═══════════════════════════════════════════
// EmotionalHero — the vital state
// ═══════════════════════════════════════════
//
// NOT a dashboard widget. NOT a metrics panel.
// This is "how does your life feel right now."
//
// Shows:
//   - A single emotional status (Estable, Enfocado...)
//   - A human observation about the moment
//   - A quiet recommendation, if there's something real to say
//
// Does NOT show:
//   - Metric rings with numbers
//   - Progress bars
//   - Comparative trends
//   - "Tu actividad real" labels
//   - Anything that feels like analytics
//
// When there's no data: silence, not a loading state.

const STATUS_INDICATOR: Record<EmotionalStatus, { dot: string; pulse: string }> = {
  estable: { dot: 'bg-champagne/60', pulse: '' },
  en_progreso: { dot: 'bg-champagne/80', pulse: 'hero-pulse-gold' },
  sobrecargado: { dot: 'bg-champagne-deep/70', pulse: 'hero-pulse-warm' },
  enfocado: { dot: 'bg-champagne', pulse: 'hero-pulse-gold' },
};

export function EmotionalHero({ refreshKey }: { refreshKey?: number }) {
  const { apiFetch } = useApi();
  const { isActive: screenshotMode } = useScreenshotMode();
  const [state, setState] = useState<EmotionalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchState = useCallback(async (signal?: AbortSignal) => {
    if (screenshotMode) {
      setState(SCREENSHOT_EMOTIONAL_STATE);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch('/api/emotional-state', { signal });
      if (res.ok) {
        const data = await res.json();
        setState(data);
      } else {
        setError(true);
      }
    } catch (err) {
      // AbortError means the component unmounted — not a real error
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, screenshotMode]);

  useEffect(() => {
    const controller = new AbortController();
    fetchState(controller.signal);
    return () => controller.abort();
  }, [fetchState, refreshKey]);

  // Loading: calm, not frantic
  if (loading) {
    return <EmotionalHeroSkeleton />;
  }

  // No data: elegant silence
  if (error || !state) {
    return (
      <div className="py-6 sm:py-8">
        <p className="text-[11px] text-[#999]">Aparecerá con tu primer check-in</p>
      </div>
    );
  }

  const indicator = STATUS_INDICATOR[state.status];

  // No status description or anything to say: silence
  if (!state.statusDescription && !state.recommendation && !state.summary) {
    return null;
  }

  return (
    <div className="hero-fade-in">
      <div className="py-2 sm:py-4">
        {/* Status indicator — a single breathing dot */}
        <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
          <div className={`w-2 h-2 rounded-full ${indicator.dot} ${indicator.pulse}`} />
          <span className="text-[11px] sm:text-xs text-[#888] tracking-wide">{state.statusLabel}</span>
        </div>

        {/* The observation — human, not analytical */}
        {state.statusDescription && (
          <p className="text-base sm:text-xl font-light text-[#bbb] sm:text-[#ccc] leading-relaxed sm:leading-relaxed tracking-[-0.01em]">
            {state.statusDescription}
          </p>
        )}

        {/* Summary — when there's something worth noting */}
        {state.summary && (
          <p className="text-sm sm:text-base text-champagne/60 font-light italic mt-2 sm:mt-3 leading-relaxed">
            {state.summary}
          </p>
        )}

        {/* Recommendation — only when it adds value, never commanding */}
        {state.recommendation && (
          <p className="text-[11px] sm:text-xs text-[#999] mt-3 sm:mt-4">
            {state.recommendation}
          </p>
        )}
      </div>
    </div>
  );
}
