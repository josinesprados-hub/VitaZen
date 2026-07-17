'use client';

// ═══════════════════════════════════════════
// Etapas — Contemplative Life Perspective
// ═══════════════════════════════════════════
//
// A silent perspective of how life has been changing.
// Not a feed. Not a dashboard. Not analytics.
// A calm, deep, contemplative place to observe
// the accumulation of your own life.
//
// UX Philosophy:
//   - Premium, editorial, contemplative
//   - Timeline feels like a journey, not a list
//   - Each stage is a memory card (glassmorphism whisper)
//   - Elite gates invite curiosity, not frustration
//   - Works beautifully with 2 stages or 20
//
// Desktop: editorial, premium, wide, deliberate.
// Mobile: intimate, close, personal.
// ═══════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useApi } from '@/hooks/useApi';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import PremiumGate from '@/components/ui/PremiumGate';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { safeFormatDateShort } from '@/lib/dates';
import {
  PAGE_TITLE,
  PAGE_SUBTITLE,
  STAGES_TITLE,
  MEMORIES_TITLE,
  TRANSITIONS_TITLE,
  PATTERNS_TITLE,
  NO_DATA_TITLE,
  NO_DATA_SUBTITLE,
  LITTLE_DATA_TITLE,
  LITTLE_DATA_SUBTITLE,
  ELITE_CONNECTIONS,
  FREE_LIMIT_MESSAGE,
  getTimeRangeLabel,
} from '@/lib/life-memory/copy';

// ─── Types ───

interface LifeMemoryObservation {
  id: string;
  text: string;
  type: 'stage' | 'transition' | 'memory' | 'pattern';
  month?: string;
  monthLabel?: string;
  empires?: string[];
}

interface HighlightedMemory {
  text: string;
  date: string;
  empire: string;
}

interface LifeMemoryData {
  observations: LifeMemoryObservation[];
  memories: HighlightedMemory[];
  hasEnoughData: boolean;
  totalMonths: number;
  oldestMonth: string | null;
  newestMonth: string | null;
  isPremium: boolean;
}

// ─── Timeline Dot ───

function TimelineDot({ isLast }: { isLast: boolean }) {
  return (
    <div className="absolute -left-[21px] sm:-left-[25px] top-1.5 flex flex-col items-center">
      <div className="w-2 h-2 rounded-full bg-champagne/30 ring-2 ring-[#0a0a0a] group-hover/stage:bg-champagne/50 transition-colors duration-500" />
      {!isLast && (
        <div className="w-px h-full bg-gradient-to-b from-[#1a1a1a] to-transparent mt-1" />
      )}
    </div>
  );
}

// ─── Main Page ───

