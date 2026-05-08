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
import { MomentumCard } from '@/components/dashboard/MomentumCard';
import { ReturnTrigger } from '@/components/dashboard/ReturnTrigger';
import { MicroReward } from '@/components/ui/MicroReward';

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

// Time-of-day greeting for emotional continuity
function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Buenas noches';
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

// Map insight categories to their empire/page routes
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

// Map challenge categories to their action route (for navigation CTA)
function getChallengeRoute(category: string): string {
  const map: Record<string, string> = {
    'disciplina': '/imperio/disciplina',
    'habitos': '/imperio/disciplina',
    'mentalidad': '/imperio/mente',
    'productividad': '/imperio/crecimiento',
    'salud': '/checkin',
  };
  return map[category.toLowerCase()] || '/imperio/disciplina';
}

// Get a short label for the challenge CTA based on category
function getChallengeCTALabel(category: string): string {
  const map: Record<string, string> = {
    'disciplina': 'Ir a Hábitos',
    'habitos': 'Ir a Hábitos',
    'mentalidad': 'Ir a Mente',
    'productividad': 'Ir a Diario',
    'salud': 'Haz Check-in',
  };
  return map[category.toLowerCase()] || 'Ir al imperio';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [empires, setEmpires] = useState<EmpireData[]>([]);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<{ meditationWeek: number; habitsCompleted: number; journalWeek: number; balance: number; totalIncome: number; totalExpense: number } | null>(null);
  const [streaks, setStreaks] = useState<{ meditationStreak: number; habitStreak: number; journalStreak: number; checkinStreak: number; generalStreak: number; streakMessage: { message: string; tone: string } } | null>(null);
  const [progress, setProgress] = useState<{ meditation: { count: number; target: number; percent: number }; habits: { count: number; target: number; percent: number }; journal: { count: number; target: number; percent: number }; totalPercent: number } | null>(null);
  const [achievements, setAchievements] = useState<{ key: string; title: string; description: string; category: string; icon: string; target: number; current: number; percent: number; unlocked: boolean; unlockedAt: string | null }[] | null>(null);
  const [achievementsStats, setAchievementsStats] = useState<{ total: number; unlocked: number; percent: number } | null>(null);
  const [todayCheckin, setTodayCheckin] = useState<any | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [dashboardInsights, setDashboardInsights] = useState<{ id: string; type: string; category: string; icon: string; title: string; description: string }[] | null>(null);
  const [insightsScore, setInsightsScore] = useState<number | null>(null);
  const [fetchError, setFetchError] = useState(false);
  const [challengeJustCompleted, setChallengeJustCompleted] = useState(false);

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
    <div className="max-w-7xl mx-auto space-y-2 sm:space-y-10 overflow-x-contain">
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
              {getTimeGreeting()}, <span className="text-[#c8a55a]">{user?.name || 'Guerrero'}</span>
            </h1>
            <p className="text-[#999] mt-1 sm:mt-2 text-sm sm:text-base">Cada día es una oportunidad para avanzar.</p>
          </div>
          {todayCheckin && (
            <button
              onClick={() => setShowCheckinModal(true)}
              className="flex items-center gap-2 bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-xl px-4 py-2.5 hover:border-[#c8a55a]/40 transition-all group touch-press"
            >
              <Sunrise size={16} className="text-[#c8a55a]" />
              <span className="text-xs text-[#999] group-hover:text-white transition-colors">Check-in de hoy</span>
            </button>
          )}
        </div>
        {todayCheckin && (
          <div className="mt-2 sm:mt-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-3 sm:gap-4 card-enter">
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

      {/* Return Trigger — dynamic welcome back message */}
      <ReturnTrigger />

      {/* Momentum — consistency metric */}
      <MomentumCard />

      {/* Streak Message — human, not toxic */}
      {streaks && streaks.generalStreak > 0 && (
        <div className="flex items-center gap-2 sm:gap-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2 sm:px-4 sm:py-3 card-enter">
          <span className={`streak-pulse text-base sm:text-lg ${[3, 7, 14, 21, 30].includes(streaks.generalStreak) ? 'streak-milestone-glow' : ''}`}>🔥</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm text-white font-medium">Racha de {streaks.generalStreak} día{streaks.generalStreak !== 1 ? 's' : ''}</p>
            <p className="text-[10px] sm:text-xs text-[#999]">{streaks.streakMessage?.message}</p>
          </div>
          {streaks.checkinStreak > 0 && (
            <Link href="/checkin" className="text-[10px] sm:text-xs text-[#c8a55a] hover:underline flex items-center gap-1 shrink-0">
              Check-in {streaks.checkinStreak}d <ArrowRight size={10} />
            </Link>
          )}
        </div>
      )}
      {streaks && streaks.generalStreak === 0 && (
        <div className="flex items-center gap-2 sm:gap-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl px-3 py-2 sm:px-4 sm:py-3 card-enter">
          <span className="text-base sm:text-lg">🌱</span>
          <p className="text-[10px] sm:text-xs text-[#999]">{streaks.streakMessage?.message || 'Cada día es una oportunidad para avanzar.'}</p>
        </div>
      )}

      {/* Hero: Estado Actual */}
      <EmotionalHero />

      {/* Onboarding Recommendations */}
      <OnboardingRecommendations />

      {/* Metrics — with calm fallback when data is null */}
      {metrics ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 card-enter">
          <Link href="/imperio/mente" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press cursor-pointer group">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <Wind size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[10px] sm:text-xs text-[#666] uppercase tracking-wider font-medium">Meditación</span>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{metrics.meditationWeek}</p>
            <p className="text-[10px] sm:text-xs text-[#666] mt-0.5 sm:mt-1">esta semana</p>
            {streaks && streaks.meditationStreak > 0 ? (
              <p className="text-[10px] sm:text-xs text-[#c8a55a] mt-1 sm:mt-2 flex items-center gap-1">
                <span className="streak-pulse">🔥</span> {streaks.meditationStreak}d
              </p>
            ) : (
              <p className="text-[9px] sm:text-[10px] text-[#555] mt-1 sm:mt-2 group-hover:text-[#c8a55a]/60 transition-colors">Ir a Mente →</p>
            )}
          </Link>

          <Link href="/imperio/disciplina" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press cursor-pointer group">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <CheckCircle size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[10px] sm:text-xs text-[#666] uppercase tracking-wider font-medium">Hábitos</span>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{metrics.habitsCompleted}</p>
            <p className="text-[10px] sm:text-xs text-[#666] mt-0.5 sm:mt-1">esta semana</p>
            {streaks && streaks.habitStreak > 0 ? (
              <p className="text-[10px] sm:text-xs text-[#c8a55a] mt-1 sm:mt-2 flex items-center gap-1">
                <span className="streak-pulse">🔥</span> {streaks.habitStreak}d
              </p>
            ) : (
              <p className="text-[9px] sm:text-[10px] text-[#555] mt-1 sm:mt-2 group-hover:text-[#c8a55a]/60 transition-colors">Ir a Disciplina →</p>
            )}
          </Link>

          <Link href="/imperio/crecimiento" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press cursor-pointer group">
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/10 flex items-center justify-center">
                <BookOpen size={14} className="text-[#c8a55a] sm:w-[18px] sm:h-[18px]" />
              </div>
              <span className="text-[10px] sm:text-xs text-[#666] uppercase tracking-wider font-medium">Diario</span>
            </div>
            <p className="text-xl sm:text-3xl font-bold text-white">{metrics.journalWeek}</p>
            <p className="text-[10px] sm:text-xs text-[#666] mt-0.5 sm:mt-1">esta semana</p>
            {streaks && streaks.journalStreak > 0 ? (
              <p className="text-[10px] sm:text-xs text-[#c8a55a] mt-1 sm:mt-2 flex items-center gap-1">
                <span className="streak-pulse">🔥</span> {streaks.journalStreak}d
              </p>
            ) : (
              <p className="text-[9px] sm:text-[10px] text-[#555] mt-1 sm:mt-2 group-hover:text-[#c8a55a]/60 transition-colors">Ir a Crecimiento →</p>
            )}
          </Link>

          <Link href="/imperio/riqueza" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/20 transition-colors touch-press cursor-pointer group">
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
          </Link>
        </div>
      ) : (
        /* Calm fallback placeholder card */
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {[['Meditación', Wind, '/imperio/mente'], ['Hábitos', CheckCircle, '/imperio/disciplina'], ['Diario', BookOpen, '/imperio/crecimiento'], ['Finanzas', Wallet, '/imperio/riqueza']].map(([label, Icon, href]) => (
            <Link key={label as string} href={href as string} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2.5 sm:p-5 hover:border-[#c8a55a]/15 transition-colors cursor-pointer group touch-press">
              <div className="flex items-center gap-1.5 mb-1.5 sm:mb-3 sm:gap-2">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
                  <Icon size={14} className="text-[#c8a55a]/30 sm:w-[18px] sm:h-[18px]" />
                </div>
                <span className="text-[10px] sm:text-xs text-[#444] uppercase tracking-wider font-medium">{label}</span>
              </div>
              <p className="text-xl sm:text-3xl font-bold text-[#333]">—</p>
              <p className="text-[9px] sm:text-[10px] text-[#555] mt-0.5 sm:mt-1 group-hover:text-[#c8a55a]/60 transition-colors">Ir a {label} →</p>
            </Link>
          ))}
        </div>
      )}

      {/* Weekly Recap — after metrics, collapsed on mobile */}
      <WeeklyRecap />

      {/* Empire Grid */}
      <div className="card-enter">
        <h2 className="text-base sm:text-xl font-semibold text-white mb-3 sm:mb-5">Tus Imperios</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5">
          {Object.entries(EMPIRE_CONFIG).map(([key, config], idx) => {
            const empireData = empires.find((e) => e.empire === key);
            const level = empireData?.level || 1;
            const empireProgress = empireData?.progress || 0;
            const streak = empireData?.streak || 0;
            const Icon = config.icon;

            return (
              <Link
                key={key}
                href={`/imperio/${key}`}
                className={`bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5 hover:border-[#c8a55a]/30 transition-all group touch-press stagger-${Math.min(idx + 1, 5)}`}
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
                      <span className="streak-pulse"><Flame size={10} /></span> {streak}d
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
        <Link
          href={getChallengeRoute(challenge.challenge.category)}
          className="block bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-xl p-3 sm:p-5 card-enter hover:border-[#c8a55a]/40 transition-all duration-200 cursor-pointer group touch-press"
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
            <Trophy size={18} className="text-[#c8a55a] sm:w-[22px] sm:h-[22px]" />
            <h2 className="text-base sm:text-lg font-semibold text-white">Desafío Diario</h2>
            {challenge.completed && (
              <span className={`text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-[#c8a55a]/15 text-[#c8a55a] font-medium ${challengeJustCompleted ? 'check-pop' : ''}`}>Completado</span>
            )}
            <ArrowRight size={14} className="text-[#333] group-hover:text-[#c8a55a]/60 transition-colors ml-auto shrink-0" />
          </div>
          <h3 className="text-[#c8a55a] font-medium text-sm sm:text-lg mb-0.5 sm:mb-1">{challenge.challenge.title}</h3>
          <p className="text-[#999] text-xs sm:text-sm mb-3 sm:mb-4 line-clamp-2 sm:line-clamp-3">{challenge.challenge.description}</p>
          {!challenge.completed ? (
            <span className="inline-flex items-center gap-1.5 bg-[#c8a55a] text-black font-semibold px-4 py-2 rounded-xl group-hover:bg-[#d4b468] transition-colors text-sm">
              {getChallengeCTALabel(challenge.challenge.category)} <ArrowRight size={14} />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-[#c8a55a]/15 text-[#c8a55a] font-medium px-4 py-2 rounded-xl text-sm">
              <CheckCircle size={14} /> Completado automáticamente
            </span>
          )}
        </Link>
      ) : (
        /* Calm fallback */
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-3 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
              <Trophy size={16} className="text-[#c8a55a]/30 sm:w-[20px] sm:h-[20px]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-medium text-[#666]">Desafío Diario</h2>
              <p className="fallback-warm">Pronto un nuevo desafío para ti</p>
            </div>
          </div>
        </div>
      )}

      {/* Progreso Semanal — with calm fallback, compact on mobile */}
      {progress ? (
        <Link href="/insights" className="block bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2 sm:p-5 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group">
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
        </Link>
      ) : (
        /* Calm fallback */
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-2 sm:p-5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
              <Target size={16} className="text-[#c8a55a]/30 sm:w-[20px] sm:h-[20px]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-medium text-[#666]">Progreso Semanal</h2>
              <p className="fallback-warm">Tu progreso aparecerá aquí</p>
            </div>
          </div>
        </div>
      )}

      {/* Insights Preview — show only 1 on mobile, with calm fallback */}
      {dashboardInsights && dashboardInsights.length > 0 ? (
        <div className="card-enter">
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
              const insightHref = getCategoryHref(insight.category);
              return (
                <Link
                  key={insight.id}
                  href={insightHref}
                  className={`bg-[#0a0a0a] border rounded-xl p-3 sm:p-5 transition-all duration-200 cursor-pointer group ${borderClass} ${idx >= 1 ? 'hidden sm:block' : ''}`}
                >
                  <div className="flex items-start gap-2 sm:gap-3">
                    <span className="text-base sm:text-xl shrink-0">{insight.icon}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs sm:text-sm font-semibold text-white mb-0.5 sm:mb-1 group-hover:text-[#c8a55a] transition-colors">{insight.title}</h3>
                      <p className="text-[10px] sm:text-xs text-[#999] leading-relaxed line-clamp-2">{insight.description}</p>
                    </div>
                    <ArrowRight size={12} className="text-[#333] group-hover:text-[#c8a55a]/50 transition-colors shrink-0 mt-1" />
                  </div>
                </Link>
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
              <p className="fallback-warm">Los insights llegarán con tu actividad</p>
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
                  <Link
                    key={ach.key}
                    href="/logros"
                    className={`rounded-xl p-2 sm:p-4 transition-all duration-300 group cursor-pointer ${
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
                  </Link>
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
              <p className="fallback-warm">Sigue avanzando para desbloquearlos</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats — with general streak */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-4 card-enter">
        <Link href="/insights" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-1.5 sm:p-5 hover:border-[#c8a55a]/15 transition-colors cursor-pointer">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Star size={16} className="text-[#c8a55a] sm:w-[20px] sm:h-[20px]" />
            <div>
              <p className="text-sm sm:text-2xl font-bold text-white">{totalXp}</p>
              <p className="text-[9px] sm:text-xs text-[#999]">XP total</p>
            </div>
          </div>
        </Link>
        <Link href="/insights" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-1.5 sm:p-5 hover:border-[#c8a55a]/15 transition-colors cursor-pointer">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Flame size={16} className="text-[#c8a55a] sm:w-[20px] sm:h-[20px]" />
            <div>
              <p className="text-sm sm:text-2xl font-bold text-white">
                {streaks?.generalStreak ?? bestStreak}
              </p>
              <p className="text-[9px] sm:text-xs text-[#999]">Racha actual</p>
            </div>
          </div>
        </Link>
        <Link href="/insights" className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-1.5 sm:p-5 hover:border-[#c8a55a]/15 transition-colors cursor-pointer">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Trophy size={16} className="text-[#c8a55a] sm:w-[20px] sm:h-[20px]" />
            <div>
              <p className="text-sm sm:text-2xl font-bold text-white">{totalLevels}</p>
              <p className="text-[9px] sm:text-xs text-[#999]">Niveles</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Micro-reward for actions */}
      <MicroReward trigger={challengeJustCompleted} message="Desafío completado" />
    </div>
  );
}
