'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import Link from 'next/link';
import { InsightsSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumEmptyState from '@/components/ui/PremiumEmptyState';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import {
  Sparkles,
  ArrowLeft,
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

  useEffect(() => {
    const fetchInsights = async () => {
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
    };
    fetchInsights();
  }, []);

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
    <div className="max-w-5xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 rounded-lg text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Insights Semanales</h1>
              {isPremium && (
                <span className="premium-badge inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-[#c8a55a] bg-[#c8a55a]/10 border border-[#c8a55a]/20 px-2 py-0.5 rounded-full">
                  <Crown size={10} />
                  Premium
                </span>
              )}
            </div>
            <p className="text-[#999] text-sm">{summary.weekLabel}</p>
          </div>
        </div>
      </div>

      {/* Wellness Score Card */}
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-7">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Activity size={22} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Puntuación de bienestar</h2>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold" style={{ color: getScoreColor(summary.score) }}>
              {summary.score}
            </p>
            <p className="text-xs" style={{ color: getScoreColor(summary.score) }}>
              {getScoreLabel(summary.score)}
            </p>
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

        {/* Activity summary pills */}
        <div className="flex flex-wrap gap-3">
          {[
            { icon: Wind, label: 'Meditación', value: `${summary.meditation.sessions} sesiones` },
            { icon: CheckCircle, label: 'Hábitos', value: `${summary.habits.completed} completados` },
            { icon: BookOpen, label: 'Diario', value: `${summary.journal.entries} entradas` },
            { icon: Zap, label: 'Check-ins', value: `${summary.checkins.count} días` },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 bg-[#111] border border-[#1a1a1a] rounded-lg px-3 py-2">
              <item.icon size={14} className="text-[#c8a55a]" />
              <span className="text-xs text-[#999]">{item.label}:</span>
              <span className="text-xs text-white font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Comparison (PREMIUM only) */}
      {isPremium && comparison && (
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-xl p-7">
          <div className="flex items-center gap-3 mb-5">
            <Lightbulb size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Comparativa semanal</h2>
            <span className="text-[10px] text-[#c8a55a]/60">vs. semana anterior</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <p className="text-xs text-[#666] mb-2">Emociones</p>
              <TrendIndicator value={comparison.emotionTrend} label={`${comparison.emotionTrend > 0 ? '+' : ''}${comparison.emotionTrend}`} />
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <p className="text-xs text-[#666] mb-2">Energía</p>
              <TrendIndicator value={comparison.energyTrend} label={`${comparison.energyTrend > 0 ? '+' : ''}${comparison.energyTrend}`} />
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <p className="text-xs text-[#666] mb-2">Estrés</p>
              <TrendIndicator value={comparison.stressTrend} label={comparison.stressTrend > 0 ? '↓ bajó' : '↑ subió'} />
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <p className="text-xs text-[#666] mb-2">Actividad total</p>
              <TrendIndicator value={comparison.activityTrend} label={`${comparison.activityTrend > 0 ? '+' : ''}${comparison.activityTrend}`} />
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <p className="text-xs text-[#666] mb-2">Meditación</p>
              <TrendIndicator value={comparison.meditationTrend} label={`${comparison.meditationTrend > 0 ? '+' : ''}${comparison.meditationTrend}`} />
            </div>
            <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <p className="text-xs text-[#666] mb-2">Hábitos</p>
              <TrendIndicator value={comparison.habitTrend} label={`${comparison.habitTrend > 0 ? '+' : ''}${comparison.habitTrend}`} />
            </div>
          </div>
        </div>
      )}

      {/* Insights Cards */}
      {insights.length > 0 ? (
        <div>
          <div className="flex items-center gap-3 mb-5">
            <Sparkles size={20} className="text-[#c8a55a]" />
            <h2 className="text-lg font-semibold text-white">Insights automáticos</h2>
            <span className="text-xs text-[#666]">{insights.length} detectados</span>
          </div>
          <div className="space-y-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`insight-card bg-[#0a0a0a] border rounded-xl p-5 transition-all duration-200 ${getInsightBorderClass(insight.type)}`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0 mt-0.5">{insight.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-semibold text-white">{insight.title}</h3>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${getInsightBadgeClass(insight.type)}`}>
                        {insight.category}
                      </span>
                    </div>
                    <p className="text-sm text-[#999] leading-relaxed">{insight.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <PremiumEmptyState
          icon={Sparkles}
          title="Sin insights esta semana"
          subtitle="Registra más actividad para recibir insights personalizados"
          size="md"
          variant="gold"
        />
      )}

      {/* Detailed Metrics Grid */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Target size={20} className="text-[#c8a55a]" />
          <h2 className="text-lg font-semibold text-white">Desglose semanal</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Check-ins */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
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
          </div>

          {/* Habits */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
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
          </div>

          {/* Meditation */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Wind size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Meditación</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.meditation.sessions}</p>
            <p className="text-[10px] text-[#555] mt-1">sesiones ({summary.meditation.totalMinutes} min)</p>
            {summary.meditation.avgDuration > 0 && (
              <p className="text-[10px] text-[#666] mt-2">Promedio: {summary.meditation.avgDuration} min/sesión</p>
            )}
          </div>

          {/* Journal */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Diario</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.journal.entries}</p>
            <p className="text-[10px] text-[#555] mt-1">entradas esta semana</p>
          </div>

          {/* Wellness */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
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
          </div>

          {/* Nutrition */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Star size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Nutrición</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.nutrition.logs}</p>
            <p className="text-[10px] text-[#555] mt-1">días registrados</p>
            {summary.nutrition.avgWater > 0 && (
              <p className="text-[10px] text-[#666] mt-2">Agua promedio: {summary.nutrition.avgWater} vasos/día</p>
            )}
          </div>

          {/* Finance */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Gem size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Finanzas</span>
            </div>
            <p className={`text-2xl font-bold ${summary.finance.balance >= 0 ? 'text-[#c8a55a]' : 'text-red-400'}`}>
              {summary.finance.balance >= 0 ? '+' : ''}{summary.finance.balance.toFixed(0)}€
            </p>
            <p className="text-[10px] text-[#555] mt-1">balance semanal</p>
          </div>

          {/* Empire streaks */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Flame size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Imperios</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.streaks.bestEmpireStreak}</p>
            <p className="text-[10px] text-[#555] mt-1">mejor racha</p>
            {summary.streaks.bestEmpireName && (
              <p className="text-[10px] text-[#c8a55a] mt-2">{summary.streaks.bestEmpireName}</p>
            )}
          </div>

          {/* Total activity */}
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-5 hover:border-[#c8a55a]/20 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#666] uppercase tracking-wider font-medium">Actividad</span>
            </div>
            <p className="text-2xl font-bold text-white">{summary.totalActivities}</p>
            <p className="text-[10px] text-[#555] mt-1">acciones totales esta semana</p>
          </div>
        </div>
      </div>

      {/* Premium CTA for FREE users */}
      {!isPremium && (
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-xl p-7 text-center">
          <Crown size={28} className="text-[#c8a55a] mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white mb-2">Desbloquea insights completos</h3>
          <p className="text-[#999] text-sm mb-4 max-w-md mx-auto">
            Con Premium recibirás comparativas semanales, recomendaciones contextuales y acceso a todos tus insights.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 bg-[#c8a55a] text-black font-semibold px-6 py-3 rounded-lg hover:bg-[#d4b468] transition-colors text-sm"
          >
            <Crown size={16} />
            Mejorar a Premium
          </Link>
        </div>
      )}
    </div>
  );
}
