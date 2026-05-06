'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { EmotionalHeroSkeleton } from '@/components/ui/PremiumSkeleton';
import { Zap, Brain, Leaf, Repeat, TrendingUp, Activity, ArrowUpRight, ArrowDownRight, Minus, Sparkles } from 'lucide-react';
import type { EmotionalStatus, EmotionalMetric, EmotionalState } from '@/lib/emotional-state';

// ─────────────────────────────────────────
// Status config
// ─────────────────────────────────────────

const STATUS_CONFIG: Record<EmotionalStatus, {
  gradient: string;
  glowColor: string;
  iconBg: string;
  label: string;
  pulseClass: string;
}> = {
  estable: {
    gradient: 'from-[#c8a55a]/8 via-[#0a0a0a] to-[#0a0a0a]',
    glowColor: 'rgba(200, 165, 90, 0.08)',
    iconBg: 'bg-[#c8a55a]/10',
    label: 'Estable',
    pulseClass: '',
  },
  en_progreso: {
    gradient: 'from-[#c8a55a]/12 via-[#0a0a0a] to-[#0a0a0a]',
    glowColor: 'rgba(200, 165, 90, 0.12)',
    iconBg: 'bg-[#c8a55a]/10',
    label: 'En progreso',
    pulseClass: 'hero-pulse-gold',
  },
  sobrecargado: {
    gradient: 'from-[#8b6f3a]/10 via-[#0a0a0a] to-[#0a0a0a]',
    glowColor: 'rgba(139, 111, 58, 0.08)',
    iconBg: 'bg-[#8b6f3a]/15',
    label: 'Sobrecargado',
    pulseClass: 'hero-pulse-warm',
  },
  enfocado: {
    gradient: 'from-[#c8a55a]/15 via-[#0a0a0a] to-[#0a0a0a]',
    glowColor: 'rgba(200, 165, 90, 0.15)',
    iconBg: 'bg-[#c8a55a]/10',
    label: 'Enfocado',
    pulseClass: 'hero-pulse-gold',
  },
};

// ─────────────────────────────────────────
// Metric config
// ─────────────────────────────────────────

const METRIC_ICONS: Record<string, any> = {
  energy: Zap,
  focus: Brain,
  stress: Leaf,
  consistency: Repeat,
  progress: TrendingUp,
  activity: Activity,
};

function getMetricColor(value: number): string {
  if (value >= 70) return '#c8a55a';
  if (value >= 45) return '#999999';
  return '#666666';
}

function getMetricBarColor(value: number): string {
  if (value >= 70) return 'bg-[#c8a55a]';
  if (value >= 45) return 'bg-[#666]';
  return 'bg-[#444]';
}

// ─────────────────────────────────────────
// Trend indicator
// ─────────────────────────────────────────

function TrendIndicator({ trend }: { trend?: 'up' | 'down' | 'stable' }) {
  if (!trend || trend === 'stable') {
    return <Minus size={11} className="text-[#555]" />;
  }
  if (trend === 'up') {
    return <ArrowUpRight size={11} className="text-[#c8a55a]" />;
  }
  return <ArrowDownRight size={11} className="text-[#999]" />;
}

// ─────────────────────────────────────────
// Metric ring (circular progress)
// ─────────────────────────────────────────

function MetricRing({ metric, metricKey }: { metric: EmotionalMetric; metricKey: string }) {
  const Icon = METRIC_ICONS[metricKey] || Activity;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (metric.value / 100) * circumference;
  const color = getMetricColor(metric.value);

  return (
    <div className="flex flex-col items-center gap-2 group">
      <div className="relative w-16 h-16 flex items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
          <circle
            cx="32" cy="32" r={radius}
            fill="none"
            stroke="#1a1a1a"
            strokeWidth="3"
          />
          <circle
            cx="32" cy="32" r={radius}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="hero-ring-transition"
          />
        </svg>
        <Icon size={16} style={{ color }} className="relative z-10" />
      </div>
      <div className="text-center">
        <p className="text-[11px] text-[#999] leading-tight">{metric.label}</p>
        <div className="flex items-center justify-center gap-0.5 mt-0.5">
          <span className="text-xs font-semibold text-white">{metric.value}</span>
          <TrendIndicator trend={metric.trend} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────

export function EmotionalHero() {
  const { apiFetch } = useApi();
  const [state, setState] = useState<EmotionalState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchState = async () => {
      try {
        const res = await apiFetch('/api/emotional-state');
        if (res.ok) {
          const data = await res.json();
          setState(data);
        }
      } catch (error) {
        console.error('Error fetching emotional state:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchState();
  }, []);

  // Loading skeleton
  if (loading) {
    return <EmotionalHeroSkeleton />;
  }

  if (!state) return null;

  const config = STATUS_CONFIG[state.status];
  const metricsEntries = Object.entries(state.metrics) as [string, EmotionalMetric][];

  return (
    <div className="hero-section-container hero-fade-in">
      <div className={`hero-section-card bg-gradient-to-br ${config.gradient}`}>
        {/* Subtle glow */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none hero-glow"
          style={{ boxShadow: `inset 0 1px 0 0 ${config.glowColor}` }}
        />

        <div className="relative z-10">
          {/* Header: Status + Recommendation */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
            {/* Left: Status */}
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl ${config.iconBg} flex items-center justify-center shrink-0 ${config.pulseClass}`}>
                <Sparkles size={22} className="text-[#c8a55a]" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <h2 className="text-lg font-semibold text-white">Estado actual</h2>
                  <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#c8a55a]/10 text-[#c8a55a] border border-[#c8a55a]/20">
                    {config.label}
                  </span>
                </div>
                <p className="text-[13px] text-[#999] leading-relaxed max-w-md">
                  {state.statusDescription}
                </p>
              </div>
            </div>

            {/* Right: Summary + Recommendation */}
            <div className="sm:text-right shrink-0">
              <p className="text-[13px] text-[#c8a55a]/90 font-light italic leading-relaxed max-w-xs sm:ml-auto">
                {state.summary}
              </p>
              <div className="mt-2 sm:flex sm:justify-end">
                <p className="text-[11px] text-[#666] flex items-center gap-1 sm:justify-end">
                  <span className="text-[#c8a55a] text-[9px]">●</span>
                  {state.recommendation}
                </p>
              </div>
            </div>
          </div>

          {/* Metrics rings */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 sm:gap-2">
            {metricsEntries.map(([key, metric]) => (
              <MetricRing key={key} metric={metric} metricKey={key} />
            ))}
          </div>

          {/* Subtle bottom line */}
          <div className="mt-6 pt-4 border-t border-[#1a1a1a]/60">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[#444] uppercase tracking-widest font-medium">
                Lectura basada en tu actividad real
              </p>
              {state.plan === 'PREMIUM' && (
                <span className="text-[9px] text-[#c8a55a]/50 uppercase tracking-wider">
                  Tendencias vs. semana anterior
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
