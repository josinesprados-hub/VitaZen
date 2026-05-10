'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import Link from 'next/link';
import { InsightsSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import PremiumGate, { PremiumInlineBadge } from '@/components/ui/PremiumGate';
import ContextualHelp from '@/components/ui/ContextualHelp';
import {
  Sparkles,
  ArrowLeft,
  ArrowRight,
  Crown,
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
  if (score >= 50) return '#c8a55a';
  if (score >= 30) return '#e8a849';
  return '#ef4444';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excelente';
  if (score >= 60) return 'Bueno';
  if (score >= 40) return 'Mejorable';
  return 'En desarrollo';
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
    case 'warning': return 'border-[#e8a849]/20 hover:border-[#e8a849]/40';
    case 'trend': return 'border-[#c8a55a]/20 hover:border-[#c8a55a]/40';
    default: return 'border-[#1a1a1a] hover:border-[#2a2a2a]';
  }
}

function getInsightBadgeClass(type: string): string {
  switch (type) {
    case 'positive': return 'bg-[#22c55e]/10 text-[#22c55e]';
    case 'warning': return 'bg-[#e8a849]/10 text-[#e8a849]';
    case 'trend': return 'bg-[#c8a55a]/10 text-[#c8a55a]';
    default: return 'bg-[#1a1a1a] text-[#666]';
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
      <span className="flex items-center gap-1 text-[11px] text-[#e8a849]">
        <TrendingDown size={12} /> {label} ↓
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-[#666]">
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
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const isPremium = user?.plan === 'PREMIUM';

  const fetchInsights = useCallback(async () => {
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
  }, [apiFetch]);

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
          title="No se pudieron cargar los insights"
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
      {/* Contextual Help */}
      <ContextualHelp
        storageKey="vitazen_help_insights"
        title="Insights Semanales"
        text="Cada semana se analizan tus datos y se generan insights automáticos. Revisa tu puntuación de bienestar y los patrones detectados."
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2.5 rounded-xl text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Insights Semanales</h1>
              {isPremium && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#c8a55a] bg-[#c8a55a]/10 border border-[#c8a55a]/20 px-2 py-0.5 rounded-full">
                  <Crown size={10} />
                  Premium
                </span>
              )}
            </div>
            <p className="text-[#999] text-sm">{summary.weekLabel}</p>
          </div>
        </div>
      </div>

      {/* Wellness Score Card — clickable to checkin */}
      <Link href="/checkin" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 sm:p-6 hover:border-[#c8a55a]/20 transition-all duration-200 cursor-pointer group touch-press">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity size={22} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white group-hover:text-[#c8a55a] transition-colors">Puntuación de bienestar</h2>
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
            <ArrowRight size={14} className="text-[#333] group-hover:text-[#c8a55a]/50 transition-colors shrink-0" />
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
              className="flex items-center gap-2 bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2 hover:border-[#c8a55a]/15 transition-colors cursor-pointer"
            >
              <item.icon size={14} className="text-[#c8a55a]" />
              <span className="text-xs text-[#999]">{item.label}:</span>
              <span className="text-xs text-white font-medium">{item.value}</span>
            </Link>
          ))}
        </div>
      </Link>

      {/* Weekly Comparison — PREMIUM gated with blur, each trend card navigates */}
      <PremiumGate isPremium={isPremium} intensity="medium" label="Comparativa semanal">
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-xl p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-5">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Comparativa semanal</h2>
            <span className="text-[10px] text-[#c8a55a]/60">vs. semana anterior</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Link href="/checkin" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#c8a55a]/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#666] mb-2 group-hover:text-[#999] transition-colors">Emociones</p>
              <TrendIndicator value={comparison?.emotionTrend ?? 0} label={`${(comparison?.emotionTrend ?? 0) > 0 ? '+' : ''}${comparison?.emotionTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/energia" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#c8a55a]/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#666] mb-2 group-hover:text-[#999] transition-colors">Energía</p>
              <TrendIndicator value={comparison?.energyTrend ?? 0} label={`${(comparison?.energyTrend ?? 0) > 0 ? '+' : ''}${comparison?.energyTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/mente" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#c8a55a]/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#666] mb-2 group-hover:text-[#999] transition-colors">Estrés</p>
              <TrendIndicator value={comparison?.stressTrend ?? 0} label={(comparison?.stressTrend ?? 0) > 0 ? '↓ bajó' : '↑ subió'} />
            </Link>
            <Link href="/insights" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#c8a55a]/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#666] mb-2 group-hover:text-[#999] transition-colors">Actividad total</p>
              <TrendIndicator value={comparison?.activityTrend ?? 0} label={`${(comparison?.activityTrend ?? 0) > 0 ? '+' : ''}${comparison?.activityTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/mente" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#c8a55a]/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#666] mb-2 group-hover:text-[#999] transition-colors">Meditación</p>
              <TrendIndicator value={comparison?.meditationTrend ?? 0} label={`${(comparison?.meditationTrend ?? 0) > 0 ? '+' : ''}${comparison?.meditationTrend ?? 0}`} />
            </Link>
            <Link href="/imperio/disciplina" className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 hover:border-[#c8a55a]/15 transition-colors cursor-pointer group touch-press">
              <p className="text-xs text-[#666] mb-2 group-hover:text-[#999] transition-colors">Hábitos</p>
              <TrendIndicator value={comparison?.habitTrend ?? 0} label={`${(comparison?.habitTrend ?? 0) > 0 ? '+' : ''}${comparison?.habitTrend ?? 0}`} />
            </Link>
          </div>
        </div>
      </PremiumGate>

      {/* Insights Cards */}
      {insights.length > 0 ? (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <Sparkles size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Insights automáticos</h2>
            <span className="text-xs text-[#666]">{insights.length} detectados</span>
          </div>
          <div className="space-y-3">
            {insights.map((insight) => {
              const insightHref = getCategoryHref(insight.category);
              return (
                <Link
                  key={insight.id}
                  href={insightHref}
                  className={`insight-card bg-[#0a0a0a] border rounded-xl p-4 sm:p-5 cursor-pointer group touch-press ${getInsightBorderClass(insight.type)}`}
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <span className="text-xl sm:text-2xl shrink-0 leading-none">{insight.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-white group-hover:text-[#c8a55a] transition-colors">{insight.title}</h3>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${getInsightBadgeClass(insight.type)}`}>
                          {insight.category}
                        </span>
                      </div>
                      <p className="text-sm text-[#999] leading-relaxed">{insight.description}</p>
                    </div>
                    <ArrowRight size={14} className="text-[#333] group-hover:text-[#c8a55a]/50 transition-colors shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <PremiumEmptyState
          icon={Sparkles}
          title="Los insights llegarán con tu actividad"
          subtitle="Registra hábitos, meditaciones o check-ins y los patrones aparecerán solos."
          size="md"
          variant="gold"
        />
      )}

      {/* Detailed Metrics Grid */}
      <div className="card-enter">
        <div className="flex items-center gap-3 mb-5">
          <Target size={20} className="text-[#c8a55a]" />
          <h2 className="text-lg font-semibold text-white">Desglose semanal</h2>
          <PremiumInlineBadge
            isPremium={isPremium}
            freeLabel="Básico"
            premiumLabel="Tendencias profundas"
          />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Check-ins */}
          <Link href="/checkin" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Check-ins</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.checkins.count}</p>
            <p className="text-[10px] text-[#555] mt-1">días esta semana</p>
            {summary.checkins.count > 0 && (
              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#666]">Emoción</span>
                  <span className="text-[#c8a55a]">{summary.checkins.avgEmotion}/5</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#666]">Energía</span>
                  <span className="text-[#c8a55a]">{summary.checkins.avgEnergy}/5</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-[#666]">Estrés</span>
                  <span className="text-[#c8a55a]">{summary.checkins.avgStress}/5</span>
                </div>
              </div>
            )}
          </Link>

          {/* Habits */}
          <Link href="/imperio/disciplina" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Hábitos</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.habits.completed}</p>
            <p className="text-[10px] text-[#555] mt-1">completados</p>
            {summary.habits.topStreak > 0 && (
              <div className="mt-3">
                <p className="text-[10px] text-[#c8a55a] flex items-center gap-1">
                  <Flame size={10} /> Mejor racha: {summary.habits.topStreak} días
                </p>
                {summary.habits.topHabit && (
                  <p className="text-[10px] text-[#555] truncate">{summary.habits.topHabit}</p>
                )}
              </div>
            )}
          </Link>

          {/* Meditation */}
          <Link href="/imperio/mente" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group">
            <div className="flex items-center gap-2 mb-3">
              <Wind size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Meditación</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.meditation.sessions}</p>
            <p className="text-[10px] text-[#555] mt-1">sesiones ({summary.meditation.totalMinutes} min)</p>
            {summary.meditation.avgDuration > 0 && (
              <p className="text-[10px] text-[#666] mt-2">Promedio: {summary.meditation.avgDuration} min/sesión</p>
            )}
          </Link>

          {/* Journal */}
          <Link href="/imperio/crecimiento" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group touch-press">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Diario</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.journal.entries}</p>
            <p className="text-[10px] text-[#555] mt-1">entradas esta semana</p>
          </Link>

          {/* Wellness — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact label="Detalle bienestar">
            <Link href="/imperio/energia" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group touch-press">
              <div className="flex items-center gap-2 mb-3">
                <Brain size={16} className="text-[#c8a55a]" />
                <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Bienestar</span>
              </div>
              <p className="text-2xl font-bold text-white">{summary.wellness.logs}</p>
              <p className="text-[10px] text-[#555] mt-1">registros</p>
              {summary.wellness.logs > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#666]">Ánimo</span>
                    <span className="text-[#c8a55a]">{summary.wellness.avgMood}/5</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-[#666]">Sueño</span>
                    <span className="text-[#c8a55a]">{summary.wellness.avgSleep}/5</span>
                  </div>
                </div>
              )}
            </Link>
          </PremiumGate>

          {/* Nutrition — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact label="Detalle nutrición">
            <Link href="/imperio/energia" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-3">
                <Star size={16} className="text-[#c8a55a]" />
                <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Nutrición</span>
              </div>
              <p className="text-2xl font-bold text-white">{summary.nutrition.logs}</p>
              <p className="text-[10px] text-[#555] mt-1">días registrados</p>
              {summary.nutrition.avgWater > 0 && (
                <p className="text-[10px] text-[#666] mt-2">Agua promedio: {summary.nutrition.avgWater} vasos/día</p>
              )}
            </Link>
          </PremiumGate>

          {/* Finance — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact label="Detalle finanzas">
            <Link href="/imperio/riqueza" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-3">
                <Gem size={16} className="text-[#c8a55a]" />
                <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Finanzas</span>
              </div>
              <p className={`text-2xl font-bold ${summary.finance.balance >= 0 ? 'text-[#c8a55a]' : 'text-red-400'}`}>
                {summary.finance.balance >= 0 ? '+' : ''}{summary.finance.balance.toFixed(0)}€
              </p>
              <p className="text-[10px] text-[#555] mt-1">balance semanal</p>
            </Link>
          </PremiumGate>

          {/* Empire streaks — PREMIUM details */}
          <PremiumGate isPremium={isPremium} intensity="light" compact label="Detalle imperios">
            <Link href="/insights" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group touch-press">
              <div className="flex items-center gap-2 mb-3">
                <Flame size={16} className="text-[#c8a55a]" />
                <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Imperios</span>
              </div>
              <p className="text-2xl font-bold text-white">{summary.streaks.bestEmpireStreak}</p>
              <p className="text-[10px] text-[#555] mt-1">mejor racha</p>
              {summary.streaks.bestEmpireName && (
                <p className="text-[10px] text-[#c8a55a] mt-2">{summary.streaks.bestEmpireName}</p>
              )}
            </Link>
          </PremiumGate>

          {/* Total activity */}
          <Link href="/dashboard" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group touch-press">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Actividad</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.totalActivities}</p>
            <p className="text-[10px] text-[#555] mt-1">acciones totales esta semana</p>
          </Link>
        </div>
      </div>

      {/* Subtle Premium CTA for FREE users */}
      {!isPremium && (
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/10 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center sm:text-left">
          <div className="w-10 h-10 rounded-xl bg-[#c8a55a]/8 flex items-center justify-center shrink-0">
            <Crown size={18} className="text-[#c8a55a]/60" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white mb-0.5">Comparativas y métricas avanzadas</p>
            <p className="text-[#666] text-xs">Desbloquea tendencias semanales, detalles de bienestar y análisis financiero.</p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 bg-[#c8a55a]/10 border border-[#c8a55a]/20 text-[#c8a55a] font-medium px-4 py-2 rounded-xl hover:bg-[#c8a55a]/15 hover:border-[#c8a55a]/30 transition-colors text-xs shrink-0"
          >
            <Crown size={12} />
            Premium
          </Link>
        </div>
      )}
    </div>
  );
}
