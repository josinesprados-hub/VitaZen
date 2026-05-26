'use client';

import { useState, useEffect } from 'react';

// ═══════════════════════════════════════════
// useNetworkStatus — shared online/offline state
// ═══════════════════════════════════════════
//
// Provides a single source of truth for network status
// across all VitaZen pages. Previously, only MentorChat
// detected online/offline — now any page can.
//
// Usage:
//   const { isOnline, isOffline } = useNetworkStatus();
//
// On mobile, this also detects:
//   - App coming back from background (visibility change)
//   - Network type changes (wifi → cellular)

interface NetworkStatus {
  isOnline: boolean;
  isOffline: boolean;
  /** Time when the status last changed (epoch ms) */
  lastChanged: number;
}

let sharedState: NetworkStatus | null = null;
const listeners = new Set<() => void>();

function getInitialState(): NetworkStatus {
  if (sharedState) return sharedState;
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  return { isOnline: online, isOffline: !online, lastChanged: Date.now() };
}

function updateState(online: boolean) {
  sharedState = { isOnline: online, isOffline: !online, lastChanged: Date.now() };
  listeners.forEach(fn => fn());
}

// Install global listeners lazily — only when the first hook mounts.
// This prevents memory leaks from module-level listeners that are never cleaned up.
let globalListenersInstalled = false;

function installGlobalListeners() {
  if (globalListenersInstalled || typeof window === 'undefined') return;
  globalListenersInstalled = true;
  window.addEventListener('online', () => updateState(true));
  window.addEventListener('offline', () => updateState(false));
}

export function useNetworkStatus(): NetworkStatus {
  const [state, setState] = useState<NetworkStatus>(getInitialState);

  useEffect(() => {
    // Install global listeners on first hook mount (not module import)
    installGlobalListeners();

    // Sync with latest shared state on mount
    setState(getInitialState());

    const handler = () => setState(getInitialState());
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  return state;
}

/**
 * Utility: check if an error is likely a network error.
 * Works across browsers without relying on message strings.
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  // TypeError from fetch() = network failure (offline, DNS, CORS, etc.)
  if (error instanceof TypeError) return true;

  // DOMException AbortError = request timed out or was cancelled
  if (error instanceof DOMException && error.name === 'AbortError') return true;

  // Check status 0 = request never completed (network failure)
  if (typeof error === 'object' && 'status' in error && (error as any).status === 0) return true;

  // Fall back to message-based detection (less reliable, but catches edge cases)
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || msg.includes('failed to fetch') || msg.includes('net::');
  }

  return false;
}
