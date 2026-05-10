import { useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';

export function useApi() {
  const { firebaseUser, signOut } = useAuth();
  const isSigningOut = useRef(false);
  const signOutPromise = useRef<Promise<void> | null>(null);
  const last401Time = useRef(0);

  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    if (!firebaseUser) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const idToken = await firebaseUser.getIdToken();

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

      try {
        const freshToken = await firebaseUser.getIdToken(true);
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
  }, [firebaseUser, signOut]);

  return { apiFetch };
}
