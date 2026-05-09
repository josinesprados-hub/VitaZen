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
  const { user, loading, syncError, firebaseUser } = useAuth();
  const router = useRouter();
  const sessionTracked = useRef(false);

  // Track daily session — once per mount, deduplicated server-side
  useEffect(() => {
    if (user && !loading && !sessionTracked.current) {
      sessionTracked.current = true;
      trackEvent({ event: 'daily_session' });
    }
  }, [user, loading]);

  // ─── 1. Auth resolving (no firebaseUser yet) ───
  // While we don't know if the user is authenticated, show simple loading.
  // NO dashboard. NO retry screen.
  if (loading && !firebaseUser) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
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
  // Show simple loading while server sync completes.
  // NO dashboard. NO retry screen. NO "Reintentar".
  if (firebaseUser && !user) {
    // If sync failed, redirect to onboarding gate — it handles sync errors
    // gracefully and will redirect to dashboard if onboarding is completed.
    if (syncError) {
      router.replace('/onboarding');
    }
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Cargando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 3. No auth at all — redirect to login ───
  if (!user && !firebaseUser) {
    router.replace('/login');
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Redirigiendo</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 4. User data confirmed but onboarding not completed ───
  // Safety redirect: send user to onboarding gate.
  // This is NOT "deciding onboarding" — it's redirecting to the gate
  // that makes the decision. The onboarding page handles the flow.
  if (user && !user.onboardingCompleted) {
    router.replace('/onboarding');
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
            <p className="text-[#c8a55a]/60 text-xs tracking-widest uppercase font-medium">Preparando</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 5. All checks passed — render dashboard ───
  // At this point: user exists, onboardingCompleted is true.
  // The dashboard is safe to render.
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
