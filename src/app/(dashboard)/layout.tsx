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
  if (firebaseUser && !user) {
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

  // ─── 3. No auth or onboarding not completed ───
  // Redirect handled by useEffect above. Show loading while redirecting.
  if (!user || !user.onboardingCompleted) {
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

  // ─── 4. All checks passed — render dashboard ───
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
