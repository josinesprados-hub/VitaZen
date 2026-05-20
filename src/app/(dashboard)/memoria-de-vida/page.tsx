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
// Desktop: editorial, premium, wide, deliberate.
// Mobile: intimate, close, personal.
// ═══════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Crown, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import PremiumGate from '@/components/ui/PremiumGate';
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
  ELITE_TRANSITIONS,
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

// ─── Main Page ───

export default function EtapasPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const isPremium = user?.plan === 'PREMIUM';

  const [data, setData] = useState<LifeMemoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/life-memory');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('[Etapas] Fetch error:', error);
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
          <div className="h-2 w-2 rounded-full bg-[#c8a55a] gentle-pulse" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const stages = data.observations.filter(o => o.type === 'stage');
  const transitions = data.observations.filter(o => o.type === 'transition');
  const patterns = data.observations.filter(o => o.type === 'pattern');
  const hasContent = data.observations.length > 0 || data.memories.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-6 sm:px-8 py-8 sm:py-16">
      {/* Back */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-[#555] hover:text-[#c8a55a] transition-colors text-xs mb-10 sm:mb-14"
      >
        <ArrowLeft size={14} />
        Volver
      </Link>

      {/* Header — editorial, spacious, typographic presence */}
      <div className="mb-16 sm:mb-24">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 tracking-tight">
          {PAGE_TITLE}
        </h1>
        <p className="subtitle-silent text-sm sm:text-base">{PAGE_SUBTITLE}</p>

        {data.oldestMonth && data.newestMonth && (
          <p className="text-[11px] text-[#333] mt-3 tracking-wide">
            {getTimeRangeLabel(data.oldestMonth, data.newestMonth)}
          </p>
        )}
      </div>

      {/* No data state — spacious, contemplative */}
      {!hasContent && (
        <div className="text-center py-24 sm:py-32">
          <p className="text-[#555] text-sm">{NO_DATA_TITLE}</p>
          <p className="text-[#333] text-xs mt-3">{NO_DATA_SUBTITLE}</p>
        </div>
      )}

      {/* Little data state */}
      {hasContent && !data.hasEnoughData && (
        <div className="text-center py-8 mb-12">
          <p className="text-[#444] text-xs">{LITTLE_DATA_TITLE}</p>
          <p className="text-[#333] text-[10px] mt-1.5">{LITTLE_DATA_SUBTITLE}</p>
        </div>
      )}

      {/* STAGES / PERIODOS */}
      {stages.length > 0 && (
        <div className="mb-20 sm:mb-28">
          <h2 className="text-[11px] text-[#444] mb-8 sm:mb-10 tracking-widest uppercase">{STAGES_TITLE}</h2>

          <div className="ml-1 sm:ml-2 border-l border-[#151515] pl-6 sm:pl-10 space-y-10 sm:space-y-14">
            {stages.map((stage) => (
              <div key={stage.id}>
                {stage.monthLabel && (
                  <p className="text-[10px] text-[#333] mb-2 tracking-wide">{stage.monthLabel}</p>
                )}
                <p className="text-[#c8a55a]/60 text-base sm:text-lg italic leading-relaxed">
                  {stage.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TRANSITIONS */}
      {isPremium && transitions.length > 0 && (
        <div className="mb-20 sm:mb-28">
          <h2 className="text-[11px] text-[#444] mb-8 sm:mb-10 tracking-widest uppercase">{TRANSITIONS_TITLE}</h2>

          <div className="space-y-8 sm:space-y-10">
            {transitions.map((t) => (
              <div key={t.id}>
                <p className="text-[#888] text-sm sm:text-base italic leading-relaxed">{t.text}</p>
                {t.monthLabel && (
                  <p className="text-[10px] text-[#2a2a2a] mt-2">{t.monthLabel}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transitions gate for FREE */}
      {!isPremium && stages.length > 0 && (
        <div className="mb-16">
          <PremiumGate isPremium={false} intensity="light" compact label={ELITE_TRANSITIONS}>
            <div className="h-10" />
          </PremiumGate>
        </div>
      )}

      {/* MEMORIES / MOMENTOS */}
      {isPremium && data.memories.length > 0 && (
        <div className="mb-20 sm:mb-28">
          <h2 className="text-[11px] text-[#444] mb-8 sm:mb-10 tracking-widest uppercase">{MEMORIES_TITLE}</h2>

          <div className="space-y-6 sm:space-y-8">
            {data.memories.map((memory, i) => (
              <div key={i} className="border-l border-[#151515] pl-5 sm:pl-8">
                <p className="text-[#777] text-xs sm:text-sm italic leading-relaxed">{memory.text}</p>
                <p className="text-[10px] text-[#2a2a2a] mt-2">
                  {memory.empire} · {new Date(memory.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories gate for FREE */}
      {!isPremium && stages.length > 0 && (
        <div className="mb-16">
          <PremiumGate isPremium={false} intensity="light" compact label="Momentos destacados">
            <div className="h-10" />
          </PremiumGate>
        </div>
      )}

      {/* PATTERNS / CONEXIONES */}
      {isPremium && patterns.length > 0 && (
        <div className="mb-20 sm:mb-28">
          <h2 className="text-[11px] text-[#444] mb-8 sm:mb-10 tracking-widest uppercase">{PATTERNS_TITLE}</h2>

          <div className="space-y-6 sm:space-y-8">
            {patterns.map((p) => (
              <div key={p.id}>
                <p className="text-[#c8a55a]/60 text-sm sm:text-base italic leading-relaxed">{p.text}</p>
                {p.empires && p.empires.length > 1 && (
                  <div className="flex items-center gap-1.5 mt-2">
                    {p.empires.map((empire, i) => (
                      <span key={i} className="text-[10px] text-[#2a2a2a]">
                        {i > 0 && <span className="text-[#1a1a1a] mr-1">·</span>}
                        {empire}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns gate for FREE */}
      {!isPremium && stages.length > 0 && (
        <div className="mb-16">
          <PremiumGate isPremium={false} intensity="light" compact label={ELITE_CONNECTIONS}>
            <div className="h-10" />
          </PremiumGate>
        </div>
      )}

      {/* FREE subtle hint */}
      {!isPremium && hasContent && (
        <div className="text-center mt-12">
          <p className="text-[10px] text-[#333] flex items-center justify-center gap-1">
            <Crown size={7} className="text-[#c8a55a]/25" />
            {FREE_LIMIT_MESSAGE}
          </p>
        </div>
      )}

      <div className="h-20 sm:h-24" />
    </div>
  );
}
