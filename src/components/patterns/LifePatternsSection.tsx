'use client';

// ═══════════════════════════════════════════
// Patrones de Vida — Life Patterns Section
// ═══════════════════════════════════════════
//
// The first real Premium feature of VitaZen.
//
// Refined design principles:
// - Intimate, calm, premium, contemplative
// - NOT a dashboard. NOT analytics. NOT fintech.
// - Silence is part of design — don't fill empty spaces
// - Each observation is a gentle mirror, not a diagnosis
// - Rare is better than frequent
// - 1 honest observation > 3 suspicious ones
// - FREE users see one subtle blurred preview
// - ÉLITE users see all detected observations
//
// Every word, every pixel, every space must pass:
// 1. ¿Esto añade consciencia o ruido?
// 2. ¿Esto muestra o juzga?
// 3. ¿Esto podría existir en cualquier app financiera?
// ═══════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
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

// ─── Cache key for week-based persistence ───
// Observations are cached per week in localStorage.
// This prevents them from changing on every page load.
// They only refresh when the week changes.

function getISOWeekKey(): string {
  const now = new Date();
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return `${d.getFullYear()}-W${1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)}`;
}

const CACHE_KEY_PREFIX = 'vz_patterns_';

interface CachedPatterns {
  week: string;
  data: PatternsResponse;
}

function getCachedPatterns(userId: string): CachedPatterns | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + userId);
    if (!raw) return null;
    const cached: CachedPatterns = JSON.parse(raw);
    if (cached.week !== getISOWeekKey()) return null;
    return cached;
  } catch {
    return null;
  }
}

function setCachedPatterns(userId: string, data: PatternsResponse): void {
  try {
    const cached: CachedPatterns = { week: getISOWeekKey(), data };
    localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify(cached));
  } catch {
    // localStorage not available (TWA, private mode) — graceful degradation
  }
}

// ─── Single Observation Card ───
// The soul of this feature — one human observation.
// Calm. Quiet. No visual noise.

function ObservationCard({ observation }: { observation: ObservationData }) {
  return (
    <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 observation-enter">
      {/* The observation — calm, italic, intimate */}
      <p className="text-[#c8a55a]/80 text-sm sm:text-base italic leading-relaxed">
        {observation.text}
      </p>

      {/* Subtle empire connection — barely visible, just a hint */}
      {observation.empires.length > 1 && (
        <div className="flex items-center gap-2 mt-4">
          <Link2 size={10} className="text-[#2a2a2a]" />
          <div className="flex items-center gap-1.5">
            {observation.empires.map((empire, i) => (
              <span key={i} className="text-[10px] text-[#333] tracking-wide">
                {i > 0 && <span className="text-[#1a1a1a] mr-1.5">·</span>}
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
// When there's not enough data yet — clean, calm silence.

function WaitingState() {
  return (
    <div className="text-center py-10 sm:py-14">
      <div className="w-10 h-10 rounded-full bg-[#c8a55a]/5 border border-[#c8a55a]/8 flex items-center justify-center mx-auto mb-4">
        <Link2 size={14} className="text-[#c8a55a]/20" />
      </div>
      <p className="text-[12px] text-[#383838] leading-relaxed max-w-xs mx-auto">
        {EMPTY_STATE_MESSAGE}
      </p>
    </div>
  );
}

// ─── Premium Preview for FREE Users ───
// One observation blurred + subtle gold crown hint.
// Elegant, not aggressive.

function PremiumPreview({ observation }: { observation: ObservationData }) {
  return (
    <div className="relative">
      {/* The blurred observation — gives sense of depth */}
      <div className="blur-[5px] select-none pointer-events-none saturate-50 opacity-60">
        <ObservationCard observation={observation} />
      </div>

      {/* Overlay — subtle, quiet */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0a]/30 rounded-xl">
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <div className="w-8 h-8 rounded-full bg-[#c8a55a]/8 border border-[#c8a55a]/15 flex items-center justify-center">
            <Crown size={12} className="text-[#c8a55a]/50" />
          </div>
          <p className="text-[11px] text-[#555]">
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
  const fetchedRef = useRef(false);

  const isPremium = user?.plan === 'PREMIUM';

  const fetchPatterns = useCallback(async () => {
    setLoading(true);
    try {
      // Check localStorage cache first
      if (user?.id) {
        const cached = getCachedPatterns(user.id);
        if (cached) {
          setData(cached.data);
          setLoading(false);
          return;
        }
      }

      const res = await apiFetch('/api/patterns');
      if (res.ok) {
        const result = await res.json();
        setData(result);

        // Cache for the current week
        if (user?.id) {
          setCachedPatterns(user.id, result);
        }
      }
    } catch (error) {
      console.error('[Patrones] Error fetching:', error);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, user?.id]);

  useEffect(() => {
    // Only fetch once per mount
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchPatterns();
    }
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
          <div className="w-7 h-7 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
            <Link2 size={13} className="text-[#c8a55a]/30" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-medium text-white/80">{SECTION_TITLE}</h2>
            <p className="text-[10px] text-[#444]">{SECTION_SUBTITLE}</p>
          </div>
          {/* Élite badge — barely visible */}
          <div className="flex items-center gap-1 shrink-0">
            <Crown size={8} className="text-[#c8a55a]/30" />
            <span className="text-[8px] text-[#c8a55a]/30 font-medium tracking-wider">ÉLITE</span>
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
      {/* Section Header — quiet, contemplative */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-7 h-7 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
          <Link2 size={13} className="text-[#c8a55a]/30" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-medium text-white/80">{SECTION_TITLE}</h2>
          <p className="text-[10px] text-[#444]">{SECTION_SUBTITLE}</p>
        </div>
        {/* Élite badge — barely visible, not promotional */}
        <div className="flex items-center gap-1 shrink-0">
          <Crown size={8} className="text-[#c8a55a]/30" />
          <span className="text-[8px] text-[#c8a55a]/30 font-medium tracking-wider">ÉLITE</span>
        </div>
      </div>

      {/* Observations */}
      {observations.length > 0 ? (
        <div className="space-y-3">
          {isPremium ? (
            // ── ÉLITE: Show all observations ──
            observations.map((obs) => (
              <ObservationCard key={obs.id} observation={obs} />
            ))
          ) : (
            // ── FREE: One blurred preview + subtle depth hint ──
            <>
              <PremiumPreview observation={observations[0]} />
            </>
          )}
        </div>
      ) : (
        // ── Enough data but no patterns detected — respectful silence ──
        <WaitingState />
      )}
    </div>
  );
}
