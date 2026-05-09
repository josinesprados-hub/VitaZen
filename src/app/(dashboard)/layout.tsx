'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmailVerificationBanner } from '@/components/ui/EmailVerificationBanner';
import { trackEvent } from '@/lib/analytics';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, loading, syncError, firebaseUser, refreshUser } = useAuth();
  const router = useRouter();
  const sessionTracked = useRef(false);

  // Auto-retry sync once on error (before showing manual "Reintentar")
  const [autoRetried, setAutoRetried] = useState(false);
  useEffect(() => {
    if (syncError && firebaseUser && !user && !autoRetried) {
      setAutoRetried(true);
      const timer = setTimeout(() => {
        refreshUser();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [syncError, firebaseUser, user, autoRetried, refreshUser]);

  // Track daily session — once per mount, deduplicated server-side
  useEffect(() => {
    if (user && !loading && !sessionTracked.current) {
      sessionTracked.current = true;
      trackEvent({ event: 'daily_session' });
    }
  }, [user, loading]);

  // ─── 1. Initial Firebase auth resolution (no firebaseUser yet) ───
  if (loading && !firebaseUser) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 skeleton-entrance">
          <div className="w-12 h-12 rounded-xl premium-shimmer" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Cargando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 2. Firebase auth confirmed but server sync still in progress ───
  // WAIT for user data before deciding whether to redirect or render.
  // This prevents the flash where dashboard renders briefly before
  // the onboarding redirect kicks in.
  if (firebaseUser && !user && !syncError) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 skeleton-entrance">
          <div className="w-12 h-12 rounded-xl premium-shimmer" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Cargando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 3. Sync failed (after auto-retry) — show manual retry ───
  // Auto-retry is handled by the useEffect above. If sync still fails
  // after auto-retry, show a manual retry button.
  if (syncError && firebaseUser && !user) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 text-center px-6">
          <div className="w-12 h-12 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
          </div>
          <div>
            <p className="text-white text-sm font-medium mb-1">Conectando con el servidor</p>
            <p className="text-[#666] text-xs">
              {autoRetried ? 'No se pudo verificar tu sesión' : 'Reintentando conexión...'}
            </p>
          </div>
          {autoRetried && (
            <button
              onClick={refreshUser}
              className="text-[#c8a55a] text-sm hover:underline"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── 4. No auth at all — redirect to login ───
  if (!user && !firebaseUser) {
    router.replace('/login');
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 skeleton-entrance">
          <div className="w-12 h-12 rounded-xl premium-shimmer" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Redirigiendo</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 5. User data confirmed but onboarding not completed ───
  // Using !user.onboardingCompleted instead of === false to also catch undefined
  // (defensive: if the field is missing from API response, redirect to onboarding).
  if (user && !user.onboardingCompleted) {
    router.replace('/onboarding');
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 skeleton-entrance">
          <div className="w-12 h-12 rounded-xl premium-shimmer" />
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Preparando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 6. All checks passed — render dashboard ───
  return (
    <div className="min-h-screen bg-[#000000]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:ml-64">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 sm:p-4 lg:p-6 pb-6 safe-bottom overflow-x-contain">
          <EmailVerificationBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
