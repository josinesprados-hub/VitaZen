'use client';

// ═══════════════════════════════════════════
// Patrones de Vida — Life Patterns Section
// ═══════════════════════════════════════════
//
// "No parece una app intentando analizarme.
//  Parece un espacio que, a veces,
//  refleja algo importante."
//
// Stability principles:
// - NEVER returns null — always reserves its space
// - Cache-first: shows cached data instantly, updates silently
// - Weight-based persistence: profunda lasts 4 weeks,
//   relevante 2 weeks, ligera 1 week
// - More negative space than content
// - Minimal visual elements
// - Calm, slow, contemplative rhythm
// - No visual noise. No density.
// ═══════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Circle, Link2 } from 'lucide-react';
import { EMPTY_STATE_MESSAGE, SECTION_TITLE, SECTION_SUBTITLE } from '@/lib/patterns/copy';
import type { ObservationWeight } from '@/lib/patterns/types';

// ─── Types ───

interface ObservationData {
  id: string;
  text: string;
  empires: string[];
  weight: ObservationWeight;
}

interface PatternsResponse {
  observations: ObservationData[];
  hasEnoughData: boolean;
  totalDataPoints: number;
}

// ─── Week helper ───

function getISOWeekKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return `${d.getFullYear()}-W${1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)}`;
}

// ─── Weight-based cache ───
// Observations persist for different durations depending on weight.
// profunda: 4 weeks, relevante: 2 weeks, ligera: 1 week.
// A cached observation is valid if its age < its weight's duration.

const WEIGHT_WEEKS: Record<ObservationWeight, number> = {
  ligera: 1,
  relevante: 2,
  profunda: 4,
};

const CACHE_KEY_PREFIX = 'vz_patterns_';

interface CachedObservation {
  id: string;
  text: string;
  empires: string[];
  weight: ObservationWeight;
  cachedWeek: string; // ISO week when this was cached
}

interface CachedPatterns {
  observations: CachedObservation[];
  hasEnoughData: boolean;
  totalDataPoints: number;
}

function weekDiff(a: string, b: string): number {
  // Simple week difference for YYYY-WNN format
  const parseWeek = (w: string) => {
    const [y, wn] = w.split('-W').map(Number);
    return y * 52 + wn;
  };
  return parseWeek(b) - parseWeek(a);
}

function getValidCachedObservations(userId: string): CachedPatterns | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + userId);
    if (!raw) return null;
    const cached: CachedPatterns = JSON.parse(raw);

    const currentWeek = getISOWeekKey();

    // Filter: keep observations that haven't exceeded their weight duration
    const valid = cached.observations.filter(obs => {
      const age = weekDiff(obs.cachedWeek, currentWeek);
      return age < WEIGHT_WEEKS[obs.weight];
    });

    if (valid.length === 0 && cached.observations.length > 0) {
      // All expired — clear cache to trigger fresh fetch
      localStorage.removeItem(CACHE_KEY_PREFIX + userId);
      return null;
    }

    return {
      ...cached,
      observations: valid,
    };
  } catch {
    return null;
  }
}

function setCachedObservations(userId: string, data: PatternsResponse): void {
  try {
    const currentWeek = getISOWeekKey();
    const cached: CachedPatterns = {
      observations: data.observations.map(obs => ({
        ...obs,
        cachedWeek: currentWeek,
      })),
      hasEnoughData: data.hasEnoughData,
      totalDataPoints: data.totalDataPoints,
    };
    localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify(cached));
  } catch {
    // localStorage unavailable — graceful
  }
}

// ─── Single Observation ───
// Maximum calm. Minimum visual. Just the text and a whisper.

