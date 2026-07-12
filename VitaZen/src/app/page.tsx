'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, firebaseUser, loading, syncError } = useAuth();

  console.warn('[REACT-TRACE] PAGE RENDER', { loading, firebaseUser: !!firebaseUser, user: !!user, onboardingCompleted: user?.onboardingCompleted });

  useEffect(() => {
    console.warn('[REACT-TRACE] PAGE EFFECT ENTER', { loading, firebaseUser: !!firebaseUser, user: !!user, onboardingCompleted: user?.onboardingCompleted });

    if (loading) return;

    // No auth at all → login
    if (!user && !firebaseUser) {
      console.warn('[REACT-TRACE] LOGIN BRANCH');
      router.replace('/login');
      return;
    }

    // Firebase auth confirmed, but server sync pending.
    // Do NOT redirect yet — we need `user.onboardingCompleted` to decide
    // the correct destination. Redirecting to /onboarding before knowing
    // causes the onboarding flash for returning users.
    if (firebaseUser && !user) {
      if (syncError) {
        console.warn('[REACT-TRACE] WAIT BRANCH → SYNC ERROR → /login');
        router.replace('/login');
        return;
      }
      console.warn('[REACT-TRACE] WAIT BRANCH');
      return; // wait for syncUser to complete
    }

    // Server sync complete — route based on onboarding status
    if (user?.onboardingCompleted) {
      console.warn('[REACT-TRACE] DASHBOARD BRANCH');
      router.replace('/dashboard');
    } else {
      console.warn('[REACT-TRACE] ONBOARDING BRANCH');
      router.replace('/onboarding');
    }
  }, [user, firebaseUser, loading, syncError, router]);

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center">
      <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-12 h-12 animate-pulse rounded-[20%]" />
    </div>
  );
}