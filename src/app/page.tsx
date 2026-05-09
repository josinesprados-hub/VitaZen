'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user || firebaseUser) {
        // Authenticated — always go through the onboarding gate.
        // Onboarding page redirects to /dashboard if already completed.
        // This prevents the dashboard from ever rendering before
        // onboardingCompleted is confirmed.
        router.replace('/onboarding');
      } else {
        router.replace('/login');
      }
    }
  }, [user, firebaseUser, loading, router]);

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center">
      <img src="/images/vitazen-logo.png" alt="VitaZen" className="w-12 h-12 animate-pulse" />
    </div>
  );
}
