'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmailVerificationBanner } from '@/components/ui/EmailVerificationBanner';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { trackEvent } from '@/lib/analytics';
import { RefreshCw, WifiOff } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading, syncError, firebaseUser, refreshUser } = useAuth();
  const { isActive: screenshotMode } = useScreenshotMode();
  const { isOffline } = useNetworkStatus();
  const router = useRouter();
  const pathname = usePathname();
  const sessionTracked = useRef(false);

  // ─── Sync timeout: prevent infinite "Cargando" spinner ───
  // If we have firebaseUser but no user data after 20s (slow network + cold Neon),
  // show a network-aware fallback instead of a silent infinite spinner.
  const [syncTimedOut, setSyncTimedOut] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    // Reset timeout when user data arrives
    if (user) {
      setSyncTimedOut(false);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = undefined;
      }
      return;
    }

    // Start timeout when we have firebaseUser but no user data
    if (firebaseUser && !user && !syncTimeoutRef.current) {
      syncTimeoutRef.current = setTimeout(() => {
        if (!firebaseUser) return; // Already resolved
        setSyncTimedOut(true);
      }, 20_000); // 20s — generous for cold starts + slow networks
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [firebaseUser, user]);

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

  // ─── Offline banner + retry handler ───
  const handleRetry = useCallback(() => {
    setSyncTimedOut(false);
    if (firebaseUser) {
      refreshUser();
    }
  }, [firebaseUser, refreshUser]);

  // ─── 1. Auth resolving (no firebaseUser yet) ───
  if (loading && !firebaseUser) {
    return (
      <div className="min-h-dvh bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-champagne animate-pulse" />
            <p className="text-champagne/60 text-xs tracking-widest uppercase font-medium">Cargando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 2. Sync pending (firebaseUser confirmed, waiting for server) ───
  if (firebaseUser && !user) {
    // Show network-aware fallback instead of infinite spinner
    if (syncTimedOut) {
      return (
        <div className="min-h-dvh bg-[#000000] flex items-center justify-center">
          <div className="text-center px-6 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-champagne/5 border border-champagne/10 flex items-center justify-center mx-auto mb-5">
              <WifiOff size={22} className="text-champagne/50" />
            </div>
            <p className="text-sm text-[#888] font-medium mb-1.5">
              {isOffline ? 'Sin conexión' : 'Cargando tu espacio'}
            </p>
            <p className="text-xs text-[#555] leading-relaxed mb-5">
              {isOffline
                ? 'Revisa tu conexión a internet e intenta de nuevo.'
                : 'La conexión está tardando más de lo habitual. Tus datos están seguros.'}
            </p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 text-champagne text-xs font-medium
                         bg-champagne/5 border border-champagne/15 rounded-lg px-4 py-2
                         hover:bg-champagne/10 hover:border-champagne/25
                         transition-all duration-200 active:scale-[0.97] touch-press"
            >
              <RefreshCw size={12} />
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-dvh bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-champagne animate-pulse" />
            <p className="text-champagne/60 text-xs tracking-widest uppercase font-medium">Cargando</p>
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
            <div className="h-2 w-2 rounded-full bg-champagne animate-pulse" />
            <p className="text-champagne/60 text-xs tracking-widest uppercase font-medium">Preparando</p>
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
        <div className="h-full bg-champagne route-progress-bar" />
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:ml-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-8 sm:pb-10 overflow-x-contain">
          {!screenshotMode && <EmailVerificationBanner />}
          {children}
        </main>
      </div>
    </div>
  );
}