export default function EtapasPage() {
  const { user } = useAuth();
  const { displayUser } = useScreenshotMode();
  const { apiFetch } = useApi();
  const isPremium = displayUser?.plan === 'PREMIUM';

  const [data, setData] = useState<LifeMemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await apiFetch('/api/life-memory');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        setFetchError(true);
      }
    } catch (error) {
      console.error('[Etapas] Fetch error:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── Loading ───
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-20 sm:py-32">
        <div className="flex items-center justify-center">
          <div className="h-2 w-2 rounded-full bg-champagne gentle-pulse" />
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-20 sm:py-32">
        <PremiumErrorState
          variant="loading"
          title="No se pudo cargar"
          onRetry={() => fetchData()}
          size="md"
        />
      </div>
    );
  }

  if (!data) return null;

  const stages = data.observations.filter(o => o.type === 'stage');
  const transitions = data.observations.filter(o => o.type === 'transition');
  const patterns = data.observations.filter(o => o.type === 'pattern');
  const hasContent = data.observations.length > 0 || data.memories.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-6 sm:px-8 py-6 sm:py-12">
      {/* Back */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-[#555] hover:text-champagne transition-colors text-xs mb-8 sm:mb-10"
      >
        <ArrowLeft size={14} />
        Volver
      </Link>

      {/* ─── Header — editorial, premium, contemplative ─── */}
      <div className="mb-14 sm:mb-20 etapas-header">
        <p className="text-[10px] text-champagne/30 tracking-[0.2em] uppercase mb-4">
          Memoria de vida
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
          {PAGE_TITLE}
        </h1>
        <p className="subtitle-silent text-sm sm:text-base max-w-md">
          {PAGE_SUBTITLE}
        </p>

        {data.oldestMonth && data.newestMonth && (
          <div className="mt-6 inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-[#1a1a1a] bg-[#0a0a0a]">
            <div className="w-1.5 h-1.5 rounded-full bg-champagne/40" />
            <span className="text-[10px] text-[#555] tracking-wide">
              {getTimeRangeLabel(data.oldestMonth, data.newestMonth)}
            </span>
          </div>
        )}
      </div>

      {/* ─── No data state — spacious, contemplative ─── */}
      {!hasContent && (
        <div className="text-center py-24 sm:py-32">
          <div className="w-2.5 h-2.5 rounded-full bg-champagne/15 mx-auto mb-6" />
          <p className="text-[#555] text-sm">{NO_DATA_TITLE}</p>
          <p className="text-[#333] text-xs mt-3">{NO_DATA_SUBTITLE}</p>
        </div>
      )}

      {/* ─── Little data state ─── */}
      {hasContent && !data.hasEnoughData && (
        <div className="text-center py-6 mb-10">
          <p className="text-[#444] text-xs">{LITTLE_DATA_TITLE}</p>
          <p className="text-[#333] text-[10px] mt-1.5">{LITTLE_DATA_SUBTITLE}</p>
        </div>
      )}

      {/* ═══════════════════════════════════════
          STAGES / PERIODOS — Timeline
          ═══════════════════════════════════════ */}
      {stages.length > 0 && (
        <div className="mb-16 sm:mb-24">
          <h2 className="text-[11px] text-[#444] mb-10 sm:mb-14 tracking-widest uppercase">{STAGES_TITLE}</h2>

          {/* Timeline with glass cards */}
          <div className="relative ml-1 sm:ml-2 border-l border-[#131313] pl-8 sm:pl-12 space-y-6 sm:space-y-8">
            {stages.map((stage, index) => (
              <div
                key={stage.id}
                className="group/stage relative etapas-stage-card"
                style={{ animationDelay: `${index * 0.06}s` }}
              >
                <TimelineDot isLast={index === stages.length - 1} />

                {/* Glass card — whisper, not shout */}
                <div className="bg-[#0a0a0a]/60 border border-[#151515] rounded-xl px-5 py-4.5 sm:px-6 sm:py-5 backdrop-blur-[2px] transition-colors duration-500 group-hover/stage:border-[#1e1e1e]">
                  {stage.monthLabel && (
                    <p className="text-[10px] text-champagne/35 mb-2.5 tracking-wider uppercase">
                      {stage.monthLabel}
                    </p>
                  )}
                  <p className="text-champagne/70 text-base sm:text-lg italic leading-relaxed">
                    {stage.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          TRANSITIONS
          ═══════════════════════════════════════ */}
      {isPremium && transitions.length > 0 && (
        <div className="mb-16 sm:mb-24">
          <h2 className="text-[11px] text-[#444] mb-8 sm:mb-10 tracking-widest uppercase">{TRANSITIONS_TITLE}</h2>

          <div className="space-y-5 sm:space-y-6">
            {transitions.map((t, index) => (
              <div
                key={t.id}
                className="etapas-transition-item"
                style={{ animationDelay: `${index * 0.04}s` }}
              >
                <div className="bg-[#0a0a0a]/40 border border-[#111] rounded-lg px-4.5 py-3.5 sm:px-5 sm:py-4">
                  <p className="text-[#888] text-sm sm:text-base italic leading-relaxed">{t.text}</p>
                  {t.monthLabel && (
                    <p className="text-[10px] text-[#2a2a2a] mt-2.5 tracking-wide">{t.monthLabel}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transitions: Premium-only content. FREE users see nothing —
          no empty placeholders, no incomplete feeling. */}

      {/* ═══════════════════════════════════════
          MEMORIES / MOMENTOS
          ═══════════════════════════════════════ */}
      {isPremium && data.memories.length > 0 && (
        <div className="mb-16 sm:mb-24">
          <h2 className="text-[11px] text-[#444] mb-8 sm:mb-10 tracking-widest uppercase">{MEMORIES_TITLE}</h2>

          <div className="space-y-4 sm:space-y-5">
            {data.memories.map((memory, i) => (
              <div
                key={i}
                className="etapas-memory-item"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="bg-[#0a0a0a]/40 border border-[#111] rounded-lg px-4.5 py-3.5 sm:px-5 sm:py-4">
                  <p className="text-[#777] text-xs sm:text-sm italic leading-relaxed">{memory.text}</p>
                  <p className="text-[10px] text-[#2a2a2a] mt-2">
                    {memory.empire} · {safeFormatDateShort(memory.date)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories: Premium-only content. FREE users see nothing —
          no empty placeholders, no incomplete feeling. */}

      {/* ═══════════════════════════════════════
          PATTERNS / CONEXIONES
          ═══════════════════════════════════════ */}
      {isPremium && patterns.length > 0 && (
        <div className="mb-16 sm:mb-24">
          <h2 className="text-[11px] text-[#444] mb-8 sm:mb-10 tracking-widest uppercase">{PATTERNS_TITLE}</h2>

          <div className="space-y-5 sm:space-y-6">
            {patterns.map((p, index) => (
              <div
                key={p.id}
                className="etapas-pattern-item"
                style={{ animationDelay: `${index * 0.04}s` }}
              >
                <div className="bg-[#0a0a0a]/40 border border-[#111] rounded-lg px-4.5 py-3.5 sm:px-5 sm:py-4">
                  <p className="text-champagne/60 text-sm sm:text-base italic leading-relaxed">{p.text}</p>
                  {p.empires && p.empires.length > 1 && (
                    <div className="flex items-center gap-1.5 mt-2.5">
                      {p.empires.map((empire, i) => (
                        <span key={i} className="text-[10px] text-[#2a2a2a]">
                          {i > 0 && <span className="text-[#1a1a1a] mr-1">·</span>}
                          {empire}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Patterns gate for FREE — aspirational ─── */}
      {!isPremium && stages.length > 0 && (
        <div className="mb-14 sm:mb-20">
          <PremiumGate isPremium={false} intensity="light" compact label={ELITE_CONNECTIONS}>
            <div className="h-12" />
          </PremiumGate>
        </div>
      )}

      {/* ─── FREE subtle hint — contemplative closing ─── */}
      {!isPremium && hasContent && (
        <div className="text-center mt-10 mb-4">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[#111] bg-[#0a0a0a]/50">
            <div className="w-1 h-1 rounded-full bg-champagne/30" />
            <p className="text-[10px] text-[#444] tracking-wide">
              {FREE_LIMIT_MESSAGE}
            </p>
          </div>
        </div>
      )}

      <div className="h-20 sm:h-24" />
    </div>
  );
}
