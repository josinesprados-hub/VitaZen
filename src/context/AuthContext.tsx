'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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
}

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: UserData | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUser = async (fbUser: FirebaseUser) => {
    try {
      console.log('[AUTH DEBUG] syncUser - Firebase UID:', fbUser.uid, 'Email:', fbUser.email);
      const idToken = await fbUser.getIdToken();
      console.log('[AUTH DEBUG] getIdToken - Token length:', idToken?.length, 'Token prefix:', idToken?.substring(0, 20) + '...');
      console.log('[AUTH DEBUG] Llamando a /api/auth/sync...');
      const res = await fetch('/api/auth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      console.log('[AUTH DEBUG] /api/auth/sync respuesta - Status:', res.status, 'OK:', res.ok);

      if (res.ok) {
        const data = await res.json();
        console.log('[AUTH DEBUG] /api/auth/sync data:', JSON.stringify(data));
        setUser(data.user);
        console.log('[AUTH DEBUG] setUser ejecutado correctamente. User:', JSON.stringify(data.user));
      } else {
        const errorData = await res.json().catch(() => null);
        console.error('[AUTH DEBUG] /api/auth/sync error response:', res.status, errorData);
      }
    } catch (error) {
      console.error('[AUTH DEBUG] Error syncing user:', error);
    }
  };

  const refreshUser = async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/auth/session', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      console.log('[AUTH DEBUG] onAuthStateChanged - Firebase user:', fbUser ? `UID: ${fbUser.uid}, Email: ${fbUser.email}` : 'null');
      setFirebaseUser(fbUser);
      if (fbUser) {
        await syncUser(fbUser);
      } else {
        console.log('[AUTH DEBUG] onAuthStateChanged - No hay usuario Firebase, setUser(null)');
        setUser(null);
      }
      setLoading(false);
      console.log('[AUTH DEBUG] onAuthStateChanged - loading = false, user state:', fbUser ? 'autenticado' : 'no autenticado');
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    console.log('[AUTH DEBUG] signInWithEmailAndPassword - Intentando con email:', email);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.log('[AUTH DEBUG] signInWithEmailAndPassword - OK. UID:', credential.user.uid, 'Email:', credential.user.email);
    await syncUser(credential.user);
  };

  const signUp = async (email: string, password: string) => {
    console.log('[AUTH DEBUG] createUserWithEmailAndPassword - Intentando con email:', email);
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('[AUTH DEBUG] createUserWithEmailAndPassword - OK. UID:', credential.user.uid, 'Email:', credential.user.email);
    await syncUser(credential.user);
  };

  const signInWithGoogle = async () => {
    console.log('[AUTH DEBUG] signInWithPopup - Abriendo popup de Google...');
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);
    console.log('[AUTH DEBUG] signInWithPopup - OK. UID:', credential.user.uid, 'Email:', credential.user.email);
    await syncUser(credential.user);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, user, loading, signIn, signUp, signInWithGoogle, signOut, refreshUser }}>
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
