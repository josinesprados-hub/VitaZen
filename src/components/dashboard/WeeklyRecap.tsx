'use client';

import { useEffect, useState, useCallback } from 'react';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import Link from 'next/link';
import { WeeklyRecapSkeleton } from '@/components/ui/PremiumSkeleton';
import {
  CalendarRange,
  Activity,
  Flame,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Lightbulb,
  Wind,
  CheckCircle,
  BookOpen,
  Zap,
  ArrowRight,
  Mail,
  Circle,
} from 'lucide-react';
import PremiumGate, { PremiumInlineBadge } from '@/components/ui/PremiumGate';

// ─────────────────────────────────────────
// Types (match API response)
// ─────────────────────────────────────────

interface TopHabit {
  name: string;
  streak: number;
}

interface MainInsight {
  id: string;
  type: 'positive' | 'warning' | 'neutral' | 'trend';
  category: string;
  icon: string;
  title: string;
  description: string;
}

interface RecapData {
  weekLabel: string;
  score: number;
  scoreLabel: string;
  progress: {
    totalActivities: number;
    checkins: number;
    habitsCompleted: number;
    meditationSessions: number;
    journalEntries: number;
  };
  topHabits: TopHabit[];
  emotionalState: {
    status: string;
    statusLabel: string;
    statusDescription: string;
    energy: number;
    focus: number;
    calm: number;
    consistency: number;
    recommendation: string;
  };
  evolution: {
    emotionTrend: number;
    energyTrend: number;
    stressTrend: number;
    activityTrend: number;
    meditationTrend: number;
    habitTrend: number;
  } | null;
  mainInsight: MainInsight | null;
  mentorRecommendation: string;
  plan: string;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getScoreRingColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#c8a55a';
  if (score >= 30) return '#e8a849';
  return '#ef4444';
}

function getMetricLevel(value: number): string {
  if (value >= 65) return 'Alto';
  if (value >= 35) return 'Medio';
  return 'Bajo';
}

function getMetricColor(value: number): string {
  if (value >= 65) return '#c8a55a';
  if (value >= 35) return '#999';
  return '#666';
}

function TrendBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  // invert=true means positive when value is negative (e.g. stress going down)
  const positive = invert ? value < -0.2 : value > 0.2;
  const negative = invert ? value > 0.2 : value < -0.2;

  if (positive) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#22c55e]">
        <TrendingUp size={11} /> {invert ? '↓' : '↑'}
      </span>
    );
  }
  if (negative) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-champagne-warm">
        <TrendingDown size={11} /> {invert ? '↑' : '↓'}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-[#555]">
      <Minus size={11} /> —
    </span>
  );
}

function getInsightBorderClass(type: string): string {
  switch (type) {
    case 'positive': return 'border-[#22c55e]/15 hover:border-[#22c55e]/30';
    case 'warning': return 'border-champagne-warm/15 hover:border-champagne-warm/30';
    case 'trend': return 'border-champagne/15 hover:border-champagne/30';
    default: return 'border-[#1a1a1a] hover:border-[#2a2a2a]';
  }
}

function getCategoryHref(category: string): string {
  const map: Record<string, string> = {
    'hábitos': '/imperio/disciplina',
    'meditación': '/imperio/mente',
    'emociones': '/checkin',
    'energía': '/imperio/energia',
    'estrés': '/imperio/mente',
    'diario': '/imperio/crecimiento',
    'finanzas': '/imperio/riqueza',
    'nutrición': '/imperio/energia',
    'bienestar': '/insights',
    'consistencia': '/insights',
    'actividad': '/insights',
    'imperios': '/insights',
    'recomendación': '/imperio/mentor',
  };
  return map[category.toLowerCase()] || '/insights';
}

// ─────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────

