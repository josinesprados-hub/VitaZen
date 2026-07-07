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
    // Prevent concurrent sync calls (e.g., onAuthStateChanged fires rapidly on mobile)
    if (syncInFlight.current) return;
    syncInFlight.current = true;

    const attemptSync = async (attempt: number): Promise<boolean> => {
      try {
        setSyncError(false);
        const idToken = await fbUser.getIdToken();
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          return true;
        } else {
          console.error(`[Auth] sync failed (attempt ${attempt}):`, res.status);
          trackAuthSyncFailure(attempt, res.status);
          return false;
        }
      } catch (error) {
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
        message: 'Esta cuenta ya fue creada con correo y contraseña. Continúa usando ese método para acceder.',
        provider: 'password',
      };
    }
    return {
      message: 'Este correo ya está registrado. Usa el método original para acceder.',
      provider: null,
    };
  } catch {
    return {
      message: 'Este correo ya está registrado. Usa el método original para acceder.',
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
