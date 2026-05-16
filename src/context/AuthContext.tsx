'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
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

interface SubscriptionData {
  id: string;
  stripeSubscriptionId: string;
  stripePriceId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

interface UserData {
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

    // First attempt
    const firstOk = await attemptSync(1);
    if (firstOk) {
      syncInFlight.current = false;
      return;
    }

    // Auto-retry once after 1.5s delay for resilience on mobile/slow connections
    await new Promise((r) => setTimeout(r, 1500));
    const retryOk = await attemptSync(2);
    if (retryOk) {
      syncInFlight.current = false;
      return;
    }

    // Both attempts failed
    setSyncError(true);
    syncInFlight.current = false;
  }, []);

  const refreshUser = useCallback(async (options?: { reloadFirebase?: boolean }) => {
    if (!firebaseUser) return;
    try {
      // Only reload Firebase user when explicitly needed (e.g. email verification).
      // Skipping this saves ~200-500ms on onboarding completion.
      if (options?.reloadFirebase) {
        await firebaseUser.reload();
      }
      // Force token refresh to get fresh claims (including emailVerified)
      const idToken = await firebaseUser.getIdToken(true);

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
  }, [firebaseUser]);

  useEffect(() => {
    let authResolved = false;

    // Defensive timeout: if onAuthStateChanged never fires (e.g. Firebase
    // init hangs in Android TWA/WebView), force loading=false after 8s to
    // prevent ANR / infinite spinner.
    const timeoutId = setTimeout(() => {
      if (!authResolved) {
        console.warn('[Auth] onAuthStateChanged timeout — forcing loading=false');
        setLoading(false);
      }
    }, 8000);

    const unsubscribe = onAuthStateChanged(getAuthInstance(), (fbUser) => {
      authResolved = true;
      clearTimeout(timeoutId);
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

  const signOut = async () => {
    await firebaseSignOut(getAuthInstance());
    setUser(null);
    setFirebaseUser(null);
    setSyncError(false);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, syncError, signIn, signUp, signInWithGoogle, signOut, refreshUser }}>
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

export async function getProviderMismatchMessage(email: string): Promise<ProviderMismatchResult> {
  try {
    const methods = await fetchSignInMethodsForEmail(getAuthInstance(), email);
    if (methods.includes('google.com')) {
      return { message: 'Este correo ya está vinculado a Google. Inicia sesión con Google.', provider: 'google' };
    }
    if (methods.includes('password')) {
      return { message: 'Este correo ya está registrado con email y contraseña. Usa ese método para iniciar sesión.', provider: 'password' };
    }
    return { message: 'Este correo ya está registrado con otro método de inicio de sesión. Usa el método original.', provider: null };
  } catch {
    return { message: 'Este correo ya está registrado con otro método de inicio de sesión. Usa el método original.', provider: null };
  }
}
