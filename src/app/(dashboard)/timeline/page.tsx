'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { TimelineSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import PremiumGate, { PremiumHistoryGate, PremiumInlineBadge } from '@/components/ui/PremiumGate';
import PrivacyMask from '@/components/ui/PrivacyMask';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import {
  Wind,
  BookOpen,
  Heart,
  CheckCircle,
  Utensils,
  Wallet,
  Clock,
  Brain,
  Flame,
  Target,
  Gem,
} from 'lucide-react';
import { getMadridDateKey, getTodayDateKey, daysBetweenDateKeys } from '@/lib/dates';

// ─── Types ───────────────────────────────────────────────

interface TimelineItem {
  id: string;
  type: string;
  imperio: string;
  title: string;
  description: string;
  date: string;
  meta: Record<string, any>;
}

interface DayGroup {
  key: string;
  label: string;
  sublabel?: string;
  items: TimelineItem[];
}

// ─── Imperio Config ──────────────────────────────────────
// Each imperio has its own subtle accent — not loud, just present
// So the user feels which dimension of life is speaking

const IMPERIO_CONFIG: Record<string, {
  icon: any;
  accent: string;
  accentSubtle: string;
  dot: string;
  label: string;
}> = {
  mente: {
    icon: Brain,
    accent: 'text-[#8ba7c7]',
    accentSubtle: 'text-[#8ba7c7]/60',
    dot: 'bg-[#8ba7c7]/25 border-[#8ba7c7]/50',
    label: 'Mente',
  },
  energia: {
    icon: Flame,
    accent: 'text-[#8bc78b]',
    accentSubtle: 'text-[#8bc78b]/60',
    dot: 'bg-[#8bc78b]/25 border-[#8bc78b]/50',
    label: 'Energía',
  },
  disciplina: {
    icon: Target,
    accent: 'text-[#c7a98b]',
    accentSubtle: 'text-[#c7a98b]/60',
    dot: 'bg-[#c7a98b]/25 border-[#c7a98b]/50',
    label: 'Disciplina',
  },
  riqueza: {
    icon: Gem,
    accent: 'text-champagne',
    accentSubtle: 'text-champagne/60',
    dot: 'bg-champagne/25 border-champagne/50',
    label: 'Riqueza',
  },
};

// Activity type → imperio fallback (in case API doesn't send imperio)
const TYPE_IMPERIO: Record<string, string> = {
  meditation: 'mente',
  journal: 'mente',
  wellness: 'energia',
  nutrition: 'energia',
  habits: 'disciplina',
  finance: 'riqueza',
};

const TYPE_ICON: Record<string, any> = {
  meditation: Wind,
  journal: BookOpen,
  wellness: Heart,
  habits: CheckCircle,
  nutrition: Utensils,
  finance: Wallet,
};

// ─── Filter Config ───────────────────────────────────────
// Grouped by imperio, not by activity type — feels more human

const FILTERS = [
  { key: 'all', label: 'Todo', icon: Clock },
  { key: 'mente', label: 'Mente', icon: Brain },
  { key: 'energia', label: 'Energía', icon: Flame },
  { key: 'disciplina', label: 'Disciplina', icon: Target },
  { key: 'riqueza', label: 'Riqueza', icon: Gem },
] as const;

// ─── Date Grouping ───────────────────────────────────────

function dayKey(dateStr: string): string {
  return getMadridDateKey(new Date(dateStr));
}

function dayLabel(dateStr: string): { label: string; sublabel?: string } {
  const entryKey = getMadridDateKey(new Date(dateStr));
  const todayKey = getTodayDateKey();

  if (entryKey === todayKey) return { label: 'Hoy' };

  const diffDay = daysBetweenDateKeys(entryKey, todayKey);

  if (diffDay === 1) return { label: 'Ayer' };

  const [eY, eM, eD] = entryKey.split('-').map(Number);
  const entryDate = new Date(eY, eM - 1, eD);
  const dayName = entryDate.toLocaleDateString('es-ES', { weekday: 'long' });
  const dateStr2 = entryDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

  if (diffDay < 7) return { label: dateStr2, sublabel: dayName };
  return { label: dateStr2 };
}

// ─── Week rhythm detection ───────────────────────────────
// Detects which imperios were active in a given day,
// so we can show a subtle rhythm indicator

function dayImperios(items: TimelineItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const imp = item.imperio || TYPE_IMPERIO[item.type] || 'mente';
    seen.add(imp);
  }
  return Array.from(seen);
}

// ─── Component ───────────────────────────────────────────

