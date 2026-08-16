'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useApi } from '@/hooks/useApi';
import Link from 'next/link';
import { InsightsSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import PremiumGate, { PremiumInlineBadge } from '@/components/ui/PremiumGate';
import { formatCurrency } from '@/lib/utils';
import ContextualHelp from '@/components/ui/ContextualHelp';
import PrivacyMask from '@/components/ui/PrivacyMask';
import {
  SCREENSHOT_INSIGHTS_SUMMARY,
  SCREENSHOT_INSIGHTS_LIST,
  SCREENSHOT_WEEKLY_COMPARISON,
} from '@/lib/screenshot-data';
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Circle,
  TrendingUp,
  TrendingDown,
  Minus,
  Wind,
  CheckCircle,
  BookOpen,
  Zap,
  Gem,
  Target,
  Flame,
  Star,
  Brain,
  Activity,
  Lightbulb,
} from 'lucide-react';

// ─────────────────────────────────────────
// Types (match API response)
// ─────────────────────────────────────────

interface Insight {
  id: string;
  type: 'positive' | 'warning' | 'neutral' | 'trend';
  category: string;
  icon: string;
  title: string;
  description: string;
  value?: string;
}

interface WeeklySummary {
  weekLabel: string;
  score: number;
  totalActivities: number;
  checkins: { count: number; avgEmotion: number; avgEnergy: number; avgFocus: number; avgStress: number };
  habits: { completed: number; topStreak: number; topHabit: string | null };
  meditation: { sessions: number; totalMinutes: number; avgDuration: number };
  journal: { entries: number };
  wellness: { logs: number; avgMood: number; avgSleep: number };
  nutrition: { logs: number; avgWater: number };
  finance: { income: number; expense: number; balance: number };
  streaks: { bestEmpireStreak: number; bestEmpireName: string | null };
}

interface WeeklyComparison {
  emotionTrend: number;
  energyTrend: number;
  stressTrend: number;
  activityTrend: number;
  meditationTrend: number;
  habitTrend: number;
}

interface InsightsData {
  summary: WeeklySummary;
  insights: Insight[];
  comparison: WeeklyComparison | null;
  plan: string;
}

// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#b8995e';   // muted champagne — less orange, more editorial
  if (score >= 30) return '#c49856';   // warm amber — not neon, still warm
  return '#ef4444';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Muy activo';
  if (score >= 60) return 'Actividad moderada';
  if (score >= 40) return 'Semana tranquila';
  return 'Poca actividad';
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

function getInsightBorderClass(type: string): string {
  switch (type) {
    case 'positive': return 'border-[#22c55e]/20 hover:border-[#22c55e]/40';
    case 'warning': return 'border-champagne-warm/20 hover:border-champagne-warm/40';
    case 'trend': return 'border-champagne-soft/20 hover:border-champagne-soft/40';
    default: return 'border-[#1a1a1a] hover:border-[#2a2a2a]';
  }
}

function getInsightBadgeClass(type: string): string {
  switch (type) {
    case 'positive': return 'bg-[#22c55e]/10 text-[#22c55e]';
    case 'warning': return 'bg-champagne-warm/10 text-champagne-warm';
    case 'trend': return 'bg-champagne-soft/10 text-champagne-soft';
    default: return 'bg-[#1a1a1a] text-[#888]';
  }
}

function TrendIndicator({ value, label }: { value: number; label: string }) {
  if (value > 0.2) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-[#22c55e]">
        <TrendingUp size={12} /> {label} ↑
      </span>
    );
  }
  if (value < -0.2) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-champagne-warm">
        <TrendingDown size={12} /> {label} ↓
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-[#888]">
      <Minus size={12} /> {label} —
    </span>
  );
}

// ─────────────────────────────────────────
// Page Component
// ─────────────────────────────────────────

