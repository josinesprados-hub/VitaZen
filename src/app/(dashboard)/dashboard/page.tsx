'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { CheckInModal } from '@/components/checkin/CheckInModal';
import { EmotionalHero } from '@/components/dashboard/EmotionalHero';
import { OnboardingRecommendations } from '@/components/dashboard/OnboardingRecommendations';
import { WeeklyRecap } from '@/components/dashboard/WeeklyRecap';
import { DashboardSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { Shield, Brain, Zap, Gem, TrendingUp, Trophy, Flame, Star, Wind, BookOpen, CheckCircle, Wallet, Target, Crown, Lock, Sunrise, Sparkles, ArrowRight } from 'lucide-react';
import PremiumReflection from '@/components/ui/PremiumReflection';

interface EmpireData {
  empire: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  progress: number;
}

interface ChallengeData {
  id: string;
  completed: boolean;
  challenge: {
    id: string;
    title: string;
    description: string;
    category: string;
    difficulty: string;
  };
}

const EMPIRE_CONFIG: Record<string, { name: string; icon: any; color: string; description: string }> = {
  disciplina: { name: 'Disciplina', icon: Shield, color: '#c8a55a', description: 'Construye hábitos y domina tu consistencia' },
  mente: { name: 'Mente', icon: Brain, color: '#c8a55a', description: 'Cultiva la calma y la claridad mental' },
  energia: { name: 'Energía', icon: Zap, color: '#c8a55a', description: 'Optimiza tu cuerpo y vitalidad física' },
  riqueza: { name: 'Finanzas', icon: Gem, color: '#c8a55a', description: 'Domina tus finanzas y alcanza la libertad' },
  crecimiento: { name: 'Crecimiento', icon: TrendingUp, color: '#c8a55a', description: 'Expande tu potencial y evoluciona' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [empires, setEmpires] = useState<EmpireData[]>([]);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<{ meditationWeek: number; habitsCompleted: number; journalWeek: number; balance: number; totalIncome: number; totalExpense: number } | null>(null);
  const [streaks, setStreaks] = useState<{ meditationStreak: number; habitStreak: number; journalStreak: number } | null>(null);
  const [progress, setProgress] = useState<{ meditation: { count: number; target: number; percent: number }; habits: { count: number; target: number; percent: number }; journal: { count: number; target: number; percent: number }; totalPercent: number } | null>(null);
  const [achievements, setAchievements] = useState<{ key: string; title: string; description: string; category: string; icon: string; target: number; current: number; percent: number; unlocked: boolean; unlockedAt: string | null }[] | null>(null);
  const [achievementsStats, setAchievementsStats] = useState<{ total: number; unlocked: number; percent: number } | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<any | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [dashboardInsights, setDashboardInsights] = useState<{ id: string; type: string; category: string; icon: string; title: string; description: string }[] | null>(null);
  const [insightsScore, setInsightsScore] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [completingChallenge, setCompletingChallenge] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const [empRes, chRes, metRes, streakRes, progRes, achRes, checkRes, insRes] = await Promise.all([
          apiFetch('/api/empire'),
          apiFetch('/api/challenges'),
          apiFetch('/api/dashboard/metrics'),
          apiFetch('/api/dashboard/streaks'),
          apiFetch('/api/dashboard/progress'),
          apiFetch('/api/achievements'),
          apiFetch('/api/checkin?mode=today'),
          apiFetch('/api/insights'),
        ]);

        if (cancelled) return;

        let failedCount = 0;

        if (empRes.ok) {
          const empData = await empRes.json();
          setEmpires(empData.empires);
        } else {
          failedCount++;
        }

        if (chRes.ok) {
          const chData = await chRes.json();
          setChallenge(chData.challenge);
        } else {
          failedCount++;
        }

        if (metRes.ok) {
          const metData = await metRes.json();
          setMetrics(metData);
        } else {
          failedCount++;
        }

        if (streakRes.ok) {
          const streakData = await streakRes.json();
          setStreaks(streakData);
        } else {
          failedCount++;
        }

        if (progRes.ok) {
          const progData = await progRes.json();
          setProgress(progData);
        } else {
          failedCount++;
        }

        if (achRes.ok) {
          const achData = await achRes.json();
          setAchievements(achData.achievements);
          setAchievementsStats(achData.stats);
        } else {
          failedCount++;
        }

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          setTodayCheckin(checkData.today);
          if (!checkData.today) {
            setShowCheckinModal(true);
          }
        } else {
          failedCount++;
        }

        if (insRes.ok) {
          const insData = await insRes.json();
          setDashboardInsights(insData.insights);
          setInsightsScore(insData.summary?.score ?? null);
        } else {
          failedCount++;
        }

        // Only show error if ALL calls failed (partial data is still useful)
        if (failedCount === 8) {
          setFetchError(true);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error fetching dashboard data:', error);
        setFetchError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [user, apiFetch]);

  // Memoized computed values to avoid recalculating on every render
  const totalXp = useMemo(() => empires.reduce((sum, e) => sum + e.xp, 0), [empires]);
  const totalLevels = useMemo(() => empires.reduce((sum, e) => sum + e.level, 0), [empires]);
  const bestStreak = useMemo(() => Math.max(...empires.map((e) => e.streak), 0), [empires]);

  const sortedAchievements = useMemo(() => {
    if (!achievements) return null;
    return [...achievements].sort((a, b) => {
      if (a.unlocked && !b.unlocked) return -1;
      if (!a.unlocked && b.unlocked) return 1;
      return b.percent - a.percent;
    }).slice(0, 5);
  }, [achievements]);

  const visibleInsights = useMemo(() => dashboardInsights?.slice(0, 3) ?? [], [dashboardInsights]);

  const handleCheckinSave = useCallback(async (data: any) => {
    const res = await apiFetch('/api/checkin', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const result = await res.json();
      setTodayCheckin(result.checkin);
    }
  }, [apiFetch]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (fetchError) {
    return (
      <div className="max-w-7xl mx-auto min-h-[60dvh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="No se pudo cargar el dashboard"
          subtitle="Tu progreso está seguro. Intenta recargar para volver a verlo."
          onRetry={() => window.location.reload()}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-3 sm:space-y-12 overflow-x-contain">
      {/* Check-in Modal */}
      {showCheckinModal && (
        <CheckInModal
          onClose={() => setShowCheckinModal(false)}
          initialData={todayCheckin}
          onSave={handleCheckinSave}
        />
      )}

      {/* ═══ REORDERED: Welcome + Check-in FIRST ═══ */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              Bienvenido, <span className="text-[#c8a55a]">{user?.name || 'Guerrero'}</span>
            </h1>
            <p className="text-[#999] mt-1 sm:mt-2 text-sm sm:text-base">Construye tu imperio, un hábito a la vez.</p>
          </div>
          {todayCheckin && (
            <button
              onClick={() => setShowCheckinModal(true)}
              className="flex items-center gap-2 bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-xl px-4 py-2.5 hover:border-[#c8a55a]/40 transition-all group"
            >
              <Sunrise size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#999] group-hover:text-white transition-colors">Check-in de hoy</span>
            </button>
          )}
        </div>
        {todayCheckin && (
          <div className="mt-2 sm:mt-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-3 sm:gap-4">
            <span className="text-lg">{todayCheckin.emotion >= 4 ? '😊' : todayCheckin.emotion >= 3 ? '😐' : '😔'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#c8a55a] font-medium truncate">«{todayCheckin.intention}»</p>
              <p className="text-[10px] text-[#555]">
                Energía {todayCheckin.energy}/5 · Enfoque {todayCheckin.focus}/5 · Estrés {todayCheckin.stress}/5
              </p>
            </div>
            <Link href="/checkin" className="text-[10px] text-[#555] hover:text-[#c8a55a] transition-colors whitespace-nowrap">
              Historial
            </Link>
          </div>
        )}
      </div>

      {/* Hero: Estado Actual */}
      <EmotionalHero />

      {/* Onboarding Recommendations */}
      <OnboardingRecommendations />

      {/* Metrics — with calm fallback when data is null */}
      {metrics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <Wind size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[10px] sm:text-xs text-[#666] uppercase tracking-wider font-medium">Meditación</span>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{metrics.meditationWeek}</p>
            <p className="text-[10px] sm:text-xs text-[#666] mt-0.5 sm:mt-1">esta semana</p>
            {streaks && streaks.meditationStreak > 0 && (
              <p className="text-[10px] sm:text-xs text-[#c8a55a] mt-1 sm:mt-2 flex items-center gap-1">
                🔥 {streaks.meditationStreak}d
              </p>
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <CheckCircle size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[10px] sm:text-xs text-[#666] uppercase tracking-wider font-medium">Hábitos</span>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{metrics.habitsCompleted}</p>
            <p className="text-[10px] sm:text-xs text-[#666] mt-0.5 sm:mt-1">esta semana</p>
            {streaks && streaks.habitStreak > 0 && (
              <p className="text-[10px] sm:text-xs text-[#c8a55a] mt-1 sm:mt-2 flex items-center gap-1">
                🔥 {streaks.habitStreak}d
              </p>
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <BookOpen size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[10px] sm:text-xs text-[#666] uppercase tracking-wider font-medium">Diario</span>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{metrics.journalWeek}</p>
            <p className="text-[10px] sm:text-xs text-[#666] mt-0.5 sm:mt-1">esta semana</p>
            {streaks && streaks.journalStreak > 0 && (
              <p className="text-[10px] sm:text-xs text-[#c8a55a] mt-1 sm:mt-2 flex items-center gap-1">
                🔥 {streaks.journalStreak}d
              </p>
            )}
          </div>

          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <Wallet size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[10px] sm:text-xs text-[#666] uppercase tracking-wider font-medium">Finanzas</span>
            </div>
            <p className={`text-xl sm:text-3xl font-bold ${metrics.balance >= 0 ? 'text-[#c8a55a]' : 'text-red-400'}`}>
              {metrics.balance >= 0 ? '+' : ''}{metrics.balance.toFixed(2)}€
            </p>
            <p className="text-[10px] sm:text-xs text-[#666] mt-0.5 sm:mt-1">balance 30 días</p>
          </div>
        </div>
      ) : (
        /* Calm fallback placeholder card */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {[['Meditación', Wind], ['Hábitos', CheckCircle], ['Diario', BookOpen], ['Finanzas', Wallet]].map(([label, Icon]) => (
            <div key={label as string} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5">
              <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
                  <Icon size={14} className="text-[#c8a55a]/30 sm:w-[18px] sm:h-[18px]" />
                </div>
                <span className="text-[10px] sm:text-xs text-[#444] uppercase tracking-wider font-medium">{label}</span>
              </div>
              <p className="text-xl sm:text-3xl font-bold text-[#333]">—</p>
              <p className="text-[10px] sm:text-xs text-[#333] mt-0.5 sm:mt-1">esta semana</p>
            </div>
          ))}
        </div>
      )}

      {/* Weekly Recap — after metrics, collapsed on mobile */}
      <WeeklyRecap />

      {/* Empire Grid */}
      <div>
        <h2 className="text-base sm:text-xl font-semibold text-white mb-3 sm:mb-5">Tus Imperios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5">
          {Object.entries(EMPIRE_CONFIG).map(([key, config]) => {
            const empireData = empires.find((e) => e.empire === key);
            const level = empireData?.level || 1;
            const empireProgress = empireData?.progress || 0;
            const streak = empireData?.streak || 0;
            const Icon = config.icon;

            return (
              <Link
                key={key}
                href={`/imperio/${key}`}
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5 hover:border-[#c8a55a]/30 transition-all group touch-press"
              >
                <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-5">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                    <Icon size={16} className="text-[#c8a55a] sm:w-[20px] sm:h-[20px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm sm:text-base font-semibold text-white group-hover:text-[#c8a55a] transition-colors">{config.name}</h3>
                    <p className="text-[10px] sm:text-xs text-[#999]">Nivel {level}</p>
                  </div>
                  {streak > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] sm:text-xs text-[#c8a55a] sm:hidden">
                      <Flame size={10} /> {streak}d
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 sm:h-2 mb-1.5 sm:mb-2.5">
                  <div
                    className="bg-[#c8a55a] h-1.5 sm:h-2 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${empireProgress}%` }}
                  />
                </div>

                <div className="hidden sm:flex items-center justify-between text-xs text-[#666]">
                  <span>{Math.round(empireProgress)}% para el siguiente nivel</span>
                  {streak > 0 && (
                    <span className="flex items-center gap-1 text-[#c8a55a]">
                      <Flame size={12} /> {streak} días
                    </span>
                  )}
                </div>
                <p className="sm:hidden text-[10px] text-[#666]">{Math.round(empireProgress)}% sig. nivel</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Daily Challenge — with calm fallback */}
      {challenge ? (
        <div className="bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-xl p-3 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
            <Trophy size={18} className="text-[#c8a55a] sm:w-[22px] sm:h-[22px]" />
            <h2 className="text-base sm:text-lg font-semibold text-white">Desafío Diario</h2>
            {challenge.completed && (
              <span className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-[#c8a55a]/15 text-[#c8a55a] font-medium">Completado</span>
            )}
          </div>
          <h3 className="text-[#c8a55a] font-medium text-sm sm:text-lg mb-0.5 sm:mb-1">{challenge.challenge.title}</h3>
          <p className="text-[#999] text-xs sm:text-sm mb-3 sm:mb-4 line-clamp-2">{challenge.challenge.description}</p>
          {!challenge.completed && (
            <button
              onClick={async () => {
                if (completingChallenge) return;
                setCompletingChallenge(true);
                try {
                  const res = await apiFetch('/api/challenges/complete', {
                    method: 'POST',
                    body: JSON.stringify({ challengeId: challenge.challenge.id }),
                  });
                  if (res.ok) {
                    setChallenge({ ...challenge, completed: true });
                  }
                } finally {
                  setCompletingChallenge(false);
                }
              }}
              disabled={completingChallenge}
              className="bg-[#c8a55a] text-black font-semibold px-6 py-2.5 rounded-xl hover:bg-[#d4b468] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {completingChallenge ? 'Completando...' : 'Marcar como completado'}
            </button>
          )}
        </div>
      ) : (
        /* Calm fallback */
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
              <Trophy size={16} className="text-[#c8a55a]/30 sm:w-[20px] sm:h-[20px]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-medium text-[#666]">Desafío Diario</h2>
              <p className="text-[10px] sm:text-[11px] text-[#444]">No disponible</p>
            </div>
          </div>
        </div>
      )}

      {/* Progreso Semanal — with calm fallback, compact on mobile */}
      {progress ? (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2 sm:p-5 hover:border-[#c8a55a]/20 transition-colors">
          <div className="flex items-center justify-between mb-2 sm:mb-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <Target size={16} className="text-[#c8a55a] sm:w-[22px] sm:h-[22px]" />
              <h2 className="text-sm sm:text-lg font-semibold text-white">Progreso Semanal</h2>
            </div>
            <span className="text-lg sm:text-2xl font-bold text-[#c8a55a]">{progress.totalPercent}%</span>
          </div>

          <div className="space-y-2 sm:space-y-4">
            {/* Meditación */}
            <div>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[11px] sm:text-sm text-[#999]">Meditación</span>
                <span className="text-[10px] sm:text-xs text-[#666] hidden sm:inline">{progress.meditation.count}/{progress.meditation.target}</span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 sm:h-2.5 overflow-hidden">
                <div
                  className="bg-[#c8a55a] h-1.5 sm:h-2.5 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress.meditation.percent}%` }}
                />
              </div>
            </div>

            {/* Hábitos */}
            <div>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[11px] sm:text-sm text-[#999]">Hábitos</span>
                <span className="text-[10px] sm:text-xs text-[#666] hidden sm:inline">{progress.habits.count}/{progress.habits.target}</span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 sm:h-2.5 overflow-hidden">
                <div
                  className="bg-[#c8a55a] h-1.5 sm:h-2.5 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress.habits.percent}%` }}
                />
              </div>
            </div>

            {/* Diario */}
            <div>
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[11px] sm:text-sm text-[#999]">Diario</span>
                <span className="text-[10px] sm:text-xs text-[#666] hidden sm:inline">{progress.journal.count}/{progress.journal.target}</span>
              </div>
              <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 sm:h-2.5 overflow-hidden">
                <div
                  className="bg-[#c8a55a] h-1.5 sm:h-2.5 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${progress.journal.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Calm fallback */
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
              <Target size={16} className="text-[#c8a55a]/30 sm:w-[20px] sm:h-[20px]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-medium text-[#666]">Progreso Semanal</h2>
              <p className="text-[10px] sm:text-[11px] text-[#444]">No disponible</p>
            </div>
          </div>
        </div>
      )}

      {/* Insights Preview — show only 1 on mobile, with calm fallback */}
      {dashboardInsights && dashboardInsights.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3 sm:mb-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <Sparkles size={18} className="text-[#c8a55a] sm:w-[22px] sm:h-[22px]" />
              <h2 className="text-base sm:text-xl font-semibold text-white">Insights Semanales</h2>
              {insightsScore !== null && (
                <span className="text-[10px] sm:text-xs text-[#c8a55a] bg-[#c8a55a]/10 border border-[#c8a55a]/20 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                  {insightsScore}/100
                </span>
              )}
            </div>
            <Link href="/insights" className="text-[10px] sm:text-xs text-[#c8a55a] hover:underline flex items-center gap-1">
              Ver todo <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {visibleInsights.map((insight, idx) => {
              const borderClass = insight.type === 'positive'
                ? 'border-[#22c55e]/15 hover:border-[#22c55e]/30'
                : insight.type === 'warning'
                ? 'border-[#e8a849]/15 hover:border-[#e8a849]/30'
                : 'border-[#1a1a1a] hover:border-[#2a2a2a]';
              return (
                <div
                  key={insight.id}
                  className={`bg-[#0a0a0a] border rounded-xl p-3 sm:p-5 transition-all duration-200 ${borderClass} ${idx >= 1 ? 'hidden sm:block' : ''}`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="text-base sm:text-xl shrink-0">{insight.icon}</span>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-semibold text-white mb-0.5 sm:mb-1">{insight.title}</h3>
                      <p className="text-[10px] sm:text-xs text-[#999] leading-relaxed line-clamp-2">{insight.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Calm fallback */
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-5">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
              <Sparkles size={16} className="text-[#c8a55a]/30 sm:w-[20px] sm:h-[20px]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-medium text-[#666]">Insights Semanales</h2>
              <p className="text-[10px] sm:text-[11px] text-[#444]">No disponible</p>
            </div>
          </div>
        </div>
      )}

      {/* Premium Reflection */}
      <PremiumReflection />

      {/* Achievements Preview — show only 3 on mobile, with calm fallback */}
      {achievementsStats && achievements && sortedAchievements ? (
        <div>
          <div className="flex items-center justify-between mb-3 sm:mb-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <Trophy size={18} className="text-[#c8a55a] sm:w-[22px] sm:h-[22px]" />
              <h2 className="text-base sm:text-xl font-semibold text-white">Logros</h2>
              <span className="text-[10px] sm:text-xs text-[#666]">{achievementsStats.unlocked}/{achievementsStats.total}</span>
            </div>
            <Link href="/logros" className="text-[10px] sm:text-xs text-[#c8a55a] hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-3">
            {sortedAchievements.map((ach, idx) => {
                const isUnlocked = ach.unlocked;
                return (
                  <div
                    key={ach.key}
                    className={`rounded-xl p-2 sm:p-4 transition-all duration-300 group ${
                      idx >= 3 ? 'hidden sm:block' : ''
                    } ${
                      isUnlocked
                        ? 'bg-[#0a0a0a] border border-[#c8a55a]/20 hover:border-[#c8a55a]/40'
                        : 'bg-[#080808] border border-[#1a1a1a]'
                    }`}
                  >
                    <div className="flex flex-col items-center text-center">
                      <div
                        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-1 sm:mb-2 transition-transform duration-300 group-hover:scale-110 ${
                          isUnlocked ? 'bg-[#c8a55a]/15' : 'bg-[#111]'
                        }`}
                      >
                        {isUnlocked ? (
                          <Crown size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
                        ) : (
                          <Lock size={14} className="text-[#333] sm:w-[18px] sm:h-[18px]" />
                        )}
                      </div>
                      <h4 className={`text-[10px] sm:text-xs font-semibold truncate w-full ${isUnlocked ? 'text-white' : 'text-[#555]'}`}>
                        {ach.title}
                      </h4>
                      <p className="text-[9px] text-[#555] mt-0.5 truncate w-full hidden sm:block">{ach.description}</p>
                      <div className="w-full bg-[#1a1a1a] rounded-full h-1 mt-1 sm:mt-2 overflow-hidden">
                        <div
                          className={`h-1 rounded-full transition-all duration-700 ${isUnlocked ? 'bg-[#c8a55a]' : 'bg-[#333]'}`}
                          style={{ width: `${ach.percent}%` }}
                        />
                      </div>
                      <span className="text-[8px] sm:text-[9px] text-[#555] mt-0.5 sm:mt-1">{ach.percent}%</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : (
        /* Calm fallback */
        <div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
              <Trophy size={16} className="text-[#c8a55a]/30 sm:w-[20px] sm:h-[20px]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-medium text-[#666]">Logros</h2>
              <p className="text-[10px] sm:text-[11px] text-[#444]">No disponible</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats — reduced padding on mobile */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-1.5 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Star size={16} className="text-[#c8a55a] sm:w-[20px] sm:h-[20px]" />
            <div>
              <p className="text-sm sm:text-2xl font-bold text-white">{totalXp}</p>
              <p className="text-[9px] sm:text-xs text-[#999]">XP total</p>
            </div>
          </div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-1.5 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Trophy size={16} className="text-[#c8a55a] sm:w-[20px] sm:h-[20px]" />
            <div>
              <p className="text-sm sm:text-2xl font-bold text-white">{totalLevels}</p>
              <p className="text-[9px] sm:text-xs text-[#999]">Niveles</p>
            </div>
          </div>
        </div>
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-1.5 sm:p-5">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Flame size={16} className="text-[#c8a55a] sm:w-[20px] sm:h-[20px]" />
            <div>
              <p className="text-sm sm:text-2xl font-bold text-white">
                {bestStreak}
              </p>
              <p className="text-[9px] sm:text-xs text-[#999]">Mejor racha</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
