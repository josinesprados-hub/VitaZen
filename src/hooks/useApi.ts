import { useAuth } from '@/context/AuthContext';

export function useApi() {
  const { firebaseUser } = useAuth();

  const apiFetch = async (path: string, options?: RequestInit) => {
    const idToken = await firebaseUser?.getIdToken();
    
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
