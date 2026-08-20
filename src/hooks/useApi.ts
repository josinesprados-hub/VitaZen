import { useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { User as FirebaseUser } from 'firebase/auth';
import { reportError } from '@/lib/observability';

// ═══════════════════════════════════════════
// useApi — Network-resilient fetch wrapper
// ═══════════════════════════════════════════
//
// Hardening applied (Audit #4):
//   1. 15s default timeout via AbortController — no more hanging fetches
//   2. Automatic retry with backoff for transient failures (5xx, network errors)
//   3. Request deduplication — same path + method reuses in-flight promise
//   4. 401 handling with token refresh (existing, preserved)
//
// Observability (Audit #6):
//   5. Retry tracking — reports when a retry happens, so we can detect
//      server-side issues patterns (frequent retries = something's wrong)
//
// Retry strategy:
//   - Only retries on: 5xx status, network errors (TypeError), AbortError from timeout
//   - Does NOT retry on: 4xx (client errors), AbortError from caller signal
//   - Max 1 retry with 1.5s delay — keeps it simple, avoids retry storms
//   - Cold Neon starts: 15s timeout gives enough room for first request;
//     retry catches the case where cold start causes a 503

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_500;
const RETRY_STATUS_CODES = new Set([502, 503, 504, 520, 521, 522, 524]);

// ─── Retry tracking ─────────────────────────
// Track how often retries happen per path.
// If a path retries frequently, the server has issues.
// Reports to observability (dedup + rate-limited as usual).

const retryCounts = new Map<string, { count: number; firstSeen: number }>();
const RETRY_REPORT_WINDOW_MS = 60_000;

function trackRetry(path: string, reason: string): void {
  const now = Date.now();
  const existing = retryCounts.get(path);

  if (!existing || (now - existing.firstSeen) > RETRY_REPORT_WINDOW_MS) {
    retryCounts.set(path, { count: 1, firstSeen: now });
    return;
  }

  existing.count++;

  // Report when a path retries 3+ times within the window
  // (this means at least 3 different requests to the same path
  //  needed a retry — indicates a server-side issue)
  if (existing.count === 3) {
    reportError(
      'network_failure',
      'warning',
      `Frequent retries on ${path}: ${reason}`,
      'RetryStorm',
      { route: path },
    );
  }
}

// ─── Request deduplication ──────────────────
// Prevents duplicate concurrent requests to the same path.
// Key = `${method}:${path}`, Value = in-flight promise.
const inFlightRequests = new Map<string, Promise<Response>>();

function dedupeKey(path: string, options?: RequestInit): string {
  const method = (options?.method || 'GET').toUpperCase();
  // Don't dedupe mutations — they must always execute
  if (method !== 'GET') return '';
  return `GET:${path}`;
}

function isRetryableError(error: unknown): boolean {
  // Network error (fetch itself threw — offline, DNS, CORS, etc.)
  if (error instanceof TypeError) return true;
  // Timeout abort — our own AbortController timed out, not caller's
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return false;
}

function isRetryableStatus(status: number): boolean {
  return RETRY_STATUS_CODES.has(status);
}

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

    // ─── Deduplication: reuse in-flight GET requests ───
    const dedupe = dedupeKey(path, options);
    if (dedupe) {
      const existing = inFlightRequests.get(dedupe);
      if (existing) return existing;
    }

    // ─── Build fetch with timeout ───
    const callerSignal = options?.signal;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT_MS);

    // Combine caller signal + our timeout signal
    // If either aborts, the fetch aborts
    let combinedSignal: AbortSignal = timeoutController.signal;
    if (callerSignal) {
      // If caller already aborted, skip the fetch entirely
      if (callerSignal.aborted) {
        clearTimeout(timeoutId);
        return new Response(JSON.stringify({ error: 'Solicitud cancelada' }), { status: 499, headers: { 'Content-Type': 'application/json' } });
      }
      // Listen for caller abort and forward to our controller
      callerSignal.addEventListener('abort', () => timeoutController.abort(), { once: true });
    }

    const fetchOptions: RequestInit = {
      ...options,
      headers,
      signal: combinedSignal,
    };

    const attemptFetch = async (): Promise<Response> => {
      try {
        const res = await fetch(path, fetchOptions);
        clearTimeout(timeoutId);
        return res;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };

    const executeWithRetry = async (): Promise<Response> => {
      // GLOBAL-5 FIX: Only retry GET requests. POST/PUT/PATCH/DELETE are
      // non-idempotent — retrying them can create duplicate records (e.g.,
      // duplicate journal entries, meditation sessions, finance logs).
      // GET requests are safe to retry because they don't mutate state.
      const httpMethod = (options?.method || 'GET').toUpperCase();
      const isSafeToRetry = httpMethod === 'GET';

      try {
        const res = await attemptFetch();

        // ─── Retry on transient server errors (GET only) ───
        if (isSafeToRetry && isRetryableStatus(res.status)) {
          trackRetry(path, `${res.status}`);

          // Wait and retry once
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          // Refresh token before retry in case it expired during the wait
          const retryUser = firebaseUserRef.current;
          if (retryUser) {
            try {
              const freshToken = await retryUser.getIdToken(true);
              headers['Authorization'] = `Bearer ${freshToken}`;
            } catch {
              // Token refresh failed — use original token
            }
          }
          const retryRes = await fetch(path, { ...fetchOptions, headers });
          return retryRes;
        }

        return res;
      } catch (error) {
        // ─── Retry on network errors / timeout ───
        // But NOT if the caller explicitly aborted (e.g. navigation away)
        if (callerSignal?.aborted) {
          return new Response(JSON.stringify({ error: 'Solicitud cancelada' }), { status: 499, headers: { 'Content-Type': 'application/json' } });
        }

        if (isSafeToRetry && isRetryableError(error)) {
          trackRetry(path, error instanceof DOMException ? 'timeout' : 'network_error');

          // Wait and retry once
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          const retryUser = firebaseUserRef.current;
          if (retryUser) {
            try {
              const freshToken = await retryUser.getIdToken(true);
              headers['Authorization'] = `Bearer ${freshToken}`;
            } catch {
              // Token refresh failed
            }
          }

          // Create a new timeout for the retry
          const retryTimeoutController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryTimeoutController.abort(), DEFAULT_TIMEOUT_MS);

          try {
            const retryRes = await fetch(path, {
              ...fetchOptions,
              headers,
              signal: retryTimeoutController.signal,
            });
            clearTimeout(retryTimeoutId);
            return retryRes;
          } catch (retryError) {
            clearTimeout(retryTimeoutId);
            // Second failure — return a synthetic network error response
            return new Response(JSON.stringify({ error: 'Sin conexión' }), { status: 0, headers: { 'Content-Type': 'application/json' } });
          }
        }

        // Non-retryable error (e.g. caller abort) — return error response
        return new Response(JSON.stringify({ error: 'Error en la solicitud' }), { status: 0, headers: { 'Content-Type': 'application/json' } });
      }
    };

    // ─── Execute with dedup ───
    const fetchPromise = executeWithRetry();

    if (dedupe) {
      inFlightRequests.set(dedupe, fetchPromise);
      fetchPromise.finally(() => inFlightRequests.delete(dedupe));
    }

    let res: Response;
    try {
      res = await fetchPromise;
    } catch (fetchErr) {
      // Should not happen — executeWithRetry always returns a Response
      return new Response(JSON.stringify({ error: 'Error inesperado' }), { status: 0, headers: { 'Content-Type': 'application/json' } });
    }

    // ─── 401 handling (preserved from original) ───
    if (res.status === 401 && !isSigningOut.current) {
      // Cooldown: if we got a 401 in the last 5 seconds, don't retry
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
          // F8.4-04 FIX: Add timeout to 401 retry fetch to prevent infinite hang
          // if the auth server or API destination is down.
          const retryAbortController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryAbortController.abort(), DEFAULT_TIMEOUT_MS);
          try {
            const retryRes = await fetch(path, { ...options, headers: retryHeaders, signal: retryAbortController.signal });
            clearTimeout(retryTimeoutId);
            if (retryRes.status !== 401) {
              return retryRes;
            }
          } catch (retryErr) {
            clearTimeout(retryTimeoutId);
            // Timeout or network error on retry — proceed to sign out
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
          setTimeout(() => { signOutPromise.current = null; }, 2000);
        });
      }
      await signOutPromise.current;
    }

    return res;
  }, [signOut]);

  return { apiFetch };
}
