'use client';

// ═══════════════════════════════════════════
// Memoria de Vida — Contemplative Timeline
// ═══════════════════════════════════════════
//
// A silent memory of how life has been changing.
// Not a feed. Not a dashboard. Not analytics.
// A calm, contemplative place to observe your own life.
// ═══════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Crown, Link2, Feather, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import PremiumGate from '@/components/ui/PremiumGate';
import {
  PAGE_TITLE,
  PAGE_SUBTITLE,
  STAGES_TITLE,
  STAGES_SUBTITLE,
  MEMORIES_TITLE,
  MEMORIES_SUBTITLE,
  TRANSITIONS_TITLE,
  TRANSITIONS_SUBTITLE,
  PATTERNS_TITLE,
  PATTERNS_SUBTITLE,
  NO_DATA_TITLE,
  NO_DATA_SUBTITLE,
  LITTLE_DATA_TITLE,
  LITTLE_DATA_SUBTITLE,
  ELITE_STAGES,
  ELITE_TRANSITIONS,
  ELITE_CONNECTIONS,
  ELITE_BADGE,
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

export default function MemoriaDeVidaPage() {
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
      console.error('[Memoria de Vida] Fetch error:', error);
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
      <div className="max-w-2xl mx-auto px-4 py-20">
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
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      {/* Back */}
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-[#555] hover:text-[#c8a55a] transition-colors text-xs mb-8"
      >
        <ArrowLeft size={14} />
        Volver
      </Link>

      {/* Header — calm, contemplative */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-xl sm:text-2xl font-light text-white">{PAGE_TITLE}</h1>
          {isPremium && (
            <span className="text-[9px] text-[#c8a55a]/40 font-medium">{ELITE_BADGE}</span>
          )}
        </div>
        <p className="text-[#666] text-sm leading-relaxed">{PAGE_SUBTITLE}</p>

        {/* Time range */}
        {data.oldestMonth && data.newestMonth && (
          <p className="text-[10px] text-[#333] mt-3 tracking-wide">
            {getTimeRangeLabel(data.oldestMonth, data.newestMonth)}
          </p>
        )}
      </div>

      {/* ── No data state ── */}
      {!hasContent && (
        <div className="text-center py-16">
          <div className="w-12 h-12 rounded-full bg-[#c8a55a]/5 border border-[#c8a55a]/10 flex items-center justify-center mx-auto mb-4">
            <Feather size={18} className="text-[#c8a55a]/25" />
          </div>
          <p className="text-[#555] text-sm">{NO_DATA_TITLE}</p>
          <p className="text-[#333] text-xs mt-2 max-w-xs mx-auto leading-relaxed">{NO_DATA_SUBTITLE}</p>
        </div>
      )}

      {/* ── Little data state ── */}
      {hasContent && !data.hasEnoughData && (
        <div className="text-center py-8 mb-6">
          <p className="text-[#555] text-xs">{LITTLE_DATA_TITLE}</p>
          <p className="text-[#333] text-[10px] mt-1 max-w-xs mx-auto">{LITTLE_DATA_SUBTITLE}</p>
        </div>
      )}

      {/* ═══ STAGES — The Core Timeline ═══ */}
      {stages.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-[#c8a55a]/5 flex items-center justify-center">
              <Feather size={11} className="text-[#c8a55a]/40" />
            </div>
            <h2 className="text-sm font-medium text-white">{STAGES_TITLE}</h2>
          </div>
          <p className="text-[10px] text-[#444] mb-5 ml-8">{STAGES_SUBTITLE}</p>

          <div className="ml-4 border-l border-[#1a1a1a] pl-6 space-y-6">
            {stages.map((stage) => (
              <div key={stage.id} className="relative">
                {/* Dot on timeline */}
                <div className="absolute -left-[31px] top-2 w-2 h-2 rounded-full bg-[#1a1a1a] border border-[#333]" />

                {/* Month label */}
                {stage.monthLabel && (
                  <p className="text-[10px] text-[#444] mb-1 tracking-wide">{stage.monthLabel}</p>
                )}

                {/* Observation — calm, italic, intimate */}
                <p className="text-[#c8a55a]/70 text-sm italic leading-relaxed">
                  {stage.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ TRANSITIONS (Élite only) ═══ */}
      {isPremium && transitions.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-[#c8a55a]/5 flex items-center justify-center">
              <Link2 size={11} className="text-[#c8a55a]/40" />
            </div>
            <h2 className="text-sm font-medium text-white">{TRANSITIONS_TITLE}</h2>
            <span className="text-[9px] text-[#c8a55a]/40 font-medium ml-auto">{ELITE_BADGE}</span>
          </div>
          <p className="text-[10px] text-[#444] mb-5 ml-8">{TRANSITIONS_SUBTITLE}</p>

          <div className="space-y-4">
            {transitions.map((t) => (
              <div key={t.id} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4">
                <p className="text-[#999] text-sm italic leading-relaxed">{t.text}</p>
                {t.monthLabel && (
                  <p className="text-[10px] text-[#333] mt-2">{t.monthLabel}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transitions gate for FREE */}
      {!isPremium && stages.length > 0 && (
        <div className="mb-8">
          <PremiumGate isPremium={false} intensity="light" compact label={ELITE_TRANSITIONS}>
            <div className="h-10" />
          </PremiumGate>
        </div>
      )}

      {/* ═══ MEMORIES (Élite only) ═══ */}
      {isPremium && data.memories.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-[#c8a55a]/5 flex items-center justify-center">
              <Feather size={11} className="text-[#c8a55a]/40" />
            </div>
            <h2 className="text-sm font-medium text-white">{MEMORIES_TITLE}</h2>
            <span className="text-[9px] text-[#c8a55a]/40 font-medium ml-auto">{ELITE_BADGE}</span>
          </div>
          <p className="text-[10px] text-[#444] mb-5 ml-8">{MEMORIES_SUBTITLE}</p>

          <div className="space-y-3">
            {data.memories.map((memory, i) => (
              <div key={i} className="border-l-2 border-[#1a1a1a] pl-4 py-1">
                <p className="text-[#888] text-xs italic leading-relaxed">{memory.text}</p>
                <p className="text-[10px] text-[#333] mt-1.5">
                  {memory.empire} · {new Date(memory.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Memories gate for FREE */}
      {!isPremium && stages.length > 0 && (
        <div className="mb-8">
          <PremiumGate isPremium={false} intensity="light" compact label="Memoria mensual">
            <div className="h-10" />
          </PremiumGate>
        </div>
      )}

      {/* ═══ PATTERNS (Élite only) ═══ */}
      {isPremium && patterns.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md bg-[#c8a55a]/5 flex items-center justify-center">
              <Link2 size={11} className="text-[#c8a55a]/40" />
            </div>
            <h2 className="text-sm font-medium text-white">{PATTERNS_TITLE}</h2>
            <span className="text-[9px] text-[#c8a55a]/40 font-medium ml-auto">{ELITE_BADGE}</span>
          </div>
          <p className="text-[10px] text-[#444] mb-5 ml-8">{PATTERNS_SUBTITLE}</p>

          <div className="space-y-3">
            {patterns.map((p) => (
              <div key={p.id} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4">
                <p className="text-[#c8a55a]/70 text-sm italic leading-relaxed">{p.text}</p>
                {p.empires && p.empires.length > 1 && (
                  <div className="flex items-center gap-2 mt-2">
                    <Link2 size={9} className="text-[#333]" />
                    <div className="flex items-center gap-1.5">
                      {p.empires.map((empire, i) => (
                        <span key={i} className="text-[10px] text-[#444]">
                          {i > 0 && <span className="text-[#222] mr-1.5">·</span>}
                          {empire}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns gate for FREE */}
      {!isPremium && stages.length > 0 && (
        <div className="mb-8">
          <PremiumGate isPremium={false} intensity="light" compact label={ELITE_CONNECTIONS}>
            <div className="h-10" />
          </PremiumGate>
        </div>
      )}

      {/* ── FREE subtle hint ── */}
      {!isPremium && hasContent && (
        <div className="text-center mt-6">
          <p className="text-[10px] text-[#444] flex items-center justify-center gap-1.5">
            <Crown size={9} className="text-[#c8a55a]/40" />
            {FREE_LIMIT_MESSAGE}
          </p>
        </div>
      )}

      <div className="h-12" />
    </div>
  );
}