function ObservationCard({ observation }: { observation: ObservationData }) {
  return (
    <div className="py-5 sm:py-6">
      <p className="text-[#c8a55a]/70 text-base sm:text-lg italic leading-relaxed">
        {observation.text}
      </p>

      {observation.empires.length > 1 && (
        <div className="flex items-center gap-1.5 mt-3 sm:mt-4">
          {observation.empires.map((empire, i) => (
            <span key={i} className="text-[9px] sm:text-[10px] text-[#2a2a2a] tracking-wide">
              {i > 0 && <span className="text-[#1a1a1a] mr-1.5">·</span>}
              {empire}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empty / Waiting State ───

function WaitingState() {
  return (
    <div className="text-center py-8 sm:py-10">
      <p className="text-xs sm:text-sm text-[#333] leading-relaxed max-w-xs mx-auto">
        {EMPTY_STATE_MESSAGE}
      </p>
    </div>
  );
}

// ─── Premium Preview ───

function PremiumPreview({ observation }: { observation: ObservationData }) {
  return (
    <div className="relative">
      <div className="opacity-35 select-none pointer-events-none">
        <ObservationCard observation={observation} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-1.5">
          <Circle size={3} className="text-[#c8a55a]/25" fill="currentColor" />
          <span className="text-[10px] text-[#444]">Más conexiones con el tiempo</span>
        </div>
      </div>
    </div>
  );
}

// ─── Silent Skeleton ───
// During first load (no cache), reserve space silently.
// No shimmer. No animation. Just presence.

function SilentSkeleton() {
  return (
    <div className="py-6 sm:py-8">
      <div className="flex items-center gap-2 mb-4">
        <Link2 size={11} className="text-[#c8a55a]/10" />
        <span className="text-[11px] text-[#222]">{SECTION_TITLE}</span>
      </div>
      <div className="py-4 sm:py-5">
        <div className="h-4 bg-[#0a0a0a] rounded w-3/4 sm:w-2/3" />
        <div className="h-3 bg-[#0a0a0a] rounded w-1/2 sm:w-2/5 mt-2" />
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function LifePatternsSection() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [data, setData] = useState<PatternsResponse | null>(null);
  const [mounted, setMounted] = useState(false);
  const fetchedRef = useRef(false);

  const isPremium = user?.plan === 'PREMIUM';

  // Mount guard — prevent hydration issues with localStorage
  useEffect(() => { setMounted(true); }, []);

  const fetchPatterns = useCallback(async () => {
    try {
      // Check cache first — weight-based persistence
      if (user?.id) {
        const cached = getValidCachedObservations(user.id);
        if (cached && cached.observations.length > 0) {
          setData({
            observations: cached.observations,
            hasEnoughData: cached.hasEnoughData,
            totalDataPoints: cached.totalDataPoints,
          });
          // Data from cache — already visible. No loading state needed.
          // Silently refresh in background for next visit.
          try {
            const res = await apiFetch('/api/patterns');
            if (res.ok) {
              const result = await res.json();
              setData(result);
              setCachedObservations(user.id, result);
            }
          } catch {
            // Background refresh failed — cached data still showing, this is fine
          }
          return;
        }
      }

      const res = await apiFetch('/api/patterns');
      if (res.ok) {
        const result = await res.json();
        setData(result);

        if (user?.id) {
          setCachedObservations(user.id, result);
        }
      }
    } catch (error) {
      console.error('[Patrones] Error fetching:', error);
    }
  }, [apiFetch, user?.id]);

  useEffect(() => {
    if (!mounted) return;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchPatterns();
    }
  }, [fetchPatterns, mounted]);

  // Before mount: show silent skeleton to prevent hydration mismatch
  // and reserve the section's visual space.
  if (!mounted) return <SilentSkeleton />;

  // Loading state (no cache, first fetch pending)
  if (!data) return <SilentSkeleton />;

  // Not enough data yet — silence, not a skeleton
  if (!data.hasEnoughData && data.observations.length === 0) {
    return null;
  }

  const observations = data.observations;

  return (
    <div className="py-2 sm:py-4">
      {/* Header — whisper, not announcement */}
      <div className="flex items-center gap-2 mb-3">
        <Link2 size={10} className="text-[#c8a55a]/15" />
        <span className="text-[10px] sm:text-[11px] text-[#333]">{SECTION_TITLE}</span>
        <Circle size={3} className="text-[#c8a55a]/15 ml-auto" fill="currentColor" />
      </div>

      {/* Observations */}
      {observations.length > 0 ? (
        <div className="divide-y divide-[#111]">
          {isPremium ? (
            observations.map((obs) => (
              <ObservationCard key={obs.id} observation={obs} />
            ))
          ) : (
            <PremiumPreview observation={observations[0]} />
          )}
        </div>
      ) : (
        <WaitingState />
      )}
    </div>
  );
}
