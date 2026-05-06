'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import {
  Wind,
  BookOpen,
  Heart,
  CheckCircle,
  Utensils,
  Wallet,
  Filter,
  Clock,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────

interface TimelineItem {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  meta: Record<string, any>;
}

// ─── Category Config ─────────────────────────────────────

const CATEGORIES = [
  { key: 'all', label: 'Todo', icon: Filter },
  { key: 'meditation', label: 'Meditación', icon: Wind },
  { key: 'journal', label: 'Diario', icon: BookOpen },
  { key: 'wellness', label: 'Bienestar', icon: Heart },
  { key: 'habits', label: 'Hábitos', icon: CheckCircle },
  { key: 'nutrition', label: 'Nutrición', icon: Utensils },
  { key: 'finance', label: 'Finanzas', icon: Wallet },
] as const;

const TYPE_CONFIG: Record<string, { icon: any; accent: string; bg: string; border: string }> = {
  meditation: { icon: Wind, accent: 'text-[#c8a55a]', bg: 'bg-[#c8a55a]/10', border: 'border-[#c8a55a]/20' },
  journal:    { icon: BookOpen, accent: 'text-[#c8a55a]', bg: 'bg-[#c8a55a]/10', border: 'border-[#c8a55a]/20' },
  wellness:   { icon: Heart, accent: 'text-[#c8a55a]', bg: 'bg-[#c8a55a]/10', border: 'border-[#c8a55a]/20' },
  habits:     { icon: CheckCircle, accent: 'text-[#c8a55a]', bg: 'bg-[#c8a55a]/10', border: 'border-[#c8a55a]/20' },
  nutrition:  { icon: Utensils, accent: 'text-[#c8a55a]', bg: 'bg-[#c8a55a]/10', border: 'border-[#c8a55a]/20' },
  finance:    { icon: Wallet, accent: 'text-[#c8a55a]', bg: 'bg-[#c8a55a]/10', border: 'border-[#c8a55a]/20' },
};

const TYPE_LABELS: Record<string, string> = {
  meditation: 'Meditación',
  journal: 'Diario',
  wellness: 'Bienestar',
  habits: 'Hábitos',
  nutrition: 'Nutrición',
  finance: 'Finanzas',
};

// ─── Relative Date ───────────────────────────────────────

