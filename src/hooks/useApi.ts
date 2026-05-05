import { useAuth } from '@/context/AuthContext';

export function useApi() {
  const { firebaseUser } = useAuth();

  const apiFetch = async (path: string, options?: RequestInit) => {
    if (!firebaseUser) {
      console.error('[CRUD DEBUG] apiFetch called without firebaseUser - path:', path);
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

    return res;
  };

  return { apiFetch };
}
