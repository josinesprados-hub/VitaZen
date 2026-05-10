'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmailVerificationBanner } from '@/components/ui/EmailVerificationBanner';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { trackEvent } from '@/lib/analytics';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading, syncError, firebaseUser } = useAuth();
  const { isActive: screenshotMode } = useScreenshotMode();
  const router = useRouter();
  const pathname = usePathname();
  const sessionTracked = useRef(false);

  // ─── Route transition progress ───
  // Shows a thin gold bar at the top during client-side navigations.
  // The bar appears instantly when pathname changes and disappears
  // after a short delay, giving the user immediate feedback that
  // their navigation was received.
  const [routeTransition, setRouteTransition] = useState(false);
  const prevPathname = useRef(pathname);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      setRouteTransition(true);

      // Clear any existing timer
      if (transitionTimer.current) {
        clearTimeout(transitionTimer.current);
      }

      // Keep the bar visible briefly so the user perceives the transition
      transitionTimer.current = setTimeout(() => {
        setRouteTransition(false);
      }, 400);
    }

    return () => {
      if (transitionTimer.current) {
        clearTimeout(transitionTimer.current);
      }
    };
  }, [pathname]);

  // Track daily session — once per mount, deduplicated server-side
  useEffect(() => {
    if (user && !loading && !sessionTracked.current) {
      sessionTracked.current = true;
      trackEvent({ event: 'daily_session' });
    }
  }, [user, loading]);

  // All navigation redirects in a single useEffect.
  // Calling router.replace() during render causes race conditions and loops.
  useEffect(() => {
    if (loading) return;

    // No auth at all → login
    if (!user && !firebaseUser) {
      router.replace('/login');
      return;
    }

    // Sync failed while we have Firebase auth → onboarding gate handles it
    if (firebaseUser && !user && syncError) {
      router.replace('/onboarding');
      return;
    }

    // User confirmed but onboarding not completed → onboarding gate
    if (user && !user.onboardingCompleted) {
      router.replace('/onboarding');
      return;
    }
  }, [user, firebaseUser, loading, syncError, router]);

  // ─── 1. Auth resolving (no firebaseUser yet) ───
  if (loading && !firebaseUser) {
    return (
      <div className="min-h-dvh bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Cargando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 2. Sync pending (firebaseUser confirmed, waiting for server) ───
  if (firebaseUser && !user) {
    return (
      <div className="min-h-dvh bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Cargando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 3. No auth or onboarding not completed ───
  // Redirect handled by useEffect above. Show loading while redirecting.
  if (!user || !user.onboardingCompleted) {
    return (
      <div className="min-h-dvh bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Preparando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 4. All checks passed — render dashboard ───
  return (
    <div className="min-h-dvh bg-[#000000]">
      {/* Route transition progress bar */}
      <div
        className={`fixed top-0 left-0 right-0 h-[2px] z-[60] transition-opacity duration-300 ${
          routeTransition ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="h-full bg-[#c8a55a] route-progress-bar" />
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:ml-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 sm:p-4 lg:p-6 pb-6 safe-bottom overflow-x-contain">
          {!screenshotMode && <EmailVerificationBanner />}
          {children}
        </main>
      </div>
    </div>
  );
}
