'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, ReactNode } from 'react';
import {
  onAuthStateChanged,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  fetchSignInMethodsForEmail,
  updateProfile,
} from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';
import { trackAuthSyncFailure } from '@/lib/observability/server-tracking';
import { setAuthToken } from '@/lib/observability';

interface SubscriptionData {
  id: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface UserData {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  plan: string;
  avatarUrl: string | null;
  country: string | null;
  city: string | null;
  age: number | null;
  bio: string | null;
  weeklyEmailSummary?: boolean;
  dailyReminders?: boolean;
  privacyStatsVisible?: boolean;
  emailVerified?: boolean;
  welcomeEmailSent?: boolean;
  createdAt?: string;
  onboardingCompleted?: boolean;
  subscription?: SubscriptionData | null;
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: UserData | null;
  loading: boolean;
  syncError: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: (options?: { reloadFirebase?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState(false);
  const syncInFlight = useRef(false);

  const syncUser = useCallback(async (fbUser: FirebaseUser) => {
    // [SYNC-TRACE] 1. Entry in syncUser()
    console.warn('[SYNC-TRACE] syncUser() ENTER | uid:', fbUser.uid);
    // Prevent concurrent sync calls (e.g., onAuthStateChanged fires rapidly on mobile)
    if (syncInFlight.current) {
      console.warn('[SYNC-TRACE] syncUser() BLOCKED — syncInFlight=true, returning without sync');
      return;
    }
    syncInFlight.current = true;

    const attemptSync = async (attempt: number): Promise<boolean> => {
      // [SYNC-TRACE] 2. Entry in attemptSync()
      console.warn(`[SYNC-TRACE] attemptSync(${attempt}) ENTER`);
      try {
        setSyncError(false);
        // [SYNC-TRACE] 3. Start of getIdToken()
        console.warn('[SYNC-TRACE] attemptSync() getIdToken() START');
        const idToken = await fbUser.getIdToken();
        // [SYNC-TRACE] 4. Result of getIdToken()
        console.warn('[SYNC-TRACE] attemptSync() getIdToken() OK | length:', idToken?.length, '| prefix:', idToken?.substring(0, 8));
        // [SYNC-TRACE] 5/6/7. Start of fetch + URL + method
        const fetchUrl = '/api/auth/sync';
        console.warn(`[SYNC-TRACE] attemptSync() fetch START | url: ${fetchUrl} | method: POST`);
        const fetchStart = Date.now();
        const res = await fetch(fetchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
        const fetchMs = Date.now() - fetchStart;
        // [SYNC-TRACE] 8/9/10/11. Fetch returned response + time + status + ok
        console.warn(`[SYNC-TRACE] attemptSync() fetch RESPONSE | status: ${res.status} | ok: ${res.ok} | elapsed: ${fetchMs}ms`);

        if (res.ok) {
          const data = await res.json();
          // [SYNC-TRACE] 12. JSON received complete
          console.warn('[SYNC-TRACE] attemptSync() JSON received | keys:', Object.keys(data), '| hasUser:', !!data.user);
          // [SYNC-TRACE] 13. Just before setUser(data.user)
          console.warn('[SYNC-TRACE] attemptSync() BEFORE setUser(data.user) | userId:', data.user?.id);
          console.warn('[REACT-TRACE] BEFORE setUser', data.user);
          setUser(data.user);
          console.warn('[REACT-TRACE] AFTER setUser');
          // [SYNC-TRACE] 14. Just after setUser(data.user)
          console.warn('[SYNC-TRACE] attemptSync() AFTER setUser(data.user) | userId:', data.user?.id);
          return true;
        } else {
          // [SYNC-TRACE] 15. return false — non-2xx response
          console.warn(`[SYNC-TRACE] attemptSync(${attempt}) RETURN FALSE | cause: HTTP ${res.status}`);
          console.error(`[Auth] sync failed (attempt ${attempt}):`, res.status);
          trackAuthSyncFailure(attempt, res.status);
          return false;
        }
      } catch (error) {
        // [SYNC-TRACE] 16. Exception caught by attemptSync()
        console.warn(`[SYNC-TRACE] attemptSync(${attempt}) EXCEPTION CAUGHT |`, error);
        console.error(`[Auth] sync error (attempt ${attempt}):`, error);
        trackAuthSyncFailure(attempt, undefined, error);
        return false;
      }
    };

    try {
      // First attempt
      const firstOk = await attemptSync(1);
      if (firstOk) return;

      // Auto-retry once after 1.5s delay for resilience on mobile/slow connections
      await new Promise((r) => setTimeout(r, 1500));
      const retryOk = await attemptSync(2);
      if (retryOk) return;

      // [SYNC-TRACE] 17. setSyncError(true) executed
      console.warn('[SYNC-TRACE] syncUser() BOTH ATTEMPTS FAILED — executing setSyncError(true)');
      // Both attempts failed
      setSyncError(true);
    } finally {
      // ALWAYS reset — even if an unexpected error occurs.
      // Without this, a single unhandled rejection would lock
      // syncInFlight forever, blocking all future syncs.
      syncInFlight.current = false;
    }
  }, []);

  // Keep a live ref to firebaseUser so refreshUser always uses the
  // current user — even if called after a re-render that hasn't yet
  // updated the callback closure.
  const firebaseUserRef = useRef<FirebaseUser | null>(firebaseUser);
  firebaseUserRef.current = firebaseUser;

  // GLOBAL-12 FIX: Set the auth token for the observability logger when
  // the Firebase user changes. This allows the client logger to send
  // authenticated reports to /api/observability/report.
  useEffect(() => {
    if (firebaseUser) {
      firebaseUser.getIdToken().then(setAuthToken).catch(() => {});
    } else {
      setAuthToken(null);
    }
  }, [firebaseUser]);

  const refreshUser = useCallback(async (options?: { reloadFirebase?: boolean }) => {
    const currentUser = firebaseUserRef.current;
    if (!currentUser) return;
    try {
      // Only reload Firebase user when explicitly needed (e.g. email verification).
      // Skipping this saves ~200-500ms on onboarding completion.
      if (options?.reloadFirebase) {
        await currentUser.reload();
      }
      // Force token refresh to get fresh claims (including emailVerified)
      const idToken = await currentUser.getIdToken(true);

      // Try session endpoint first (faster, lookup-only)
      const sessionRes = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (sessionRes.ok) {
        const data = await sessionRes.json();
        setUser(data.user);
        setSyncError(false);
        return;
      }

      // Session lookup failed — fall back to /api/auth/sync which CREATES
      // the user if missing. This is critical when the initial syncUser
      // failed and the user doesn't exist in the DB yet. Without this
      // fallback, the onboarding retry is useless and emails never send.
      console.log('[Auth] session lookup failed, falling back to sync');
      const syncRes = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (syncRes.ok) {
        const data = await syncRes.json();
        setUser(data.user);
        setSyncError(false);
      } else {
        console.error('[Auth] sync fallback also failed:', syncRes.status);
        setSyncError(true);
      }
    } catch (error) {
      console.error('[Auth] refresh error:', error);
      setSyncError(true);
    }
  }, []); // No firebaseUser dep — uses ref instead

  useEffect(() => {
    let authResolved = false;
    let mounted = true;

    // Defensive timeout: if onAuthStateChanged never fires (e.g. Firebase
    // init hangs in Android TWA/WebView), force loading=false after 8s to
    // prevent ANR / infinite spinner.
    const timeoutId = setTimeout(() => {
      if (!authResolved) {
        console.warn('[Auth] onAuthStateChanged timeout — forcing loading=false');
        if (mounted) setLoading(false);
      }
    }, 8000);

    const unsubscribe = onAuthStateChanged(getAuthInstance(), (fbUser) => {
      authResolved = true;
      clearTimeout(timeoutId);
      if (!mounted) return; // Don't update state after unmount
      setFirebaseUser(fbUser);
      if (fbUser) {
        // Fire-and-forget: sync user data in background.
        // Don't block the loading state — the UI can render immediately
        // once Firebase auth is confirmed. Server sync (DB lookup, emails,
        // analytics) all run independently and update `user` when done.
        syncUser(fbUser);
      } else {
        setUser(null);
      }
      // Set loading false immediately — Firebase auth state is confirmed.
      // Components should check both `firebaseUser` and `user`:
      //   - firebaseUser: Firebase auth confirmed (instant)
      //   - user: Server sync completed (background, 1-5s)
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [syncUser]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(getAuthInstance(), email, password);
    // syncUser handled by onAuthStateChanged
  };

  const signUp = async (email: string, password: string, name?: string) => {
    const credential = await createUserWithEmailAndPassword(getAuthInstance(), email, password);
    // Set displayName on Firebase user so syncUser can pick it up
    if (name && credential.user) {
      try {
        await updateProfile(credential.user, { displayName: name });
        // NOTE: Do NOT call setFirebaseUser here.
        // onAuthStateChanged will fire and update firebaseUser state.
        // Calling setFirebaseUser manually causes a double-fire of syncUser,
        // which creates a race condition for email sending and user creation.
      } catch {
        // Non-critical: name fallback is email prefix via syncUserToDatabase
      }
    }
    // syncUser handled by onAuthStateChanged
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(getAuthInstance(), provider);
    // syncUser handled by onAuthStateChanged
  };

  const signOut = useCallback(async () => {
    await firebaseSignOut(getAuthInstance());
    setUser(null);
    setFirebaseUser(null);
    setSyncError(false);
  }, []);

  // ── REACT-TRACE: state change observers ──
  useEffect(() => {
    console.warn('[REACT-TRACE] USER STATE CHANGED', { user });
  }, [user]);

  useEffect(() => {
    console.warn('[REACT-TRACE] FIREBASE USER CHANGED', { firebaseUser });
  }, [firebaseUser]);

  useEffect(() => {
    console.warn('[REACT-TRACE] LOADING CHANGED', { loading });
  }, [loading]);

  // Memoize the provider value to prevent cascade re-renders.
  // Without this, every auth state change creates a new object reference,
  // causing ALL consumers (Sidebar, TopBar, every page) to re-render
  // even if they only use `signIn` or `signOut` (which are stable).
  const contextValue = useMemo(() => ({
    firebaseUser, user, loading, syncError,
    signIn, signUp, signInWithGoogle, signOut, refreshUser,
  }), [firebaseUser, user, loading, syncError, signIn, signUp, signInWithGoogle, signOut, refreshUser]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      <SyncTracePanel />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export interface ProviderMismatchResult {
  message: string;
  provider: 'google' | 'password' | null;
}

/**
 * Reactive check: returns a premium provider-mismatch message
 * for display AFTER a failed auth attempt.
 * Used in catch blocks for auth/account-exists-with-different-credential,
 * auth/invalid-credential, and auth/email-already-in-use.
 */
export async function getProviderMismatchMessage(email: string): Promise<ProviderMismatchResult> {
  try {
    const methods = await fetchSignInMethodsForEmail(getAuthInstance(), email);
    if (methods.includes('google.com')) {
      return {
        message: 'Esta cuenta utiliza acceso con Google. Continúa usando Google para iniciar sesión.',
        provider: 'google',
      };
    }
    if (methods.includes('password')) {
      return {
        message: 'Esta cuenta usa correo y contraseña. Inicia sesión desde ahí.',
        provider: 'password',
      };
    }
    return {
      message: 'Este correo ya está registrado. Inicia sesión con tu cuenta.',
      provider: null,
    };
  } catch {
    return {
      message: 'Este correo ya está registrado. Inicia sesión con tu cuenta.',
      provider: null,
    };
  }
}

export interface ProviderCheckResult {
  exists: boolean;
  provider: 'google' | 'password' | 'unknown' | null;
  message: string | null;
}

/**
 * Proactive check: call this on email blur to detect provider mismatches
 * BEFORE the user submits the form. Returns a subtle hint message
 * appropriate for inline display below the email field.
 *
 * Returns { exists: false, ... } if the email is not registered at all,
 * allowing the register flow to proceed normally.
 */
// ═══════════════════════════════════════════════════════════════════
// SYNC-TRACE VISUAL PANEL (temporary — only renders when ?debugSync=1)
// Single source of truth: intercepts console.warn for [SYNC-TRACE] messages.
// No window.__* globals. No parallel state. No duplicate instrumentation.
// ═══════════════════════════════════════════════════════════════════

interface SyncTraceEntry {
  id: number;
  time: string;
  msg: string;
  isError: boolean;
}

const _origWarn = console.warn;
const _stEvents: SyncTraceEntry[] = [];
const _stSubs = new Set<() => void>();
let _stId = 0;
let _stPatched = false;

function _stPatch() {
  if (_stPatched) return;
  _stPatched = true;
  console.warn = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    if (first.includes('[SYNC-TRACE]')) {
      _stId++;
      const now = new Date();
      const ms = String(now.getMilliseconds()).padStart(3, '0');
      const time = now.toLocaleTimeString('es-ES', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' + ms;
      const msg = args.map(a => typeof a === 'string' ? a : a instanceof Error ? a.message + (a.stack ? '\n' + a.stack : '') : JSON.stringify(a ?? '')).join(' ');
      _stEvents.push({ id: _stId, time, msg, isError: /EXCEPTION|FAILED|BLOCKED|RETURN FALSE|RETURN \d{3}/i.test(msg) });
      _stSubs.forEach(fn => fn());
    }
    _origWarn.apply(console, args);
  };
}

function SyncTracePanel() {
  const [, rerender] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    _stPatch();
    const sub = () => rerender(n => n + 1);
    _stSubs.add(sub);
    return () => { _stSubs.delete(sub); };
  }, []);

  useEffect(() => {
    if (scrollRef.current && !minimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [rerender, minimized]);

  if (typeof window === 'undefined') return null;
  if (!new URLSearchParams(window.location.search).has('debugSync')) return null;

  const events = _stEvents;
  const errCount = events.filter(e => e.isError).length;

  const handleCopy = () => {
    const text = events.map(e => `#${e.id} [${e.time}] ${e.msg}`).join('\n');
    navigator.clipboard.writeText(text || '(no events)').catch(() => {});
  };

  const handleClear = () => {
    _stEvents.length = 0;
    _stId = 0;
    _stSubs.forEach(fn => fn());
  };

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
          background: errCount > 0 ? '#7f1d1d' : '#1a1a1a',
          border: '1px solid ' + (errCount > 0 ? '#ef4444' : '#333'),
          borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
          color: errCount > 0 ? '#fca5a5' : '#888', fontSize: 11, fontFamily: 'monospace',
          userSelect: 'none', lineHeight: 1,
        }}
      >
        SYNC-TRACE ({events.length}){errCount > 0 ? ` ${errCount} ERR` : ''}
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
      width: 'min(92vw, 380px)', maxHeight: '55vh',
      background: '#0a0a0a', border: '1px solid #262626', borderRadius: 10,
      fontFamily: 'monospace', fontSize: 10, color: '#ccc',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px', borderBottom: '1px solid #1a1a1a', flexShrink: 0,
        background: '#111',
      }}>
        <span style={{ color: '#eab308', fontWeight: 600, fontSize: 10, letterSpacing: 0.5 }}>
          SYNC-TRACE ({events.length})
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={handleCopy} style={{
            background: 'none', border: '1px solid #333', borderRadius: 4, color: '#888',
            fontSize: 10, padding: '2px 6px', cursor: 'pointer', lineHeight: 1,
          }}>
            Copy
          </button>
          <button onClick={handleClear} style={{
            background: 'none', border: '1px solid #333', borderRadius: 4, color: '#888',
            fontSize: 10, padding: '2px 6px', cursor: 'pointer', lineHeight: 1,
          }}>
            Clear
          </button>
          <button onClick={() => setMinimized(true)} style={{
            background: 'none', border: '1px solid #333', borderRadius: 4, color: '#888',
            fontSize: 10, padding: '2px 6px', cursor: 'pointer', lineHeight: 1,
          }}>
            &#x2014;
          </button>
        </div>
      </div>

      {/* Event list */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '4px 0',
        scrollbarWidth: 'thin', scrollbarColor: '#333 transparent',
      }}>
        {events.length === 0 && (
          <div style={{ padding: '12px 8px', color: '#555', textAlign: 'center', fontSize: 10 }}>
            Esperando eventos [SYNC-TRACE]...
          </div>
        )}
        {events.map(e => (
          <div key={e.id} style={{
            padding: '3px 8px', borderBottom: '1px solid #111',
            borderLeft: e.isError ? '2px solid #ef4444' : '2px solid #333',
            background: e.isError ? 'rgba(239,68,68,0.06)' : 'transparent',
            lineHeight: 1.4, wordBreak: 'break-all', whiteSpace: 'pre-wrap',
          }}>
            <span style={{ color: '#555' }}>#{e.id}</span>{' '}
            <span style={{ color: '#444' }}>[{e.time}]</span>{' '}
            <span style={{ color: e.isError ? '#f87171' : '#d4d4d4' }}>{e.msg.replace('[SYNC-TRACE] ', '')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function checkEmailProvider(email: string): Promise<ProviderCheckResult> {
  try {
    const methods = await fetchSignInMethodsForEmail(getAuthInstance(), email);

    if (methods.length === 0) {
      return { exists: false, provider: null, message: null };
    }

    // Both providers linked to same account — no conflict
    if (methods.includes('password') && methods.includes('google.com')) {
      return { exists: true, provider: null, message: null };
    }

    if (methods.includes('google.com') && !methods.includes('password')) {
      return {
        exists: true,
        provider: 'google',
        message: 'Esta cuenta utiliza acceso con Google.',
      };
    }

    if (methods.includes('password') && !methods.includes('google.com')) {
      return {
        exists: true,
        provider: 'password',
        message: 'Esta cuenta ya fue creada con correo y contraseña.',
      };
    }

    return {
      exists: true,
      provider: 'unknown',
      message: 'Este correo ya está registrado.',
    };
  } catch {
    // Silently fail — never block the auth flow due to a check error
    return { exists: false, provider: null, message: null };
  }
}
