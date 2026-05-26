import { useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { User as FirebaseUser } from 'firebase/auth';

export function useApi() {
  const { firebaseUser, signOut } = useAuth();
  const isSigningOut = useRef(false);
  const signOutPromise = useRef<Promise<void> | null>(null);
  const last401Time = useRef(0);

  // Keep a live ref to firebaseUser so the fetch callback always sees
  // the current value — even if firebaseUser changes between render
  // and the async fetch completing (e.g. user signs out in another tab).
  const firebaseUserRef = useRef<FirebaseUser | null>(firebaseUser);
  firebaseUserRef.current = firebaseUser;

  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    // Read from ref — always current, never stale
    const currentUser = firebaseUserRef.current;

    if (!currentUser) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    let idToken: string;
    try {
      idToken = await currentUser.getIdToken();
    } catch {
      // Token retrieval failed — user may have been signed out
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string>),
    };

    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const res = await fetch(path, {
      ...options,
      headers,
    });

    // If token is expired/invalid, try refreshing once before signing out
    if (res.status === 401 && !isSigningOut.current) {
      // Cooldown: if we got a 401 in the last 5 seconds, don't retry — likely the same issue
      const now = Date.now();
      if (now - last401Time.current < 5000) {
        return res;
      }
      last401Time.current = now;

      // Re-read from ref — user may have signed out while the fetch was in flight
      const refreshUser = firebaseUserRef.current;
      if (!refreshUser) {
        return res;
      }

      try {
        const freshToken = await refreshUser.getIdToken(true);
        if (freshToken) {
          const retryHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options?.headers as Record<string, string>),
            Authorization: `Bearer ${freshToken}`,
          };
          const retryRes = await fetch(path, { ...options, headers: retryHeaders });
          if (retryRes.status !== 401) {
            return retryRes;
          }
        }
      } catch {
        // Token refresh failed, proceed to sign out
      }

      // Still 401 after refresh — sign out to force re-authentication
      // Use promise lock to prevent concurrent signOut calls
      if (!signOutPromise.current) {
        isSigningOut.current = true;
        signOutPromise.current = signOut().finally(() => {
          isSigningOut.current = false;
          // Keep the promise for a bit to prevent re-entry
          setTimeout(() => { signOutPromise.current = null; }, 2000);
        });
      }
      await signOutPromise.current;
    }

    return res;
  }, [signOut]); // Removed firebaseUser from deps — we use the ref instead

  return { apiFetch };
}