export default function InsightsPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const { isActive: screenshotMode, displayUser } = useScreenshotMode();
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const isPremium = displayUser?.plan === 'PREMIUM';

  const fetchInsights = useCallback(async () => {
    // ── Screenshot mode: use mock data, skip API calls ──
    if (screenshotMode) {
      setData({
        summary: SCREENSHOT_INSIGHTS_SUMMARY,
        insights: SCREENSHOT_INSIGHTS_LIST,
        comparison: SCREENSHOT_WEEKLY_COMPARISON,
        plan: 'PREMIUM',
      });
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch('/api/insights');
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, screenshotMode]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (loading) {
    return <InsightsSkeleton />;
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto min-h-[50dvh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="No se pudieron cargar las observaciones"
          subtitle="Tu actividad está guardada. Intenta recargar para ver tus datos."
          onRetry={() => window.location.reload()}
          secondaryAction={{
            label: 'Volver al dashboard',
            href: '/dashboard',
          }}
          size="lg"
        />
      </div>
    );
  }

  const { summary, insights, comparison } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Contextual Help — hidden in screenshot mode */}
      {!screenshotMode && (
        <ContextualHelp
          storageKey="vitazen_help_insights"
          title="Observaciones semanales"
          text="Cada semana se observan tus datos y se generan notas automáticas. Tendencias y patrones, cuando aparecen."
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2.5 rounded-xl text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="title-page">Observaciones</h1>
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-champagne/50">
                  <Circle size={3} fill="currentColor" className="text-champagne/40" />
                  Élite
                </span>
              )}
            </div>
            <p className="text-[#999] text-sm">{summary.weekLabel}</p>
          </div>
        </div>
      </div>

      {/* Wellness Score Card — clickable to checkin */}
      <div onClick={() => router.push('/checkin')} className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 hover:border-champagne/20 transition-all duration-200 cursor-pointer group touch-press">
        <PrivacyMask>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity size={22} className="text-champagne" />
            <h2 className="title-section group-hover:text-champagne transition-colors">Cómo te sientes</h2>
          </div>
          <div className="text-right flex items-center gap-2">
            <div>
              <p className="text-3xl font-bold" style={{ color: getScoreColor(summary.score) }}>
                {summary.score}
              </p>
              <p className="text-xs" style={{ color: getScoreColor(summary.score) }}>
                {getScoreLabel(summary.score)}
              </p>
            </div>
            <ArrowRight size={14} className="text-[#999] group-hover:text-champagne/50 transition-colors shrink-0" />
          </div>
        </div>

        {/* Score bar */}
        <div className="w-full bg-[#1a1a1a] rounded-full h-3 overflow-hidden mb-4">
          <div
            className="h-3 rounded-full transition-all duration-1000 ease-out"
            style={{
              width: `${summary.score}%`,
              backgroundColor: getScoreColor(summary.score),
            }}
          />
        </div>

        {/* Activity summary pills — clickable to relevant sections */}
        <div className="flex flex-wrap gap-3">
          {[
            { icon: Wind, label: 'Meditación', value: `${summary.meditation.sessions} sesiones`, href: '/imperio/mente' },
            { icon: CheckCircle, label: 'Hábitos', value: `${summary.habits.completed} completados`, href: '/imperio/disciplina' },
            { icon: BookOpen, label: 'Diario', value: `${summary.journal.entries} entradas`, href: '/imperio/crecimiento' },
            { icon: Zap, label: 'Check-ins', value: `${summary.checkins.count} días`, href: '/checkin' },
          ].map(item => (
            <Link
              key={item.label}
              href={item.href}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-2 bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2 hover:border-champagne/15 transition-colors cursor-pointer"
            >
              <item.icon size={14} className="text-champagne" />
              <span className="text-xs text-[#999]">{item.label}:</span>
              <span className="text-xs text-white font-medium">{item.value}</span>
            </Link>
          ))}
        </div>
        </PrivacyMask>
      </div>

      {/* Weekly Comparison — PREMIUM gated with blur, each trend card navigates */}
      <PremiumGate isPremium={isPremium} intensity="medium" label="Comparativa semanal">
        <div className="bg-[#0a0a0a] border border-champagne/15 rounded-xl p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-5">
            <Lightbulb size={20} className="text-champagne" />
            <h2 className="title-section">Semana a semana</h2>
            <span className="text-[10px] text-champagne/60">frente a la semana anterior</span>
          </div>
          <PrivacyMask compact>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Link href="/checkin" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#888] mb-2 group-hover:text-[#999] transition-colors">Emociones</p>
              <TrendIndicator value={comparison?.emotionTrend ?? 0} label={`${(comparison?.emotionTrend ?? 0) > 0 ? '+' : ''}${comparison?.emotionTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/energia" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#888] mb-2 group-hover:text-[#999] transition-colors">Energía</p>
              <TrendIndicator value={comparison?.energyTrend ?? 0} label={`${(comparison?.energyTrend ?? 0) > 0 ? '+' : ''}${comparison?.energyTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/mente" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#888] mb-2 group-hover:text-[#999] transition-colors">Estrés</p>
              <TrendIndicator value={comparison?.stressTrend ?? 0} label={(comparison?.stressTrend ?? 0) > 0 ? '↓ bajó' : '↑ subió'} />
            </Link>
            <Link href="/insights" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#888] mb-2 group-hover:text-[#999] transition-colors">Actividad total</p>
              <TrendIndicator value={comparison?.activityTrend ?? 0} label={`${(comparison?.activityTrend ?? 0) > 0 ? '+' : ''}${comparison?.activityTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/mente" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#888] mb-2 group-hover:text-[#999] transition-colors">Meditación</p>
              <TrendIndicator value={comparison?.meditationTrend ?? 0} label={`${(comparison?.meditationTrend ?? 0) > 0 ? '+' : ''}${comparison?.meditationTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/disciplina" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-champagne/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#888] mb-2 group-hover:text-[#999] transition-colors">Hábitos</p>
              <TrendIndicator value={comparison?.habitTrend ?? 0} label={`${(comparison?.habitTrend ?? 0) > 0 ? '+' : ''}${comparison?.habitTrend ?? 0}`} />
            </Link>
          </div>
          </PrivacyMask>
        </div>
      </PremiumGate>

      {/* Insights Cards */}
      {insights.length > 0 ? (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <Sparkles size={20} className="text-champagne" />
            <h2 className="title-section">Lo que se ve</h2>
          </div>
          <div className="space-y-3">
            {insights.map((insight) => {
              const insightHref = getCategoryHref(insight.category);
              return (
                <Link
                  key={insight.id}
                  href={insightHref}
                  className={`insight-card block min-h-0 bg-[#0a0a0a] border rounded-xl p-4 sm:p-5 cursor-pointer group touch-press ${getInsightBorderClass(insight.type)}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="text-xl sm:text-2xl shrink-0 leading-none">{insight.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white group-hover:text-champagne transition-colors">{insight.title}</h3>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${getInsightBadgeClass(insight.type)}`}>
                          {insight.category}
                        </span>
                      </div>
                      <p className="text-sm text-[#999] leading-relaxed">{insight.description}</p>
                    </div>
                    <ArrowRight size={14} className="text-[#999] group-hover:text-champagne/50 transition-colors shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <PremiumEmptyState
          icon={Sparkles}
          title="Las observaciones llegarán con el tiempo"
          subtitle="Aparecen poco a poco."
          size="md"
          variant="gold"
        />
      )}

      {/* Detailed Metrics Grid */}
      <div className="card-enter">
        <div className="flex items-center gap-3 mb-5">
          <Target size={20} className="text-champagne" />
          <h2 className="title-section">Tu semana en detalle</h2>
          <PremiumInlineBadge
            isPremium={isPremium}
            freeLabel="Básico"
            premiumLabel="Más detalle"
          />
        </div>
        <PrivacyMask compact>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Check-ins */}
          <Link href="/checkin" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-champagne" />
              <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Check-ins</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.checkins.count}</p>
            <p className="text-[10px] text-[#888] mt-1">días esta semana</p>
            {summary.checkins.count > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#888]">Emoción</span>
                  <span className="text-champagne-soft">{summary.checkins.avgEmotion}/5</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#888]">Energía</span>
                  <span className="text-champagne-soft">{summary.checkins.avgEnergy}/5</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#888]">Estrés</span>
                  <span className="text-champagne-soft">{summary.checkins.avgStress}/5</span>
                </div>
              </div>
            )}
          </Link>

          {/* Habits */}
          <Link href="/imperio/disciplina" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-champagne" />
              <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Hábitos</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.habits.completed}</p>
            <p className="text-[10px] text-[#888] mt-1">completados</p>
            {summary.habits.topStreak > 0 && (
              <div className="mt-3">
                <p className="text-[10px] text-champagne-soft flex items-center gap-1">
                  <Flame size={10} /> Mejor racha: {summary.habits.topStreak} días
                </p>
                {summary.habits.topHabit && (
                  <p className="text-[10px] text-[#888] truncate">{summary.habits.topHabit}</p>
                )}
              </div>
            )}
          </Link>

          {/* Meditation */}
          <Link href="/imperio/mente" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2 mb-3">
              <Wind size={16} className="text-champagne" />
              <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Meditación</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.meditation.sessions}</p>
            <p className="text-[10px] text-[#888] mt-1">sesiones ({summary.meditation.totalMinutes} min)</p>
            {summary.meditation.avgDuration > 0 && (
              <p className="text-[10px] text-[#888] mt-2">Promedio: {summary.meditation.avgDuration} min/sesión</p>
            )}
          </Link>

          {/* Journal */}
          <Link href="/imperio/crecimiento" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group touch-press">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-champagne" />
              <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Diario</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.journal.entries}</p>
            <p className="text-[10px] text-[#888] mt-1">entradas esta semana</p>
          </Link>

          {/* Wellness — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact showCta={false} label="Detalle emocional">
            <Link href="/imperio/energia" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group touch-press">
              <div className="flex items-center gap-2 mb-3">
                <Brain size={16} className="text-champagne" />
                <span className="label-discrete">Cómo te sientes</span>
              </div>
              <p className="text-2xl font-bold text-white">{summary.wellness.logs}</p>
              <p className="text-[10px] text-[#888] mt-1">registros</p>
              {summary.wellness.logs > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#888]">Ánimo</span>
                    <span className="text-champagne-soft">{summary.wellness.avgMood}/5</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#888]">Sueño</span>
                    <span className="text-champagne-soft">{summary.wellness.avgSleep}/5</span>
                  </div>
                </div>
              )}
            </Link>
          </PremiumGate>

          {/* Nutrition — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact showCta={false} label="Detalle nutrición">
            <Link href="/imperio/energia" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-3">
                <Star size={16} className="text-champagne" />
                <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Nutrición</span>
              </div>
              <p className="text-2xl font-bold text-white">{summary.nutrition.logs}</p>
              <p className="text-[10px] text-[#888] mt-1">días registrados</p>
              {summary.nutrition.avgWater > 0 && (
                <p className="text-[10px] text-[#888] mt-2">Agua promedio: {summary.nutrition.avgWater} vasos/día</p>
              )}
            </Link>
          </PremiumGate>

          {/* Finance — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact showCta={false} label="Detalle finanzas">
            <Link href="/imperio/riqueza" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-3">
                <Gem size={16} className="text-champagne" />
                <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Finanzas</span>
              </div>
              <p className={`text-2xl font-bold ${summary.finance.balance >= 0 ? 'text-champagne-soft' : 'text-red-400'}`}>
                {summary.finance.balance >= 0 ? '+' : ''}{formatCurrency(Math.abs(summary.finance.balance))}
              </p>
              <p className="text-[10px] text-[#888] mt-1">balance semanal</p>
            </Link>
          </PremiumGate>

          {/* Empire streaks — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact label="Detalle imperios">
            <Link href="/insights" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group touch-press">
              <div className="flex items-center gap-2 mb-3">
                <Flame size={16} className="text-champagne" />
                <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Imperios</span>
              </div>
              <p className="text-2xl font-bold text-white">{summary.streaks.bestEmpireStreak}</p>
              <p className="text-[10px] text-[#888] mt-1">mejor racha</p>
              {summary.streaks.bestEmpireName && (
                <p className="text-[10px] text-champagne-soft mt-2">{summary.streaks.bestEmpireName}</p>
              )}
            </Link>
          </PremiumGate>

          {/* Total activity */}
          <Link href="/dashboard" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-champagne/20 transition-colors cursor-pointer group touch-press">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-champagne" />
              <span className="text-xs text-[#888] uppercase tracking-wider font-medium">Actividad</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.totalActivities}</p>
            <p className="text-[10px] text-[#888] mt-1">acciones totales esta semana</p>
          </Link>
        </div>
        </PrivacyMask>
      </div>

      {/* Subtle Premium CTA for FREE users — hidden in screenshot mode */}
      {!isPremium && !screenshotMode && (
        <div className="flex items-center justify-center gap-2 py-6 mt-2">
          <Circle size={3} fill="currentColor" className="text-champagne/30" />
          <p className="text-[11px] text-[#888]">
            Más detalle con el tiempo —{' '}
            <Link href="/elite" className="text-champagne/50 hover:text-champagne/80 transition-colors">
              conocer Élite
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