function relativeDate(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Ahora mismo';
  if (diffMin < 60) return `Hace ${diffMin}min`;
  if (diffH < 24) return `Hace ${diffH}h`;
  if (diffDay === 1) return 'Ayer';
  if (diffDay < 7) return `Hace ${diffDay} días`;
  if (diffDay < 30) {
    const weeks = Math.floor(diffDay / 7);
    return weeks === 1 ? 'Hace 1 semana' : `Hace ${weeks} semanas`;
  }
  return new Date(dateStr).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

// ─── Date Separator ──────────────────────────────────────

function dateGroup(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffDay === 0) return 'Hoy';
  if (diffDay === 1) return 'Ayer';
  if (diffDay < 7) return 'Esta semana';
  if (diffDay < 14) return 'Hace 2 semanas';
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

// ─── Component ───────────────────────────────────────────

export default function TimelinePage() {
  const { apiFetch } = useApi();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchTimeline = useCallback(async (category?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (category && category !== 'all') params.set('category', category);
      params.set('limit', '50');

      const res = await apiFetch(`/api/timeline?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('[TIMELINE] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const handleFilter = (key: string) => {
    setActiveFilter(key);
    fetchTimeline(key === 'all' ? undefined : key);
  };

  // Group items by date
  const grouped: { label: string; items: TimelineItem[] }[] = [];
  let currentLabel = '';
  for (const item of items) {
    const label = dateGroup(item.date);
    if (label !== currentLabel) {
      currentLabel = label;
      grouped.push({ label, items: [item] });
    } else {
      grouped[grouped.length - 1].items.push(item);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Clock size={24} className="text-[#c8a55a]" />
          <h1 className="text-2xl font-bold text-white">Timeline</h1>
        </div>
        <p className="text-[#999] text-sm">Tu historial completo de actividad</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
        {CATEGORIES.map((cat) => {
          const isActive = activeFilter === cat.key;
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              onClick={() => handleFilter(cat.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-[#c8a55a] text-[#000000]'
                  : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#999] hover:border-[#c8a55a]/30 hover:text-[#c8a55a]'
              }`}
            >
              <Icon size={14} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <img src="/images/vitazen-logo.png" alt="VitaZen" className="w-10 h-10 animate-pulse" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-4">
            <Clock size={24} className="text-[#555]" />
          </div>
          <p className="text-[#666] text-sm">Aún no hay actividad registrada</p>
          <p className="text-[#444] text-xs mt-1">Comienza registrando tu primera actividad</p>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-[#1a1a1a] hidden sm:block" />

          <div className="space-y-10">
            {grouped.map((group) => (
              <div key={group.label}>
                {/* Group label */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-[39px] flex justify-center hidden sm:flex">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#c8a55a]/30 border border-[#c8a55a]" />
                  </div>
                  <h2 className="text-xs uppercase tracking-widest font-semibold text-[#c8a55a]">
                    {group.label}
                  </h2>
                  <div className="flex-1 h-px bg-[#1a1a1a]" />
                </div>

                {/* Items */}
                <div className="space-y-3">
                  {group.items.map((item, index) => {
                    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.wellness;
                    const Icon = config.icon;
                    const label = TYPE_LABELS[item.type] || item.type;

                    return (
                      <div
                        key={item.id}
                        className="relative flex gap-4 group animate-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {/* Timeline dot + line */}
                        <div className="flex-shrink-0 w-[39px] flex flex-col items-center hidden sm:flex">
                          <div
                            className={`w-[39px] h-[39px] rounded-xl ${config.bg} border ${config.border} flex items-center justify-center transition-all duration-200 group-hover:scale-110 group-hover:border-[#c8a55a]/40`}
                          >
                            <Icon size={16} className={config.accent} />
                          </div>
                        </div>

                        {/* Card */}
                        <div className="flex-1 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-all duration-300 group-hover:bg-[#0d0d0d]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] uppercase tracking-widest font-semibold text-[#c8a55a]/60">
                                  {label}
                                </span>
                              </div>
                              <h3 className="text-white font-medium text-sm truncate">
                                {item.title}
                              </h3>
                              <p className="text-[#777] text-xs mt-1 line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>

                              {/* Extra meta for specific types */}
                              {item.type === 'wellness' && item.meta.mood && (
                                <div className="flex gap-3 mt-2.5">
                                  {['Ánimo', 'Energía', 'Sueño', 'Estrés'].map((label, i) => {
                                    const val = [item.meta.mood, item.meta.energy, item.meta.sleep, item.meta.stress][i];
                                    return (
                                      <span key={label} className="text-[10px] text-[#555]">
                                        {label} <span className="text-[#c8a55a]/80">{val}/5</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {item.type === 'habits' && item.meta.streak > 0 && (
                                <span className="inline-flex items-center gap-1 mt-2 text-[10px] text-[#c8a55a]/70">
                                  Racha de {item.meta.streak} días
                                </span>
                              )}

                              {item.type === 'finance' && (
                                <span
                                  className={`inline-flex items-center mt-2 text-xs font-semibold ${
                                    item.meta.financeType === 'income' ? 'text-green-400' : 'text-red-400'
                                  }`}
                                >
                                  {item.meta.financeType === 'income' ? '+' : '-'}{Number(item.meta.amount).toFixed(2)}€
                                </span>
                              )}
                            </div>

                            <span className="text-[10px] text-[#555] whitespace-nowrap flex-shrink-0 pt-0.5">
                              {relativeDate(item.date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
