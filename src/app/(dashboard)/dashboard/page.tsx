'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useApi } from '@/hooks/useApi';
import { CheckInModal } from '@/components/checkin/CheckInModal';
import { EmotionalHero } from '@/components/dashboard/EmotionalHero';
import { SilentMemory } from '@/components/ui/SilentMemory';
import { DashboardSkeleton } from '@/components/ui/PremiumSkeleton';
import LifePatternsSection from '@/components/patterns/LifePatternsSection';
import PremiumReflection from '@/components/ui/PremiumReflection';
import { MonthlyClosurePrompt } from './MonthlyClosurePrompt';

import { Shield, Brain, Zap, Gem, TrendingUp, Sunrise } from 'lucide-react';
import PrivacyMask from '@/components/ui/PrivacyMask';
import { getEmotionEmoji } from '@/lib/emotion-emojis';

// DASH-2: Greeting must use Madrid timezone, not browser-local.
// The rest of the app uses getTodayDateKey() (Madrid) for "today" boundaries,
// so the greeting must match.
function getMadridGreeting(): string {
  const madridStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  // madridStr = "YYYY-MM-DD HH:MM:SS"
  const hour = parseInt(madridStr.split(' ')[1].split(':')[0], 10);
  if (hour < 6) return 'Buenas noches';
  if (hour < 12) return 'Buenos días';
  if (hour < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

interface EmpireData {
  empire: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  streak: number;
  progress: number;
}

const EMPIRE_CONFIG: Record<string, { name: string; icon: any; color: string }> = {
  disciplina: { name: 'Disciplina', icon: Shield, color: '#c8a55a' },
  mente: { name: 'Mente', icon: Brain, color: '#c8a55a' },
  energia: { name: 'Energía', icon: Zap, color: '#c8a55a' },
  riqueza: { name: 'Finanzas', icon: Gem, color: '#c8a55a' },
  crecimiento: { name: 'Crecimiento', icon: TrendingUp, color: '#c8a55a' },
};

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const { apiFetch } = useApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isActive: screenshotMode, displayUser } = useScreenshotMode();
  const [empires, setEmpires] = useState<EmpireData[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayCheckin, setTodayCheckin] = useState<any | null>(null);
  const [showCheckinModal, setShowCheckinModal] = useState(false);
  const [emotionalRefreshKey, setEmotionalRefreshKey] = useState(0); // DASH-5: trigger EmotionalHero refetch after check-in

  const onboardingConfirmed = user?.onboardingCompleted === true;

  // ─── Post-checkout: poll for premium activation ──────────────────
  // After Stripe checkout, the user returns to /dashboard?upgraded=true.
  // The webhook might not have processed yet, so a single refreshUser()
  // could return FREE even though payment succeeded.
  //
  // Strategy: poll with increasing backoff (2s, 4s, 8s).
  // If premium is detected, stop polling and clean URL.
  // If all attempts fail, show a calm "activating" state — the user
  // doesn't lose anything; the webhook will process eventually.
  const upgradedPollingRef = useRef(false);

  useEffect(() => {
    if (searchParams.get('upgraded') !== 'true') return;
    if (upgradedPollingRef.current) return;
    upgradedPollingRef.current = true;

    const pollDelays = [2000, 4000, 8000]; // 2s, 4s, 8s
    let attempt = 0;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      await refreshUser();
      // If premium is now active, stop polling and clean URL
      // Note: we can't check `user.plan` here because it won't be
      // updated yet (refreshUser is async, state update is batched).
      // Instead, we'll check in a separate effect below.
      attempt++;
      if (attempt < pollDelays.length) {
        timeoutId = setTimeout(poll, pollDelays[attempt]);
      } else {
        // All attempts exhausted — clean URL regardless.
        // The webhook will process eventually, and the next
        // natural refreshUser() will pick it up.
        router.replace('/dashboard');
      }
    };

    // Start first poll immediately
    poll();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Separate effect: when user.plan becomes PREMIUM during polling,
  // clean the URL immediately (no need to keep polling).
  useEffect(() => {
    if (user?.plan === 'PREMIUM' && searchParams.get('upgraded') === 'true') {
      router.replace('/dashboard');
    }
  }, [user?.plan, searchParams, router]);

  useEffect(() => {
    if (!user || !onboardingConfirmed) return;

    if (screenshotMode) {
      const { SCREENSHOT_EMPIRES, SCREENSHOT_TODAY_CHECKIN } = require('@/lib/screenshot-data');
      setEmpires(SCREENSHOT_EMPIRES);
      setTodayCheckin(SCREENSHOT_TODAY_CHECKIN);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        // Only fetch what the vital dashboard needs:
        // Empires (for the grid) and today's check-in state.
        // Emotional state, momentum, streaks, challenges, and metrics
        // are fetched by their own components or removed entirely.
        const [empRes, checkRes] = await Promise.all([
          apiFetch('/api/empire', { signal: controller.signal }),
          apiFetch('/api/checkin?mode=today', { signal: controller.signal }),
        ]);

        if (cancelled) return;

        if (empRes.ok) {
          const empData = await empRes.json();
          setEmpires(empData.empires);
        }

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          setTodayCheckin(checkData.today);
        }
      } catch (error) {
        if (cancelled) return;
        // AbortError means the effect was cleaned up — not a real error
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.error('Error fetching dashboard data:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user, onboardingConfirmed, apiFetch, screenshotMode]);

  const handleCheckinSave = useCallback(async (data: any): Promise<{ xpAwarded: number }> => {
    // DASH-7: Throw on API error so the modal shows the error state instead of
    // false success ("Anotado ✓"). Previously, non-ok responses were silently
    // swallowed and the modal advanced to step 2, making the user believe their
    // check-in was saved when it wasn't.
    const res = await apiFetch('/api/checkin', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Check-in save failed: ${res.status}`);
    }
    const result = await res.json();
    const wasFirstCheckin = !todayCheckin;
    setTodayCheckin(result.checkin);

    // DASH-5: Refresh empire data so the grid immediately reflects the +10 XP
    // awarded to the mente empire on first check-in of the day. Without this,
    // the empire grid stays stale until the user navigates away and back.
    // Also trigger EmotionalHero to refetch (its state is derived from
    // check-ins, so it may change after a new check-in).
    if (wasFirstCheckin) {
      setEmotionalRefreshKey(k => k + 1);
      try {
        const empRes = await apiFetch('/api/empire');
        if (empRes.ok) {
          const empData = await empRes.json();
          setEmpires(empData.empires);
        }
      } catch {
        // Non-blocking — empire grid will update on next dashboard load
      }
      return { xpAwarded: 10 }; // DASH-38: +10 XP to mente on first check-in
    }
    return { xpAwarded: 0 }; // Edit of existing check-in — no XP awarded
  }, [apiFetch, todayCheckin]);

  if (!screenshotMode && !onboardingConfirmed) {
    return null;
  }

  if (loading) {
    return <DashboardSkeleton />;
  }

  const timeGreeting = getMadridGreeting();
  // DASH-33: Avoid trailing comma when user name is null/empty
  const userName = displayUser?.name?.trim() || '';

  return (
    <div className="max-w-5xl mx-auto">
      {/* Check-in Modal */}
      {showCheckinModal && (
        <CheckInModal
          onClose={() => setShowCheckinModal(false)}
          initialData={todayCheckin}
          onSave={handleCheckinSave}
        />
      )}

      {/* ═══ Desktop: Two-column contemplative layout ═══ */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-12 xl:gap-16">

        {/* ─── Left Column: Vital State ─── */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-5 sm:space-y-8 lg:space-y-10">

          {/* 1. Greeting — human, not UI */}
          <div className="dash-section-enter dash-section-delay-1 pt-2 sm:pt-4">
            <h1 className="title-page">
              {/* DASH-33: No trailing comma when name is empty */}
              {userName ? (
                <>{timeGreeting}, <span className="text-champagne">{userName}</span></>
              ) : (
                timeGreeting
              )}
            </h1>
            <SilentMemory />
          </div>

          {/* 2. Emotional State — "how does life feel right now" */}
          <div className="dash-section-enter dash-section-delay-2">
            <EmotionalHero refreshKey={emotionalRefreshKey} />
          </div>

          {/* 3. Reflection — contemplative pause */}
          <div className="dash-section-enter dash-section-delay-3">
            <PremiumReflection />
          </div>

          {/* 4. Check-in — invitation, not task */}
          <div className="dash-section-enter dash-section-delay-4">
            {todayCheckin ? (
              <div className="flex items-center gap-3 py-1">
                {/* DASH-1: emoji from shared single source of truth (same as CheckInModal) */}
                <span className="text-sm">{getEmotionEmoji(todayCheckin.emotion)}</span>
                <p className="text-xs text-[#555] truncate flex-1">«{todayCheckin.intention}»</p>
                <Link href="/checkin" className="text-[10px] text-[#444] hover:text-champagne transition-colors shrink-0">Historial</Link>
              </div>
            ) : (
              <button
                onClick={() => setShowCheckinModal(true)}
                className="flex items-center gap-3 group touch-press"
              >
                <div className="w-9 h-9 rounded-lg bg-champagne/8 flex items-center justify-center group-hover:bg-champagne/15 transition-colors">
                  <Sunrise size={15} className="text-champagne/60 group-hover:text-champagne transition-colors" />
                </div>
                <span className="text-sm text-[#555] group-hover:text-[#888] transition-colors">Check-in</span>
              </button>
            )}
          </div>

          {/* 5. Monthly Closure Prompt — subtle, no urgency */}
          <MonthlyClosurePrompt />
        </div>

        {/* ─── Right Column: Quiet Presence ─── */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-5 sm:space-y-8 lg:space-y-10 mt-6 lg:mt-0 lg:pt-2 sm:lg:pt-4">

          {/* 6. Empire Grid — quiet companions, not widgets */}
          <div className="dash-section-enter dash-section-delay-5">
            <div className="space-y-1">
              {Object.entries(EMPIRE_CONFIG).map(([key, config]) => {
                const empireData = empires.find((e) => e.empire === key);
                const level = empireData?.level || 1;
                const streak = empireData?.streak || 0;
                const xp = empireData?.xp || 0;
                const xpToNextLevel = empireData?.xpToNextLevel || 100;
                const Icon = config.icon;
                const progress = empireData?.progress || 0;

                return (
                  <Link
                    key={key}
                    href={`/imperio/${key}`}
                    className="flex items-center gap-3 py-2.5 sm:py-3 px-2 hover:bg-[#0a0a0a] rounded-lg transition-all duration-300 group touch-press"
                  >
                    <div className="w-8 h-8 rounded-lg bg-champagne/6 flex items-center justify-center shrink-0 group-hover:bg-champagne/12 transition-colors">
                      <Icon size={14} className="text-champagne/40 group-hover:text-champagne/70 transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm text-[#666] group-hover:text-[#999] transition-colors">{config.name}</h3>
                        <PrivacyMask compact>
                          <span className="text-[10px] text-[#333]">Nivel {level}</span>
                        </PrivacyMask>
                      </div>
                      {/* DASH-34/35: Discreet streak + XP info */}
                      <PrivacyMask compact>
                        <div className="flex items-center gap-2 mt-0.5">
                          {streak > 0 && (
                            <span className="text-[9px] text-[#2a2a2a]">{streak}d</span>
                          )}
                          <span className="text-[9px] text-[#222]">{xp % 100}/{xpToNextLevel} XP</span>
                        </div>
                      </PrivacyMask>
                      {/* DASH-31/37: Progress bar always visible (never disappears, even at level boundaries) */}
                      <PrivacyMask compact>
                        <div className="w-full h-px bg-[#1a1a1a] mt-1.5 overflow-hidden rounded-full">
                          <div
                            className="h-full bg-champagne/15 rounded-full transition-all duration-700"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </PrivacyMask>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 7. Life Patterns — only when they exist, quiet */}
          {<LifePatternsSection />}
        </div>
      </div>

      {/* ═══ Bottom: Deep silence ═══ */}
      {/* Intentional empty space. The dashboard ends here.
          No more modules. No more information.
          Silence is part of the design. */}
    </div>
  );
}
