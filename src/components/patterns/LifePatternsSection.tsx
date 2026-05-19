'use client';

// ═══════════════════════════════════════════
// Patrones de Vida — Life Patterns Section
// ═══════════════════════════════════════════
//
// The first real Premium feature of VitaZen.
//
// Design principles:
// - Intimate, calm, premium, contemplative
// - NOT a dashboard. NOT analytics. NOT fintech.
// - Silence is part of design — don't fill empty spaces
// - Each observation is a gentle mirror, not a diagnosis
// - FREE users see one subtle blurred preview + "hay más profundidad"
// - PREMIUM users see all detected observations
//
// Every word, every pixel, every space must pass:
// 1. ¿Esto añade consciencia o ruido?
// 2. ¿Esto muestra o juzga?
// 3. ¿Esto podría existir en cualquier app financiera?
// ═══════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import PremiumGate from '@/components/ui/PremiumGate';
import { Crown, Link2 } from 'lucide-react';
import { EMPTY_STATE_MESSAGE, SECTION_TITLE, SECTION_SUBTITLE } from '@/lib/patterns/copy';

// ─── Types ───

interface ObservationData {
  id: string;
  text: string;
  empires: string[];
}

interface PatternsResponse {
  observations: ObservationData[];
  hasEnoughData: boolean;
  totalDataPoints: number;
}

// ─── Single Observation Card ───
// The soul of this feature — one human observation

function ObservationCard({ observation }: { observation: ObservationData }) {
  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 observation-enter">
      {/* The observation itself — calm, italic, intimate */}
      <p className="text-[#c8a55a]/80 text-sm sm:text-base italic leading-relaxed">
        {observation.text}
      </p>

      {/* Subtle empire connection indicators */}
      {observation.empires.length > 1 && (
        <div className="flex items-center gap-2 mt-4">
          <Link2 size={10} className="text-[#333]" />
          <div className="flex items-center gap-1.5">
            {observation.empires.map((empire, i) => (
              <span key={i} className="text-[10px] text-[#444] tracking-wide">
                {i > 0 && <span className="text-[#222] mr-1.5">·</span>}
                {empire}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty / Waiting State ───
// When there's not enough data yet — clean, calm silence

function WaitingState() {
  return (
    <div className="text-center py-10 sm:py-14">
      <div className="w-12 h-12 rounded-full bg-[#c8a55a]/5 border border-[#c8a55a]/10 flex items-center justify-center mx-auto mb-4">
        <Link2 size={18} className="text-[#c8a55a]/25" />
      </div>
      <p className="text-[13px] text-[#444] leading-relaxed max-w-xs mx-auto">
        {EMPTY_STATE_MESSAGE}
      </p>
    </div>
  );
}

// ─── Premium Preview for FREE Users ───
// One observation blurred + subtle gold crown hint

function PremiumPreview({ observation }: { observation: ObservationData }) {
  return (
    <div className="relative">
      {/* The blurred observation — gives sense of depth */}
      <div className="blur-[5px] select-none pointer-events-none saturate-50 opacity-60">
        <ObservationCard observation={observation} />
      </div>

      {/* Overlay — subtle, not aggressive */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/30 rounded-xl">
        <div className="flex flex-col items-center gap-2.5 px-6 text-center">
          <div className="w-9 h-9 rounded-full bg-[#c8a55a]/10 border border-[#c8a55a]/20 flex items-center justify-center">
            <Crown size={14} className="text-[#c8a55a]/60" />
          </div>
          <p className="text-[11px] text-[#666]">
            Las conexiones entre tu vida se revelan con el tiempo
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function LifePatternsSection() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const isPremium = user?.plan === 'PREMIUM';

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/patterns');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (error) {
      console.error('[Patrones] Error fetching:', error);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchPatterns();
  }, [fetchPatterns]);

  // ── Don't show anything while loading ──
  if (loading) return null;

  // ── No data at all — clean silence ──
  if (!data) return null;

  // ── Not enough data yet — show waiting state ──
  if (!data.hasEnoughData && data.observations.length === 0) {
    return (
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[#c8a55a]/8 flex items-center justify-center">
            <Link2 size={16} className="text-[#c8a55a]/40" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">{SECTION_TITLE}</h2>
            <p className="text-[10px] text-[#555]">{SECTION_SUBTITLE}</p>
          </div>
          {/* Premium badge — subtle */}
          <div className="ml-auto flex items-center gap-1">
            <Crown size={9} className="text-[#c8a55a]/40" />
            <span className="text-[9px] text-[#c8a55a]/40 font-medium">Élite</span>
          </div>
        </div>
        <WaitingState />
      </div>
    );
  }

  // ── Has observations ──
  const observations = data.observations;

  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6">
      {/* Section Header — calm, not promotional */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-[#c8a55a]/8 flex items-center justify-center">
          <Link2 size={16} className="text-[#c8a55a]/40" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">{SECTION_TITLE}</h2>
          <p className="text-[10px] text-[#555]">{SECTION_SUBTITLE}</p>
        </div>
        {/* Premium badge — subtle */}
        <div className="ml-auto flex items-center gap-1">
          <Crown size={9} className="text-[#c8a55a]/40" />
          <span className="text-[9px] text-[#c8a55a]/40 font-medium">Élite</span>
        </div>
      </div>

      {/* Observations */}
      {observations.length > 0 ? (
        <div className="space-y-3">
          {isPremium ? (
            // ── PREMIUM: Show all observations ──
            observations.map((obs) => (
              <ObservationCard key={obs.id} observation={obs} />
            ))
          ) : (
            // ── FREE: Show one blurred preview + rest gated ──
            <>
              <PremiumPreview observation={observations[0]} />
              {observations.length > 1 && (
                <div className="text-center py-2">
                  <span className="text-[10px] text-[#444]">
                    Más conexiones disponibles
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        // ── Enough data but no patterns detected yet ──
        <WaitingState />
      )}
    </div>
  );
}
