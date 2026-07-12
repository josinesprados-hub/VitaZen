'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const BT = '[BOOT-TRACE]';

let _renderSeq = 0;
let _effectSeq = 0;

export default function Home() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();

  // ── RENDER trace ──
  _renderSeq++;
  const rSeq = _renderSeq;
  console.warn(
    `${BT} RENDER #${rSeq}`,
    JSON.stringify({
      loading,
      firebaseUser: firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email } : null,
      user: user ? { id: user.id, email: user.email, onboardingCompleted: user.onboardingCompleted } : null,
    })
  );

  useEffect(() => {
    _effectSeq++;
    const eSeq = _effectSeq;
    const snap = JSON.stringify({
      loading,
      firebaseUser: firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email } : null,
      user: user ? { id: user.id, email: user.email, onboardingCompleted: user.onboardingCompleted } : null,
    });

    console.warn(`${BT} EFFECT #${eSeq} ENTRY`, snap);

    // ── GUARD: loading ──
    if (loading) {
      console.warn(`${BT} EFFECT #${eSeq} → BLOCKED by loading=true — returning early (no navigation)`);
      return;
    }
    console.warn(`${BT} EFFECT #${eSeq} → loading=false — proceeding to decision tree`);

    // ── GUARD: no auth at all → login ──
    if (!user && !firebaseUser) {
      console.warn(`${BT} EFFECT #${eSeq} → DECISION: !user(${!!user}) && !firebaseUser(${!!firebaseUser}) = TRUE → router.replace('/login')`);
      console.warn(`${BT} EFFECT #${eSeq} → BEFORE router.replace('/login')`);
      const result = router.replace('/login');
      console.warn(`${BT} EFFECT #${eSeq} → AFTER router.replace('/login') — returned:`, typeof result, result);
      return;
    }
    console.warn(`${BT} EFFECT #${eSeq} → DECISION: !user && !firebaseUser = FALSE — skipped login redirect`);

    // ── GUARD: Firebase auth confirmed, server sync pending ──
    if (firebaseUser && !user) {
      console.warn(`${BT} EFFECT #${eSeq} → DECISION: firebaseUser(${!!firebaseUser}) && !user(${!user}) = TRUE → BLOCKED (wait for syncUser)`);
      console.warn(`${BT} EFFECT #${eSeq} → returning — NO navigation. User will remain on splash V.`);
      return;
    }
    console.warn(`${BT} EFFECT #${eSeq} → DECISION: firebaseUser && !user = FALSE — skipped splash block`);

    // ── ROUTE: server sync complete ──
    if (user?.onboardingCompleted) {
      console.warn(`${BT} EFFECT #${eSeq} → DECISION: user?.onboardingCompleted=${!!user?.onboardingCompleted} → router.replace('/dashboard')`);
      console.warn(`${BT} EFFECT #${eSeq} → BEFORE router.replace('/dashboard')`);
      router.replace('/dashboard');
      console.warn(`${BT} EFFECT #${eSeq} → AFTER router.replace('/dashboard')`);
    } else {
      console.warn(`${BT} EFFECT #${eSeq} → DECISION: user?.onboardingCompleted=${!!user?.onboardingCompleted} → router.replace('/onboarding')`);
      console.warn(`${BT} EFFECT #${eSeq} → BEFORE router.replace('/onboarding')`);
      router.replace('/onboarding');
      console.warn(`${BT} EFFECT #${eSeq} → AFTER router.replace('/onboarding')`);
    }
  }, [user, firebaseUser, loading, router]);

  // ── POST-EFFECT render check ──
  console.warn(`${BT} RENDER #${rSeq} → about to return JSX (splash V visible)`);

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center">
      <img src="/images/v-gold-logo.png" alt="VitaZen" className="w-12 h-12 animate-pulse rounded-[20%]" />
    </div>
  );
}
