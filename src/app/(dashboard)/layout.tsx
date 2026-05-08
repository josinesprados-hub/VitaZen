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

  // Track daily session — once per mount, deduplicated server-side
  useEffect(() => {
    if (user && !loading && !sessionTracked.current) {
      sessionTracked.current = true;
      trackEvent({ event: 'daily_session' });
    }
  }, [user, loading]);

  if (loading) {
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

  // Firebase authenticated but sync failed (API down, network error, etc.)
  // Show retry instead of redirecting to login (prevents redirect loop)
  if (syncError && firebaseUser && !user) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5 text-center px-6">
          <div className="w-12 h-12 rounded-xl bg-[#c8a55a]/10 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-[#c8a55a] animate-pulse" />
          </div>
          <div>
            <p className="text-white text-sm font-medium mb-1">Conectando con el servidor</p>
            <p className="text-[#666] text-xs">No se pudo verificar tu sesión</p>
          </div>
          <button
            onClick={refreshUser}
            className="text-[#c8a55a] text-sm hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  if (user.onboardingCompleted === false) {
    router.replace('/onboarding');
    return null;
  }

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
