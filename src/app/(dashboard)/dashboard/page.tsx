'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { CheckInModal } from '@/components/checkin/CheckInModal';
import { EmotionalHero } from '@/components/dashboard/EmotionalHero';
import { OnboardingRecommendations } from '@/components/dashboard/OnboardingRecommendations';
import { WeeklyRecap } from '@/components/dashboard/WeeklyRecap';
import { DashboardSkeleton } from '@/components/ui/PremiumSkeleton';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { Shield, Brain, Zap, Gem, TrendingUp, Trophy, Flame, Wind, BookOpen, CheckCircle, Wallet, Sunrise, ArrowRight } from 'lucide-react';
import { MomentumCard } from '@/components/dashboard/MomentumCard';
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

const EMPIRE_CONFIG: Record<string, { name: string; icon: any; color: string }> = {
  disciplina: { name: 'Disciplina', icon: Shield, color: '#c8a55a' },
  mente: { name: 'Mente', icon: Brain, color: '#c8a55a' },
  energia: { name: 'Energía', icon: Zap, color: '#c8a55a' },
  riqueza: { name: 'Finanzas', icon: Gem, color: '#c8a55a' },
  crecimiento: { name: 'Crecimiento', icon: TrendingUp, color: '#c8a55a' },
};

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Buenas noches';
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

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
  const [todayCheckin, setTodayCheckin] = useState<any | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [challengeJustCompleted, setChallengeJustCompleted] = useState(false);

  // Whether user has any real activity (determines what to show)
  const [hasActivity, setHasActivity] = useState(false);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const fetchData = async () => {
      try {
        const [empRes, chRes, metRes, streakRes, checkRes] = await Promise.all([
          apiFetch('/api/empire'),
          apiFetch('/api/challenges'),
          apiFetch('/api/dashboard/metrics'),
          apiFetch('/api/dashboard/streaks'),
          apiFetch('/api/checkin?mode=today'),
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

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          setTodayCheckin(checkData.today);
        } else {
          failedCount++;
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Error fetching dashboard data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [user, apiFetch]);

  // Re-evaluate activity when data changes
  useEffect(() => {
    const hasRealActivity = (streaks?.generalStreak ?? 0) > 0 ||
      (metrics?.meditationWeek ?? 0) > 0 ||
      (metrics?.habitsCompleted ?? 0) > 0 ||
      (metrics?.journalWeek ?? 0) > 0 ||
      todayCheckin !== null;
    setHasActivity(hasRealActivity);
  }, [streaks, metrics, todayCheckin]);

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

  // Check for complete fetch failure
  if (!empires.length && !metrics && !streaks && !todayCheckin) {
    return (
      <div className="max-w-7xl mx-auto min-h-[60dvh] flex items-center justify-center">
        <PremiumErrorState
          variant="loading"
          title="No se pudo cargar el dashboard"
          subtitle="Tu progreso está seguro. Intenta recargar."
          onRetry={() => window.location.reload()}
          size="lg"
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-1.5 sm:space-y-5 overflow-x-contain">
      {/* Check-in Modal */}
      {showCheckinModal && (
        <CheckInModal
          onClose={() => setShowCheckinModal(false)}
          initialData={todayCheckin}
          onSave={handleCheckinSave}
        />
      )}

      {/* ═══ 1. Greeting + Check-in ═══ */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          {getTimeGreeting()}, <span className="text-[#c8a55a]">{user?.name || 'Guerrero'}</span>
        </h1>
        <button
          onClick={() => setShowCheckinModal(true)}
          className="flex items-center gap-1.5 bg-[#0a0a0a] border border-[#c8a55a]/20 rounded-lg px-3 py-1.5 hover:border-[#c8a55a]/40 transition-all group touch-press"
        >
          <Sunrise size={14} className="text-[#c8a55a]" />
          <span className="text-[11px] text-[#999] group-hover:text-white transition-colors">{todayCheckin ? 'Check-in' : 'Haz check-in'}</span>
        </button>
      </div>

      {/* Today's check-in summary (compact) */}
      {todayCheckin && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2 flex items-center gap-3">
          <span className="text-base">{todayCheckin.emotion >= 4 ? '😊' : todayCheckin.emotion >= 3 ? '😐' : '😔'}</span>
          <p className="text-xs text-[#c8a55a] font-medium truncate flex-1">«{todayCheckin.intention}»</p>
          <span className="text-[10px] text-[#555] shrink-0">E{todayCheckin.energy} · F{todayCheckin.focus} · S{todayCheckin.stress}</span>
          <Link href="/checkin" className="text-[10px] text-[#555] hover:text-[#c8a55a] transition-colors shrink-0">Historial</Link>
        </div>
      )}

      {/* ═══ 2. Momentum ═══ */}
      <MomentumCard />

      {/* ═══ 3. Streak (only when active) ═══ */}
      {streaks && streaks.generalStreak > 0 && (
        <div className="flex items-center gap-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-1.5">
          <span className={`streak-pulse text-sm ${[3, 7, 14, 21, 30].includes(streaks.generalStreak) ? 'streak-milestone-glow' : ''}`}>🔥</span>
          <p className="text-xs text-white font-medium">{streaks.generalStreak}d</p>
          <p className="text-[10px] text-[#999] flex-1">{streaks.streakMessage?.message}</p>
          {streaks.checkinStreak > 0 && (
            <Link href="/checkin" className="text-[10px] text-[#c8a55a] hover:underline shrink-0">
              Check-in {streaks.checkinStreak}d
            </Link>
          )}
        </div>
      )}

      {/* ═══ 4. Estado Actual ═══ */}
      <EmotionalHero />

      {/* ═══ 5. Onboarding Recommendations ═══ */}
      <OnboardingRecommendations />

      {/* ═══ 6. Metrics (only when activity exists) ═══ */}
      {hasActivity && metrics && (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
          {[
            { label: 'Meditación', value: metrics.meditationWeek, unit: 'sem', href: '/imperio/mente', Icon: Wind, streak: streaks?.meditationStreak },
            { label: 'Hábitos', value: metrics.habitsCompleted, unit: 'sem', href: '/imperio/disciplina', Icon: CheckCircle, streak: streaks?.habitStreak },
            { label: 'Diario', value: metrics.journalWeek, unit: 'sem', href: '/imperio/crecimiento', Icon: BookOpen, streak: streaks?.journalStreak },
            { label: 'Finanzas', value: `${metrics.balance >= 0 ? '+' : ''}${metrics.balance.toFixed(0)}€`, unit: '30d', href: '/imperio/riqueza', Icon: Wallet, streak: null, isFinance: true },
          ].map(({ label, value, unit, href, Icon, streak: metricStreak, isFinance }) => (
            <Link key={label} href={href} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-4 hover:border-[#c8a55a]/20 transition-colors cursor-pointer group touch-press">
              <div className="flex items-center gap-1 mb-1 sm:mb-2">
                <Icon size={12} className="text-[#c8a55a] sm:w-[14px] sm:h-[14px]" />
                <span className="text-[9px] sm:text-[10px] text-[#666] uppercase tracking-wider font-medium">{label}</span>
              </div>
              <p className={`text-base sm:text-xl font-bold ${isFinance && metrics.balance < 0 ? 'text-red-400' : isFinance ? 'text-[#c8a55a]' : 'text-white'}`}>{value}</p>
              <div className="flex items-center justify-between">
                <p className="text-[9px] text-[#555]">{unit}</p>
                {metricStreak && metricStreak > 0 && (
                  <span className="text-[9px] text-[#c8a55a] flex items-center gap-0.5">
                    <span className="streak-pulse">🔥</span>{metricStreak}d
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ═══ 7. Empire Grid (compact) ═══ */}
      <div>
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h2 className="text-sm sm:text-base font-semibold text-white">Imperios</h2>
          <span className="text-[10px] sm:text-xs text-[#666]">Nivel {empires.reduce((sum, e) => sum + e.level, 0)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-3">
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
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-3.5 hover:border-[#c8a55a]/25 transition-all group touch-press"
              >
                <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-3">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-md bg-[#c8a55a]/10 flex items-center justify-center">
                    <Icon size={12} className="text-[#c8a55a] sm:w-[16px] sm:h-[16px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[11px] sm:text-sm font-medium text-white group-hover:text-[#c8a55a] transition-colors truncate">{config.name}</h3>
                    <p className="text-[9px] sm:text-[10px] text-[#666]">Nv {level}</p>
                  </div>
                  {streak > 0 && (
                    <span className="text-[9px] sm:text-[10px] text-[#c8a55a] flex items-center gap-0.5">
                      <Flame size={9} /> {streak}d
                    </span>
                  )}
                </div>
                <div className="w-full bg-[#1a1a1a] rounded-full h-1 sm:h-1.5">
                  <div
                    className="bg-[#c8a55a] h-1 sm:h-1.5 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${empireProgress}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ═══ 8. Daily Challenge ═══ */}
      {challenge && (
        <Link
          href={getChallengeRoute(challenge.challenge.category)}
          className="block bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-lg p-2.5 sm:p-4 hover:border-[#c8a55a]/30 transition-all cursor-pointer group touch-press"
        >
          <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
            <Trophy size={14} className="text-[#c8a55a]" />
            <h2 className="text-xs sm:text-sm font-semibold text-white">Desafío Diario</h2>
            {challenge.completed && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#c8a55a]/15 text-[#c8a55a] font-medium">Completado</span>
            )}
            <ArrowRight size={12} className="text-[#333] group-hover:text-[#c8a55a]/60 transition-colors ml-auto" />
          </div>
          <h3 className="text-[#c8a55a] font-medium text-xs sm:text-sm mb-0.5">{challenge.challenge.title}</h3>
          {!challenge.completed && (
            <span className="inline-flex items-center gap-1 bg-[#c8a55a] text-black font-semibold px-3 py-1.5 rounded-lg group-hover:bg-[#d4b468] transition-colors text-xs mt-2">
              {getChallengeCTALabel(challenge.challenge.category)} <ArrowRight size={12} />
            </span>
          )}
        </Link>
      )}

      {/* ═══ 9. Weekly Recap (only after activity) ═══ */}
      {hasActivity && <WeeklyRecap />}

      {/* Micro-reward for actions */}
      <MicroReward trigger={challengeJustCompleted} message="Desafío completado" />
    </div>
  );
}