export function WeeklyRecap() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const { isActive: screenshotMode, displayUser } = useScreenshotMode();
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [emailHover, setEmailHover] = useState(false);
  const isPremium = screenshotMode ? true : (displayUser?.plan === 'PREMIUM');

  const fetchRecap = useCallback(async () => {
    // ── Screenshot mode: use mock data, skip API calls ──
    if (screenshotMode) {
      setData({
        weekLabel: '5 — 11 may 2026',
        score: 73,
        scoreLabel: 'Bueno',
        progress: {
          totalActivities: 34,
          checkins: 5,
          habitsCompleted: 12,
          meditationSessions: 5,
          journalEntries: 4,
        },
        topHabits: [
          { name: 'Meditación matutina', streak: 7 },
          { name: 'Registrar finanzas', streak: 9 },
          { name: 'Lectura 20 páginas', streak: 5 },
        ],
        emotionalState: {
          status: 'enfocado',
          statusLabel: 'Enfocado',
          statusDescription: 'Claridad y energía alineadas.',
          energy: 75,
          focus: 82,
          calm: 65,
          consistency: 71,
          recommendation: 'Claridad. Lo que hagas con ella es tuyo.',
        },
        evolution: {
          emotionTrend: 0.3,
          energyTrend: 0.2,
          stressTrend: -0.15,
          activityTrend: 0.25,
          meditationTrend: 0.4,
          habitTrend: 0.2,
        },
        mainInsight: {
          id: 'demo-recap-insight',
          type: 'positive',
          category: 'hábitos',
          icon: '✅',
          title: 'Racha de 7 días en hábitos',
          description: '7 días seguidos en Disciplina.',
        },
        mentorRecommendation: 'Buen ritmo esta semana. La disciplina se nota.',
        plan: 'PREMIUM',
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch('/api/weekly-recap');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      } else {
        setError(true);
      }
    } catch (error) {
      console.error('Error fetching weekly recap:', error);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, screenshotMode]);

  useEffect(() => {
    fetchRecap();
  }, [fetchRecap]);

  // Loading skeleton
  if (loading) {
    return <WeeklyRecapSkeleton />;
  }

  if (!data || error) {
    // Calm fallback — no retry button, just elegant nothingness
    return (
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl overflow-hidden">
        <div className="px-4 py-4 sm:px-7 sm:py-7">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-champagne/5 flex items-center justify-center">
              <CalendarRange size={16} className="text-champagne/30 sm:w-[20px] sm:h-[20px]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-medium text-[#666]">Tu semana</h2>
              <p className="fallback-warm">Con más actividad aparecerá</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Score ring
  const scoreRadius = 38;
  const scoreCircumference = 2 * Math.PI * scoreRadius;
  const scoreDashoffset = scoreCircumference - (data.score / 100) * scoreCircumference;
  const scoreColor = getScoreRingColor(data.score);

  // Emotional metrics for small bars
  const emotionalMetrics = [
    { label: 'Energía', value: data.emotionalState.energy, icon: Zap },
    { label: 'Enfoque', value: data.emotionalState.focus, icon: Activity },
    { label: 'Calma', value: data.emotionalState.calm, icon: Heart },
    { label: 'Consistencia', value: data.emotionalState.consistency, icon: Flame },
  ];

  // Progress items
  const progressItems = [
    { label: 'Check-ins', value: data.progress.checkins, icon: Zap, unit: 'días', href: '/checkin' },
    { label: 'Hábitos', value: data.progress.habitsCompleted, icon: CheckCircle, unit: 'completados', href: '/imperio/disciplina' },
    { label: 'Meditación', value: data.progress.meditationSessions, icon: Wind, unit: 'sesiones', href: '/imperio/mente' },
    { label: 'Diario', value: data.progress.journalEntries, icon: BookOpen, unit: 'entradas', href: '/imperio/crecimiento' },
  ];

  // Mobile score ring (smaller)
  const mobileScoreRadius = 20;
  const mobileScoreCircumference = 2 * Math.PI * mobileScoreRadius;
  const mobileScoreDashoffset = mobileScoreCircumference - (data.score / 100) * mobileScoreCircumference;

  return (
    <div className="recap-fade-in">
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl overflow-hidden hover:border-champagne/15 transition-colors duration-300">
        {/* Header */}
        <div className="px-4 pt-4 pb-3 sm:px-7 sm:pt-7 sm:pb-5 sm:border-b sm:border-[#1a1a1a]/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-champagne/10 flex items-center justify-center">
                <CalendarRange size={16} className="text-champagne sm:w-[20px] sm:h-[20px]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base sm:text-lg font-semibold text-white">Tu semana</h2>
                  {isPremium && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-medium text-champagne/50">
                      <Circle size={3} fill="currentColor" className="text-champagne/40" />
                      Élite
                    </span>
                  )}
                </div>
                <p className="text-[10px] sm:text-[11px] text-[#666]">{data.weekLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {!isPremium && (
                <span className="text-[10px] text-[#555] items-center gap-1 hidden sm:flex">
                  <Circle size={3} fill="currentColor" className="text-champagne/30" />
                  Hay más aquí con el tiempo
                </span>
              )}
              <Link
                href="/insights"
                className="text-[10px] sm:text-[11px] text-champagne hover:underline flex items-center gap-1 transition-colors"
              >
                Ver todo <ArrowRight size={11} />
              </Link>
            </div>
          </div>

          {/* Mobile: compact score row — only visible on mobile */}
          <div className="flex sm:hidden items-center gap-3 mt-3 pt-3 border-t border-[#1a1a1a]/60">
            <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
                <circle cx="24" cy="24" r={mobileScoreRadius} fill="none" stroke="#1a1a1a" strokeWidth="3" />
                <circle
                  cx="24" cy="24" r={mobileScoreRadius}
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={mobileScoreCircumference}
                  strokeDashoffset={mobileScoreDashoffset}
                  className="recap-ring-transition"
                />
              </svg>
              <span className="text-xs font-bold text-white relative z-10">{data.score}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium">{data.scoreLabel}</p>
              <p className="text-[10px] text-[#666]">{data.progress.totalActivities} acciones</p>
            </div>
            <Link
              href="/insights"
              className="text-[10px] text-champagne hover:underline flex items-center gap-1 transition-colors"
            >
              Ver resumen <ArrowRight size={10} />
            </Link>
          </div>
        </div>

        {/* Body — hidden on mobile, visible on sm+ */}
        <div className="hidden sm:block p-3 sm:p-7 space-y-4 sm:space-y-7">
          {/* Row 1: Score + Emotional State */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
            {/* Wellness Score — clickable to insights */}
            <Link href="/insights" className="bg-[#000000] border border-[#1a1a1a] rounded-xl p-3 sm:p-6 flex items-center gap-3 sm:gap-6 hover:border-champagne/20 transition-all duration-200 cursor-pointer group touch-press">
              <div className="relative w-16 h-16 sm:w-24 sm:h-24 flex items-center justify-center shrink-0">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 96 96">
                  <circle
                    cx="48" cy="48" r={scoreRadius}
                    fill="none"
                    stroke="#1a1a1a"
                    strokeWidth="4"
                  />
                  <circle
                    cx="48" cy="48" r={scoreRadius}
                    fill="none"
                    stroke={scoreColor}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={scoreCircumference}
                    strokeDashoffset={scoreDashoffset}
                    className="recap-ring-transition"
                  />
                </svg>
                <div className="text-center relative z-10">
                  <p className="text-xl sm:text-2xl font-bold text-white">{data.score}</p>
                  <p className="text-[8px] sm:text-[9px] text-[#666] uppercase tracking-wider">/100</p>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-white mb-0.5 sm:mb-1 group-hover:text-champagne transition-colors">Tu semana</p>
                <p className="text-[11px] sm:text-[13px] mb-1.5 sm:mb-3" style={{ color: scoreColor }}>
                  {data.scoreLabel}
                </p>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Activity size={11} className="text-[#666] sm:w-[13px] sm:h-[13px]" />
                  <span className="text-[10px] sm:text-[11px] text-[#666]">
                    {data.progress.totalActivities} acciones
                  </span>
                </div>
              </div>
              <ArrowRight size={14} className="text-[#333] group-hover:text-champagne/50 transition-colors shrink-0" />
            </Link>

            {/* Emotional State — PREMIUM details */}
            <PremiumGate isPremium={isPremium} intensity="light" compact label="Métricas profundas">
              <div className="bg-[#000000] border border-[#1a1a1a] rounded-xl p-3 sm:p-6 hover:border-[#1a1a1a] transition-colors">
                <div className="flex items-center justify-between mb-2 sm:mb-4">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <Heart size={13} className="text-champagne sm:w-[15px] sm:h-[15px]" />
                    <p className="text-xs sm:text-sm font-semibold text-white">Estado emocional</p>
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full bg-champagne/10 text-champagne border border-champagne/20">
                    {data.emotionalState.statusLabel}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[12px] text-[#999] leading-relaxed mb-2 sm:mb-4 line-clamp-2 sm:line-clamp-none">
                  {data.emotionalState.statusDescription}
                </p>
                <div className="space-y-2 sm:space-y-3">
                  {emotionalMetrics.map((metric) => {
                    const Icon = metric.icon;
                    const color = getMetricColor(metric.value);
                    return (
                      <div key={metric.label} className="flex items-center gap-2 sm:gap-3">
                        <Icon size={10} style={{ color }} className="shrink-0 sm:w-[12px] sm:h-[12px]" />
                        <span className="text-[9px] sm:text-[11px] text-[#999] w-14 sm:w-20 shrink-0">{metric.label}</span>
                        <div className="flex-1 h-1 sm:h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div
                            className="h-1 sm:h-1.5 rounded-full recap-bar-transition"
                            style={{
                              width: `${metric.value}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                        <span className="text-[9px] sm:text-[10px] text-[#666] w-6 sm:w-8 text-right">{metric.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PremiumGate>
          </div>

          {/* Row 2: Progress + Top Habits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
            {/* Weekly Progress */}
            <div className="bg-[#000000] border border-[#1a1a1a] rounded-xl p-3 sm:p-6 hover:border-[#1a1a1a] transition-colors">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-5">
                <Flame size={13} className="text-champagne sm:w-[15px] sm:h-[15px]" />
                <p className="text-xs sm:text-sm font-semibold text-white">Tu actividad</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {progressItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-3 hover:border-champagne/15 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-1.5 mb-1 sm:mb-2">
                        <Icon size={10} className="text-champagne sm:w-[12px] sm:h-[12px]" />
                  <p className="text-[9px] sm:text-[10px] text-[#666] uppercase tracking-wider label-discrete">{item.label}</p>
                      </div>
                      <p className="text-lg sm:text-xl font-bold text-white">{item.value}</p>
                      <p className="text-[8px] sm:text-[9px] text-[#555]">{item.unit}</p>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Top Habits */}
            <div className="bg-[#000000] border border-[#1a1a1a] rounded-xl p-3 sm:p-6 hover:border-[#1a1a1a] transition-colors">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-5">
                <CheckCircle size={13} className="text-champagne sm:w-[15px] sm:h-[15px]" />
                <p className="text-xs sm:text-sm font-semibold text-white">Hábitos más consistentes</p>
              </div>
              {data.topHabits.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {data.topHabits.map((habit, idx) => (
                    <Link
                      key={habit.name}
                      href="/imperio/disciplina"
                      className="flex items-center gap-2 sm:gap-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2.5 sm:p-3.5 hover:border-champagne/15 transition-colors cursor-pointer group"
                    >
                      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-champagne/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] sm:text-[11px] font-bold text-champagne">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] sm:text-[13px] text-white font-medium truncate">{habit.name}</p>
                        <p className="text-[9px] sm:text-[10px] text-[#666]">
                          <Flame size={8} className="inline mr-0.5 text-champagne sm:w-[9px] sm:h-[9px]" />
                          {habit.streak}d racha
                        </p>
                      </div>
                      <div className="w-8 sm:w-10 h-1 sm:h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                        <div
                          className="h-1 sm:h-1.5 rounded-full bg-champagne recap-bar-transition"
                          style={{ width: `${Math.min((habit.streak / 14) * 100, 100)}%` }}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 sm:py-6">
                  <CheckCircle size={18} className="text-[#333] mx-auto mb-1.5 sm:mb-2 sm:w-[20px] sm:h-[20px]" />
                  <p className="text-[10px] sm:text-[12px] text-[#555]">Sin hábitos activos</p>
                  <p className="text-[9px] sm:text-[10px] text-[#444]"></p>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Evolution (PREMIUM gated with blur) + Main Insight */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-5">
            {/* Evolution vs Previous Week — PremiumGate */}
            <PremiumGate isPremium={isPremium} intensity="medium" label="Evolución semanal">
              <div className="bg-[#000000] border border-champagne/10 rounded-xl p-3 sm:p-6 hover:border-champagne/20 transition-colors">
                <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-5">
                  <TrendingUp size={13} className="text-champagne sm:w-[15px] sm:h-[15px]" />
                  <p className="text-xs sm:text-sm font-semibold text-white">Evolución vs. semana anterior</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <Link href="/checkin" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-3 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
                    <p className="text-[9px] sm:text-[10px] text-[#666] mb-1 sm:mb-1.5 group-hover:text-[#999] transition-colors">Emociones</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] sm:text-[13px] text-white font-medium">
                        {data.evolution?.emotionTrend != null ? `${data.evolution.emotionTrend > 0 ? '+' : ''}${data.evolution.emotionTrend}` : '—'}
                      </span>
                      {data.evolution && <TrendBadge value={data.evolution.emotionTrend} />}
                    </div>
                  </Link>
                  <Link href="/imperio/energia" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-3 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
                    <p className="text-[9px] sm:text-[10px] text-[#666] mb-1 sm:mb-1.5 group-hover:text-[#999] transition-colors">Energía</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] sm:text-[13px] text-white font-medium">
                        {data.evolution?.energyTrend != null ? `${data.evolution.energyTrend > 0 ? '+' : ''}${data.evolution.energyTrend}` : '—'}
                      </span>
                      {data.evolution && <TrendBadge value={data.evolution.energyTrend} />}
                    </div>
                  </Link>
                  <Link href="/imperio/mente" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-3 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
                    <p className="text-[9px] sm:text-[10px] text-[#666] mb-1 sm:mb-1.5 group-hover:text-[#999] transition-colors">Estrés</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] sm:text-[13px] text-white font-medium">
                        {data.evolution?.stressTrend != null ? (data.evolution.stressTrend > 0 ? '↓ bajó' : '↑ subió') : '—'}
                      </span>
                      {data.evolution && <TrendBadge value={data.evolution.stressTrend} invert />}
                    </div>
                  </Link>
                  <Link href="/insights" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-3 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
                    <p className="text-[9px] sm:text-[10px] text-[#666] mb-1 sm:mb-1.5 group-hover:text-[#999] transition-colors">Actividad</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] sm:text-[13px] text-white font-medium">
                        {data.evolution?.activityTrend != null ? `${data.evolution.activityTrend > 0 ? '+' : ''}${data.evolution.activityTrend}` : '—'}
                      </span>
                      {data.evolution && <TrendBadge value={data.evolution.activityTrend} />}
                    </div>
                  </Link>
                </div>
              </div>
            </PremiumGate>

            {/* Main Insight — clickable to relevant section */}
            <Link
              href={data.mainInsight ? getCategoryHref(data.mainInsight.category) : '/insights'}
              className="block bg-[#000000] border border-[#1a1a1a] rounded-xl p-3 sm:p-6 hover:border-champagne/20 transition-all duration-200 cursor-pointer group touch-press"
            >
              <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-5">
                <Sparkles size={13} className="text-champagne sm:w-[15px] sm:h-[15px]" />
                <p className="text-xs sm:text-sm font-semibold text-white group-hover:text-champagne transition-colors">Lo que destaca</p>
              </div>
              {data.mainInsight ? (
                <div
                  className={`bg-[#0a0a0a] border rounded-xl p-3 sm:p-4 transition-all duration-200 ${getInsightBorderClass(data.mainInsight.type)}`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="text-base sm:text-xl shrink-0 mt-0.5">{data.mainInsight.icon}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                        <h3 className="text-[11px] sm:text-[13px] font-semibold text-white">{data.mainInsight.title}</h3>
                        <span className="text-[7px] sm:text-[8px] px-1 sm:px-1.5 py-0.5 rounded-full bg-[#1a1a1a] text-[#666] uppercase tracking-wider">
                          {data.mainInsight.category}
                        </span>
                      </div>
                      <p className="text-[10px] sm:text-[12px] text-[#999] leading-relaxed line-clamp-2 sm:line-clamp-none">{data.mainInsight.description}</p>
                    </div>
                    <ArrowRight size={12} className="text-[#333] group-hover:text-champagne/50 transition-colors shrink-0 mt-1" />
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 sm:py-6">
                  <Sparkles size={18} className="text-[#333] mx-auto mb-1.5 sm:mb-2 sm:w-[20px] sm:h-[20px]" />
                  <p className="text-[10px] sm:text-[12px] text-[#555]">Sin insights</p>
                </div>
              )}
            </Link>
          </div>

          {/* Row 4: Mentor Recommendation — FREE gets truncated, PREMIUM full */}
          <Link href="/imperio/mentor" className="block bg-gradient-to-r from-champagne/5 via-[#0a0a0a] to-[#0a0a0a] border border-champagne/10 rounded-xl p-3 sm:p-6 relative overflow-hidden hover:border-champagne/20 transition-colors cursor-pointer group">
            {/* Subtle glow */}
            <div
              className="absolute inset-0 rounded-xl pointer-events-none"
              style={{ boxShadow: 'inset 0 1px 0 0 rgba(200, 165, 90, 0.05)' }}
            />
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                <Lightbulb size={13} className="text-champagne sm:w-[15px] sm:h-[15px]" />
                <p className="text-xs sm:text-sm font-semibold text-white">Observación</p>
                <PremiumInlineBadge
                  isPremium={isPremium}
                  freeLabel="Resumido"
                  premiumLabel="Completo"
                />
              </div>
              <p className={`text-[11px] sm:text-[13px] text-champagne/90 font-light italic leading-relaxed max-w-2xl ${
                isPremium ? '' : 'line-clamp-2'
              }`}>
                {data.mentorRecommendation}
              </p>
              {!isPremium && data.mentorRecommendation.length > 100 && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[9px] sm:text-[10px] text-champagne/60 group-hover:text-champagne transition-colors flex items-center gap-1">
                    <Circle size={3} fill="currentColor" className="text-champagne/30" /> Las conexiones aparecen con el tiempo
                  </span>
                </div>
              )}
            </div>
          </Link>

          {/* Email CTA */}
          <div className="pt-1 pb-0.5 sm:pt-2 sm:pb-1 flex items-center justify-center">
            <button
              onMouseEnter={() => setEmailHover(true)}
              onMouseLeave={() => setEmailHover(false)}
              className="hidden sm:flex items-center gap-2 text-[11px] text-[#555] hover:text-champagne transition-colors duration-300 group cursor-default"
            >
              <Mail size={12} className={`transition-colors duration-300 ${emailHover ? 'text-champagne' : 'text-[#444]'}`} />
              <span>Resumen semanal por email próximamente</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
