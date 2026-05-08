'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  onAuthStateChanged,
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

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
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: UserData | null;
  loading: boolean;
  syncError: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
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

  const syncUser = useCallback(async (fbUser: FirebaseUser) => {
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
      } else {
        console.error('[Auth] sync failed:', res.status);
        setSyncError(true);
      }
    } catch (error) {
      console.error('[Auth] sync error:', error);
      setSyncError(true);
    }
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
      const res = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSyncError(false);
      }
    } catch (error) {
      console.error('[Auth] refresh error:', error);
      setSyncError(true);
    }
  }, [firebaseUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
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

    return () => unsubscribe();
  }, [syncUser]);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
    // syncUser handled by onAuthStateChanged
  };

  const signUp = async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
    // syncUser handled by onAuthStateChanged
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // syncUser handled by onAuthStateChanged
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
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
    const methods = await fetchSignInMethodsForEmail(auth, email);
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
