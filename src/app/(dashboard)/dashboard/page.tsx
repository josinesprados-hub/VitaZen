'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useApi } from '@/hooks/useApi';
import { CheckInModal } from '@/components/checkin/CheckInModal';
import { EmotionalHero } from '@/components/dashboard/EmotionalHero';
import { OnboardingRecommendations } from '@/components/dashboard/OnboardingRecommendations';
import { WeeklyRecap } from '@/components/dashboard/WeeklyRecap';
import { DashboardSkeleton } from '@/components/ui/PremiumSkeleton';

import { Shield, Brain, Zap, Gem, TrendingUp, Trophy, Flame, Wind, BookOpen, CheckCircle, Wallet, Sunrise, ArrowRight } from 'lucide-react';
import { MomentumCard } from '@/components/dashboard/MomentumCard';
import { MicroReward } from '@/components/ui/MicroReward';
import PremiumReflection from '@/components/ui/PremiumReflection';
import {
  SCREENSHOT_EMPIRES,
  SCREENSHOT_CHALLENGE,
  SCREENSHOT_METRICS,
  SCREENSHOT_STREAKS,
  SCREENSHOT_TODAY_CHECKIN,
  SCREENSHOT_USER_NAME,
} from '@/lib/screenshot-data';

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
  const { isActive: screenshotMode } = useScreenshotMode();
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

  // Safety guard: never render dashboard content without confirmed onboarding.
  // The layout handles the redirect, but this prevents any flash of content.
  // Must come AFTER all hooks to respect React rules of hooks.
  const onboardingConfirmed = user?.onboardingCompleted === true;

  useEffect(() => {
    if (!user || !onboardingConfirmed) return;

    // ── Screenshot mode: use mock data, skip API calls ──
    if (screenshotMode) {
      setEmpires(SCREENSHOT_EMPIRES);
      setChallenge(SCREENSHOT_CHALLENGE);
      setMetrics(SCREENSHOT_METRICS);
      setStreaks(SCREENSHOT_STREAKS);
      setTodayCheckin(SCREENSHOT_TODAY_CHECKIN);
      setHasActivity(true);
      setLoading(false);
      return;
    }

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
  }, [user, onboardingConfirmed, apiFetch, screenshotMode]);

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

  // Screenshot mode bypasses onboarding check — it doesn't need real auth
  if (!screenshotMode && !onboardingConfirmed) {
    return null;
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  // NOTE: We do NOT show "No se pudo cargar el dashboard" when data is empty.
  // A new user who just completed onboarding legitimately has no empires/metrics/streaks/checkins.
  // The error state should only appear if the fetch itself failed (network error, 401, etc.),
  // which is handled by the try/catch above. An empty dashboard is a valid state.

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

      {/* ═══ 1. Greeting ═══ */}
      <div className="dash-section-enter dash-section-delay-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
          {getTimeGreeting()}, <span className="text-[#c8a55a]">{user?.name || 'Guerrero'}</span>
        </h1>
      </div>

      {/* ═══ 2. Reflection ═══ */}
      <div className="dash-section-enter dash-section-delay-2">
        <PremiumReflection />
      </div>

      {/* ═══ 3. Check-in CTA ═══ */}
      <div className="dash-section-enter dash-section-delay-3">
        {todayCheckin ? (
          /* Today's check-in summary (compact, after check-in done) */
          <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-2 flex items-center gap-3">
            <span className="text-base">{todayCheckin.emotion >= 4 ? '😊' : todayCheckin.emotion >= 3 ? '😐' : '😔'}</span>
            <p className="text-xs text-[#c8a55a] font-medium truncate flex-1">«{todayCheckin.intention}»</p>
            <span className="text-[10px] text-[#555] shrink-0">E{todayCheckin.energy} · F{todayCheckin.focus} · S{todayCheckin.stress}</span>
            <Link href="/checkin" className="text-[10px] text-[#555] hover:text-[#c8a55a] transition-colors shrink-0">Historial</Link>
          </div>
        ) : (
          /* Pre-check-in: elegant, secondary CTA */
          <button
            onClick={() => setShowCheckinModal(true)}
            className="flex items-center gap-2 bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-lg px-4 py-2 hover:border-[#c8a55a]/30 transition-all group touch-press w-full sm:w-auto sm:inline-flex"
          >
            <Sunrise size={14} className="text-[#c8a55a]/70 group-hover:text-[#c8a55a] transition-colors" />
            <span className="text-xs text-[#888] group-hover:text-white transition-colors">Haz check-in</span>
          </button>
        )}
      </div>

      {/* ═══ 4. Momentum ═══ */}
      <div className="dash-section-enter dash-section-delay-4">
        <MomentumCard />
      </div>

      {/* ═══ 5. Streak (only when active) ═══ */}
      {streaks && streaks.generalStreak > 0 && (
        <div className="dash-section-enter dash-section-delay-5 flex items-center gap-2 bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg px-3 py-1.5">
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

      {/* ═══ 6. Estado Actual ═══ */}
      <div className="dash-section-enter dash-section-delay-6">
        <EmotionalHero />
      </div>

      {/* ═══ 7. Onboarding Recommendations ═══ (hidden in screenshot mode) */}
      {!screenshotMode && (
        <div className="dash-section-enter dash-section-delay-7">
          <OnboardingRecommendations />
        </div>
      )}

      {/* ═══ 8. Metrics (only when activity exists) ═══ */}
      {hasActivity && metrics && (
        <div className="dash-section-enter dash-section-delay-8 grid grid-cols-4 gap-1.5 sm:gap-3">
          {[
            { label: 'Meditación', value: metrics.meditationWeek, unit: 'sem', href: '/imperio/mente', Icon: Wind, streak: streaks?.meditationStreak },
            { label: 'Hábitos', value: metrics.habitsCompleted, unit: 'sem', href: '/imperio/disciplina', Icon: CheckCircle, streak: streaks?.habitStreak },
            { label: 'Diario', value: metrics.journalWeek, unit: 'sem', href: '/imperio/crecimiento', Icon: BookOpen, streak: streaks?.journalStreak },
            { label: 'Finanzas', value: `${metrics.balance >= 0 ? '+' : ''}${metrics.balance.toFixed(0)}€`, unit: '30d', href: '/imperio/riqueza', Icon: Wallet, streak: null, isFinance: true },
          ].map(({ label, value, unit, href, Icon, streak: metricStreak, isFinance }) => (
            <Link key={label} href={href} className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-4 hover:border-[#c8a55a]/20 hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-all duration-200 cursor-pointer group touch-press">
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

      {/* ═══ 9. Empire Grid (compact) ═══ */}
      <div className="dash-section-enter dash-section-delay-8">
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
                className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-lg p-2 sm:p-3.5 hover:border-[#c8a55a]/25 hover:shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-all duration-200 group touch-press"
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

      {/* ═══ 10. Daily Challenge ═══ */}
      {challenge && (
        <Link
          href={getChallengeRoute(challenge.challenge.category)}
          className="dash-section-enter dash-section-delay-9 block bg-[#0a0a0a] border border-[#c8a55a]/15 rounded-lg p-2.5 sm:p-4 hover:border-[#c8a55a]/30 transition-all cursor-pointer group touch-press"
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
            <span className="inline-flex items-center gap-1 bg-[#c8a55a] text-black font-semibold px-3 py-1.5 rounded-lg group-hover:bg-[#d4b468] group-active:scale-[0.97] transition-all duration-200 text-xs mt-2">
              {getChallengeCTALabel(challenge.challenge.category)} <ArrowRight size={12} />
            </span>
          )}
        </Link>
      )}

      {/* ═══ 11. Weekly Recap (only after activity) ═══ */}
      {hasActivity && (
        <div className="dash-section-enter dash-section-delay-10">
          <WeeklyRecap />
        </div>
      )}

      {/* Micro-reward for actions */}
      <MicroReward trigger={challengeJustCompleted} message="Desafío completado" />
    </div>
  );
}