export default function TimelinePage() {
  const { apiFetch } = useApi();
  const { user } = useAuth();
  const { displayUser } = useScreenshotMode();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const isPremium = displayUser?.plan === 'PREMIUM';

  const fetchTimeline = useCallback(async (category?: string) => {
    setLoading(true);
    setFetchError(false);
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.set('category', category);
      params.set('limit', '50');

      const res = await apiFetch(`/api/timeline?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      } else {
        setFetchError(true);
      }
    } catch (err) {
      console.error('[TIMELINE] Error:', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const handleFilter = (key: string) => {
    setActiveFilter(key);
    // Map imperio filters to their activity types for the API.
    // Imperios with a single type send that type; multi-type imperios (energia)
    // skip the server filter and rely on client-side filtering via TYPE_IMPERIO.
    const imperioToTypes: Record<string, string | undefined> = {
      mente: 'meditation',
      energia: undefined, // wellness + nutrition → fetch all, filter client-side
      disciplina: 'habits',
      riqueza: 'finance',
    };
    fetchTimeline(imperioToTypes[key]);
  };

  // Filter items client-side for imperios that span multiple activity types
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return items;
    return items.filter((item) => {
      const imp = item.imperio || TYPE_IMPERIO[item.type] || 'mente';
      return imp === activeFilter;
    });
  }, [items, activeFilter]);

  // Group by day — each day is a breath, a fragment
  const allGrouped: DayGroup[] = useMemo(() => {
    const groups: DayGroup[] = [];
    let currentKey = '';
    for (const item of filteredItems) {
      const key = dayKey(item.date);
      if (key !== currentKey) {
        currentKey = key;
        const { label, sublabel } = dayLabel(item.date);
        groups.push({ key, label, sublabel, items: [item] });
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }
    return groups;
  }, [filteredItems]);

  // FREE users: show only recent groups (up to ~7 days), gate the rest
  const FREE_VISIBLE_GROUPS = 3;
  const grouped = isPremium
    ? allGrouped
    : allGrouped.slice(0, FREE_VISIBLE_GROUPS);
  const hasHiddenHistory = !isPremium && allGrouped.length > FREE_VISIBLE_GROUPS;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header — quiet, no icon, just presence */}
      <div className="mb-8 sm:mb-12">
        <h1 className="text-lg sm:text-2xl font-bold text-white mb-1.5">
          Memoria
        </h1>
        <p className="subtitle-silent">Tu vida, vista desde aquí</p>
        <div className="mt-3">
          <PremiumInlineBadge
            isPremium={isPremium}
            freeLabel="7 días"
            premiumLabel="Historial completo"
          />
        </div>
      </div>

      {/* Filters — by imperio, not by activity type */}
      <div className="flex gap-2 mb-8 sm:mb-12 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scroll-pills">
        {FILTERS.map((cat) => {
          const isActive = activeFilter === cat.key;
          const Icon = cat.icon;
          const impConfig = cat.key !== 'all' ? IMPERIO_CONFIG[cat.key] : null;
          return (
            <button
              key={cat.key}
              onClick={() => handleFilter(cat.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 touch-press-sm ${
                isActive
                  ? impConfig
                    ? `${impConfig.accent} bg-white/[0.06]`
                    : 'bg-champagne text-[#000000]'
                  : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999] hover:border-[#333] hover:text-[#bbb]'
              }`}
            >
              <Icon size={14} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Timeline — memory, not feed */}
      {loading ? (
        <TimelineSkeleton />
      ) : fetchError ? (
        <PremiumErrorState
          variant="loading"
          title="No se pudo cargar"
          onRetry={() => fetchTimeline(activeFilter === 'all' ? undefined : activeFilter)}
          size="md"
        />
      ) : filteredItems.length === 0 ? (
        <PremiumEmptyState
          icon={Clock}
          title="Tu memoria empieza aquí"
          size="lg"
          variant="gold"
        />
      ) : (
        <div className="space-y-10 sm:space-y-14">
          {grouped.map((group) => {
            const imperios = dayImperios(group.items);

            return (
              <div key={group.key} className="animate-in">
                {/* Day header — breath, pause, presence */}
                <div className="mb-6 sm:mb-8">
                  <h2 className="text-sm sm:text-base font-medium text-white/80">
                    {group.label}
                  </h2>
                  {group.sublabel && (
                    <p className="text-xs text-[#555] mt-0.5 capitalize">{group.sublabel}</p>
                  )}
                  {/* Imperio rhythm dots — which dimensions were present this day */}
                  {imperios.length > 1 && (
                    <div className="flex items-center gap-2 mt-2.5">
                      {imperios.map((imp) => {
                        const cfg = IMPERIO_CONFIG[imp];
                        if (!cfg) return null;
                        const ImpIcon = cfg.icon;
                        return (
                          <div
                            key={imp}
                            className={`w-5 h-5 rounded-full border flex items-center justify-center ${cfg.dot}`}
                            title={cfg.label}
                          >
                            <ImpIcon size={9} className={cfg.accent} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Day items — fragments, not cards */}
                <div className="space-y-3 sm:space-y-4 pl-2 sm:pl-3 border-l border-[#1a1a1a] ml-1">
                  {group.items.map((item) => {
                    const imperio = item.imperio || TYPE_IMPERIO[item.type] || 'mente';
                    const impConfig = IMPERIO_CONFIG[imperio] || IMPERIO_CONFIG.mente;
                    const ImpIcon = impConfig.icon;
                    const TypeIcon = TYPE_ICON[item.type] || Heart;

                    // Determine emotional weight — some moments carry more presence
                    const isSubstantial =
                      item.type === 'journal' ||
                      (item.type === 'wellness' && item.meta.notes) ||
                      (item.type === 'finance' && Number(item.meta.amount) >= 50);

                    return (
                      <div
                        key={item.id}
                        className={`relative group ${isSubstantial ? 'py-2' : ''}`}
                      >
                        {/* Imperio dot on the left line */}
                        <div className={`absolute -left-[5px] sm:-left-[9px] top-2.5 w-1.5 h-1.5 rounded-full border ${impConfig.dot}`} />

                        {/* Fragment content */}
                        <div className={`${isSubstantial ? 'pl-5 sm:pl-6' : 'pl-5 sm:pl-6'}`}>
                          {/* Light items — just a line */}
                          {!isSubstantial && (
                            <div className="flex items-baseline gap-2.5">
                              <span className={`text-xs ${impConfig.accentSubtle}`}>
                                <TypeIcon size={11} className="inline -mt-0.5 mr-1" />
                                {item.title}
                              </span>
                              {item.description && (
                                <span className="text-[11px] text-[#555] truncate">
                                  {item.description}
                                </span>
                              )}
                              {item.type === 'finance' && (
                                <span className={`text-[11px] font-medium ${
                                  item.meta.financeType === 'income' ? 'text-[#8bc78b]/70' : 'text-red-400/70'
                                }`}>
                                  {item.meta.financeType === 'income' ? '+' : '-'}<PrivacyMask compact>{formatCurrency(Number(item.meta.amount))}</PrivacyMask>
                                </span>
                              )}
                              {item.type === 'habits' && item.meta.streak > 0 && (
                                <span className="text-[10px] text-[#c7a98b]/50">
                                  <PrivacyMask compact>{item.meta.streak}</PrivacyMask>d
                                </span>
                              )}
                            </div>
                          )}

                          {/* Substantial items — more presence, more air */}
                          {isSubstantial && (
                            <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-4 py-3.5 sm:px-5 sm:py-4 hover:border-[#222] transition-colors duration-300">
                              {/* Imperio label */}
                              <div className="flex items-center gap-1.5 mb-2">
                                <ImpIcon size={11} className={impConfig.accentSubtle} />
                                <span className={`text-[10px] uppercase tracking-widest font-medium ${impConfig.accentSubtle}`}>
                                  {impConfig.label}
                                </span>
                              </div>

                              {/* Title */}
                              <h3 className="text-white/90 font-medium text-sm leading-snug">
                                {item.title}
                              </h3>

                              {/* Description */}
                              {item.description && (
                                <p className="text-[#666] text-xs mt-1.5 leading-relaxed line-clamp-3">
                                  {item.description}
                                </p>
                              )}

                              {/* Finance amount */}
                              {item.type === 'finance' && (
                                <span className={`inline-flex items-center mt-2 text-xs font-medium ${
                                  item.meta.financeType === 'income' ? 'text-[#8bc78b]/80' : 'text-red-400/80'
                                }`}>
                                  {item.meta.financeType === 'income' ? '+' : '-'}<PrivacyMask compact>{formatCurrency(Number(item.meta.amount))}</PrivacyMask>
                                </span>
                              )}

                              {/* Wellness scores — quiet, not clinical */}
                              {item.type === 'wellness' && item.meta.mood && (
                                <div className="flex gap-3 mt-2.5">
                                  {[
                                    { label: 'Ánimo', val: item.meta.mood },
                                    { label: 'Energía', val: item.meta.energy },
                                    { label: 'Sueño', val: item.meta.sleep },
                                    { label: 'Estrés', val: item.meta.stress },
                                  ].map(({ label, val }) => (
                                    <span key={label} className="text-[10px] text-[#444]">
                                      {label} <span className="text-[#666]"><PrivacyMask compact>{val}</PrivacyMask></span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Premium history gate */}
          {hasHiddenHistory && (
            <div className="mt-6">
              <PremiumGate isPremium={false} intensity="medium" label="Historial completo">
                <div className="space-y-3">
                  <div className="h-16 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl" />
                  <div className="h-16 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl" />
                </div>
              </PremiumGate>
              <PremiumHistoryGate isPremium={isPremium} label="historial completo" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
