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
import LifePatternsSection from '@/components/patterns/LifePatternsSection';

import { Shield, Brain, Zap, Gem, TrendingUp, Trophy, Sunrise, ArrowRight, Calendar } from 'lucide-react';
import { MomentumCard } from '@/components/dashboard/MomentumCard';
import { MicroReward } from '@/components/ui/MicroReward';
import PremiumReflection from '@/components/ui/PremiumReflection';
import { formatCurrency } from '@/lib/utils';
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

// ─── Monthly Closure Prompt ───
// Appears subtly on the first days of a new month.
// No urgency. No badges. No "completa tu review".
// Just: "Cuando quieras, hay un momento esperándote."

function MonthlyClosurePrompt() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || dismissed) return;

    const checkClosure = async () => {
      try {
        // Only check in first 7 days of month
        const now = new Date();
        if (now.getDate() > 7) return;

        const res = await apiFetch('/api/monthly-closure');
        if (res.ok) {
          const data = await res.json();
          // Show only if: closure period AND user hasn't reflected yet
          if (data.isClosurePeriod && !data.closure?.reflectedAt) {
            const { getEntryPrompt } = await import('@/lib/monthly-closure/copy');
            setMessage(getEntryPrompt(data.month));
            setShow(true);
          }
        }
      } catch {
        // Silent — never push
      }
    };

    checkClosure();
  }, [user, dismissed, apiFetch]);

  if (!show || dismissed) return null;

  return (
    <div className="dash-section-enter dash-section-delay-1.5">
      <Link
        href="/cierre-mensual"
        className="block bg-[#0a0a0a] border border-[#c8a55a]/10 rounded-xl p-4 hover:border-[#c8a55a]/20 transition-all group touch-press"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#c8a55a]/5 flex items-center justify-center">
            <Calendar size={14} className="text-[#c8a55a]/40 group-hover:text-[#c8a55a]/60 transition-colors" />
          </div>
          <p className="text-[#888] text-sm group-hover:text-[#999] transition-colors flex-1">
            {message}
          </p>
          <ArrowRight size={14} className="text-[#333] group-hover:text-[#c8a55a]/50 transition-colors shrink-0" />
        </div>
      </Link>
    </div>
  );
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
    <div className="max-w-3xl mx-auto space-y-5 sm:space-y-8 overflow-x-contain">
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
        <h1 className="title-page">
          {getTimeGreeting()}, <span className="text-[#c8a55a]">{user?.name || ''}</span>
        </h1>
      </div>

      {/* ═══ 1b. Monthly Closure Prompt — subtle, no urgency ═══ */}
      <MonthlyClosurePrompt />

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
            <p className="text-xs text-[#999] truncate flex-1">«{todayCheckin.intention}»</p>
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
          <span className={`text-sm text-[#c8a55a] ${[3, 7, 14, 21, 30].includes(streaks.generalStreak) ? 'streak-milestone-glow' : ''}`}>●</span>
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
        <div className="dash-section-enter dash-section-delay-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
            {[
              { label: 'Meditación', value: metrics.meditationWeek, unit: 'sem', href: '/imperio/mente', streak: streaks?.meditationStreak },
              { label: 'Hábitos', value: metrics.habitsCompleted, unit: 'sem', href: '/imperio/disciplina', streak: streaks?.habitStreak },
              { label: 'Diario', value: metrics.journalWeek, unit: 'sem', href: '/imperio/crecimiento', streak: streaks?.journalStreak },
              { label: 'Finanzas', value: `${metrics.balance >= 0 ? '+' : ''}${formatCurrency(Math.abs(metrics.balance))}`, unit: '30d', href: '/imperio/riqueza', streak: null, isFinance: true },
            ].map(({ label, value, unit, href, streak: metricStreak, isFinance }) => (
              <Link key={label} href={href} className="group touch-press py-2">
                <span className="label-discrete block mb-1.5">{label}</span>
                <p className={`number-emotional ${isFinance && metrics.balance < 0 ? 'text-amber-400' : isFinance ? 'text-[#c8a55a]' : 'text-white'}`}>{value}</p>
                <p className="text-whisper mt-1">{unit}{metricStreak && metricStreak > 0 ? ` · ${metricStreak}d` : ''}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 9. Empire Grid (compact) ═══ */}
      <div className="dash-section-enter dash-section-delay-8">
        <div className="mb-3 sm:mb-4">
          <h2 className="subtitle-silent">Tus imperios</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          {Object.entries(EMPIRE_CONFIG).map(([key, config]) => {
            const empireData = empires.find((e) => e.empire === key);
            const level = empireData?.level || 1;
            const streak = empireData?.streak || 0;
            const Icon = config.icon;

            return (
              <Link
                key={key}
                href={`/imperio/${key}`}
                className="rounded-lg p-3 sm:p-4 hover:bg-[#0a0a0a] transition-all duration-300 group touch-press"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#c8a55a]/8 flex items-center justify-center">
                    <Icon size={16} className="text-[#c8a55a]/60 group-hover:text-[#c8a55a] transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-[#ccc] group-hover:text-white transition-colors truncate">{config.name}</h3>
                    <p className="text-whisper mt-0.5">Nivel {level}{streak > 0 ? ` · ${streak}d` : ''}</p>
                  </div>
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
              <span className="text-[9px] text-[#c8a55a]/60 font-medium">Hecho</span>
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

      {/* ═══ 11. Patrones de Vida (Premium — subtle presence) ═══ */}
      {hasActivity && !screenshotMode && (
        <div className="dash-section-enter dash-section-delay-10">
          <LifePatternsSection />
        </div>
      )}

      {/* ═══ 12. Weekly Recap (only after activity) ═══ */}
      {hasActivity && (
        <div className="dash-section-enter dash-section-delay-11">
          <WeeklyRecap />
        </div>
      )}

      {/* Micro-reward for actions */}
      <MicroReward trigger={challengeJustCompleted} message="Hecho" />
    </div>
  );
}
