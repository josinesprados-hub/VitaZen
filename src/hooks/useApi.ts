import { useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';

export function useApi() {
  const { firebaseUser, signOut } = useAuth();
  const isSigningOut = useRef(false);

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
      isSigningOut.current = true;
      try {
        await signOut();
      } finally {
        isSigningOut.current = false;
      }
    }

    return res;
  }, [firebaseUser, signOut]);

  return { apiFetch };
}
