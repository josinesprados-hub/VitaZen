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
    console.warn('[POST-LOGIN-TRACE] LAYOUT redirect-effect', { loading, firebaseUser: !!firebaseUser, user: !!user, onboardingCompleted: user?.onboardingCompleted, syncError });
    if (loading) {
      console.warn('[POST-LOGIN-TRACE] LAYOUT redirect-effect → EARLY RETURN (loading=true)');
      return;
    }

    // No auth at all → login
    if (!user && !firebaseUser) {
      console.warn('[POST-LOGIN-TRACE] LAYOUT redirect-effect → REDIRECT /login');
      router.replace('/login');
      return;
    }

    // Sync failed while we have Firebase auth → onboarding gate handles it
    if (firebaseUser && !user && syncError) {
      console.warn('[POST-LOGIN-TRACE] LAYOUT redirect-effect → REDIRECT /onboarding (syncError)');
      router.replace('/onboarding');
      return;
    }

    // User confirmed but onboarding not completed → onboarding gate
    if (user && !user.onboardingCompleted) {
      console.warn('[POST-LOGIN-TRACE] LAYOUT redirect-effect → REDIRECT /onboarding (!onboardingCompleted)');
      router.replace('/onboarding');
      return;
    }

    console.warn('[POST-LOGIN-TRACE] LAYOUT redirect-effect → NO REDIRECT (all clear)');
  }, [user, firebaseUser, loading, syncError, router]);

  // ─── TEMPORARY: mount debug visual panel when debugAuth=1 in URL ───
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('debugAuth')) return;
    let root: any = null;
    const el = document.createElement('div');
    document.body.appendChild(el);
    import('react-dom/client').then(({ createRoot }) => {
      root = createRoot(el);
      root.render(<__DebugAuthPanel />);
    });
    return () => {
      if (root) root.unmount();
      el.remove();
    };
  }, []);

  // ─── Offline banner + retry handler ───
  const handleRetry = useCallback(() => {
    setSyncTimedOut(false);
    if (firebaseUser) {
      refreshUser();
    }
  }, [firebaseUser, refreshUser]);

  // ─── 1. Auth resolving (no firebaseUser yet) ───
  console.warn('[POST-LOGIN-TRACE] LAYOUT guard-1 check', { loading, firebaseUser: !!firebaseUser, user: !!user, onboardingCompleted: user?.onboardingCompleted, result: loading && !firebaseUser ? 'SHOW SPLASH' : 'PASS' });
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
  console.warn('[POST-LOGIN-TRACE] LAYOUT guard-2 check', { loading, firebaseUser: !!firebaseUser, user: !!user, syncTimedOut, onboardingCompleted: user?.onboardingCompleted, result: firebaseUser && !user ? (syncTimedOut ? 'SHOW OFFLINE/RETRY' : 'SHOW LOADING') : 'PASS' });
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
                : 'La conexión está tardando más de lo habitual. Tu datos están seguros.'}
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
  console.warn('[POST-LOGIN-TRACE] LAYOUT guard-3 check', { loading, firebaseUser: !!firebaseUser, user: !!user, onboardingCompleted: user?.onboardingCompleted, result: !user || !user.onboardingCompleted ? 'SHOW PREPARANDO' : 'PASS' });
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
  console.warn('[POST-LOGIN-TRACE] LAYOUT → RENDER CHILDREN (dashboard)', { loading, firebaseUser: !!firebaseUser, user: !!user, onboardingCompleted: user?.onboardingCompleted });
  if (typeof window !== 'undefined') {
    const d = (window as any).__authDebug;
    if (d && d.step < 7) Object.assign(d, { step: 7, stepLabel: 'dashboard render' });
  }
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

// ─── TEMPORARY DEBUG PANEL COMPONENT (remove after diagnosis) ───
const STEP_LABELS = ['—','AuthContext mounted','onAuthStateChanged','firebaseUser recibido','syncUser iniciado','/api/auth/sync OK','user actualizado','dashboard render','children render'];

function __DebugAuthPanel() {
  const [debug, setLocal] = useState<any>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const d = (window as any).__authDebug;
      if (d) setLocal({ ...d });
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Auto step 8 when dashboard children are live
  useEffect(() => {
    if (debug && debug.step === 7 && debug.hasUser && debug.onboardingCompleted) {
      const d = (window as any).__authDebug;
      if (d) { Object.assign(d, { step: 8, stepLabel: 'children render' }); setLocal({ ...d, step: 8, stepLabel: 'children render' }); }
    }
  }, [debug]);

  if (!debug) return null;

  const c = (v: boolean | undefined, invert = false) => {
    if (v === undefined) return '#555';
    return invert ? (v ? '#ef4444' : '#22c55e') : (v ? '#22c55e' : '#666');
  };
  const sc: Record<string, string> = { NOT_STARTED: '#666', RUNNING: '#eab308', SUCCESS: '#22c55e', ERROR: '#ef4444' };

  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, width: 220, zIndex: 9999, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 11, userSelect: 'none' }}>
      {minimized ? (
        <button onClick={() => setMinimized(false)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#111', border: '1px solid #333', color: '#D4AF37', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
          DBG
        </button>
      ) : (
        <div style={{ background: 'rgba(8,8,8,0.96)', border: '1px solid #2a2a2a', borderRadius: 8, padding: 10, color: '#aaa', boxShadow: '0 4px 20px rgba(0,0,0,0.7)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#D4AF37', fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>AUTH TRACE</span>
            <button onClick={() => setMinimized(true)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>&times;</button>
          </div>
          <div style={{ marginBottom: 8, padding: '5px 7px', background: '#0a0a0a', borderRadius: 4, border: '1px solid #1a1a1a' }}>
            <div style={{ color: '#777', fontSize: 9, marginBottom: 2 }}>PASO {debug.step}/8</div>
            <div style={{ color: debug.step >= 7 ? '#22c55e' : debug.step >= 1 ? '#eab308' : '#666', fontWeight: 600, fontSize: 10, lineHeight: 1.3 }}>{STEP_LABELS[debug.step] || '—'}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 10, marginBottom: 8 }}>
            <span style={{ color: '#555' }}>loading</span><span style={{ color: c(debug.loading, true) }}>{String(debug.loading)}</span>
            <span style={{ color: '#555' }}>firebaseUser</span><span style={{ color: c(debug.hasFirebaseUser) }}>{String(debug.hasFirebaseUser)}</span>
            <span style={{ color: '#555' }}>user</span><span style={{ color: c(debug.hasUser) }}>{String(debug.hasUser)}</span>
            <span style={{ color: '#555' }}>onboarding</span><span style={{ color: c(debug.onboardingCompleted) }}>{debug.onboardingCompleted === undefined ? '—' : String(debug.onboardingCompleted)}</span>
            <span style={{ color: '#555' }}>syncUser</span><span style={{ color: sc[debug.syncStatus] || '#666', fontWeight: 600 }}>{debug.syncStatus}</span>
          </div>
          {debug.errorCode && (
            <div style={{ padding: '5px 7px', background: '#1a0505', borderRadius: 4, border: '1px solid #3a1515', fontSize: 10 }}>
              <div style={{ color: '#ef4444', fontWeight: 600, marginBottom: 2 }}>{debug.errorCode}</div>
              {debug.errorMessage && <div style={{ color: '#888', lineHeight: 1.3, wordBreak: 'break-all' }}>{debug.errorMessage}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
