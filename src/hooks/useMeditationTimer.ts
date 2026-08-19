// ═══════════════════════════════════════════════════════════════════
// useMeditationTimer — Custom hook for meditation sessions
// Provides: Wake Lock API (M-1), Drift-proof timer (M-2)
// ═══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Wake Lock API type definitions ───────────────────────────
// Use a minimal inline type instead of extending Navigator to avoid
// TS2430 conflicts with the built-in Navigator.wakeLock declaration.
interface WakeLockSentinel {
  type: 'screen';
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: string, listener: () => void): void;
}

function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (nav.wakeLock?.request) {
    return nav.wakeLock.request('screen');
  }
  return Promise.resolve(null);
}

export interface MeditationTimerState {
  seconds: number;
  isRunning: boolean;
  isPaused: boolean;
}

export interface MeditationTimerActions {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => number; // returns final elapsed seconds
  reset: () => void;
}

/**
 * useMeditationTimer
 *
 * M-1 (Wake Lock): Acquires a screen wake lock when the timer is running.
 *   Released on pause, stop, or component unmount.
 *   Gracefully handles browsers that don't support the Wake Lock API.
 *
 * M-2 (Timer Drift): Uses Date.now() as absolute time source instead of
 *   incrementing a counter with setInterval. The interval only triggers
 *   re-renders; the actual elapsed time is computed from the wall clock.
 *   This eliminates drift when the tab is backgrounded, loses focus, or
 *   the device enters power-saving mode.
 */
export function useMeditationTimer(): MeditationTimerState & MeditationTimerActions {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Refs for drift-proof timing
  const startedAtRef = useRef<number | null>(null);  // Date.now() when session started/resumed
  const pausedElapsedRef = useRef<number>(0);          // accumulated seconds before current run segment
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref for Wake Lock
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Compute elapsed seconds from wall clock
  const computeElapsed = useCallback((): number => {
    if (startedAtRef.current === null) return pausedElapsedRef.current;
    return pausedElapsedRef.current + Math.floor((Date.now() - startedAtRef.current) / 1000);
  }, []);

  // Release wake lock (idempotent)
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Wake lock release can fail if already released by the browser
      }
    }
    wakeLockRef.current = null;
  }, []);

  // Request wake lock
  const requestWakeLock = useCallback(async () => {
    try {
      const sentinel = await requestScreenWakeLock();
      if (sentinel) {
        wakeLockRef.current = sentinel;
        // If the browser releases the wake lock (e.g. user pressed power button),
        // clear our ref so we don't try to release it again
        sentinel.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // Wake Lock not supported or denied — fail silently, meditation still works
    }
  }, []);

  // Clear the render interval
  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Start the render interval that updates the displayed time
  const startTimerInterval = useCallback(() => {
    clearTimerInterval();
    intervalRef.current = setInterval(() => {
      setSeconds(computeElapsed());
    }, 250); // 250ms for smooth display updates, actual time from Date.now()
  }, [clearTimerInterval, computeElapsed]);

  // Start meditation timer
  const start = useCallback(() => {
    pausedElapsedRef.current = 0;
    startedAtRef.current = Date.now();
    setSeconds(0);
    setIsRunning(true);
    setIsPaused(false);
    startTimerInterval();
    requestWakeLock();
  }, [startTimerInterval, requestWakeLock]);

  // Pause
  const pause = useCallback(() => {
    // Save elapsed time before pausing
    pausedElapsedRef.current = computeElapsed();
    startedAtRef.current = null;
    setIsPaused(true);
    clearTimerInterval();
    releaseWakeLock();
  }, [computeElapsed, clearTimerInterval, releaseWakeLock]);

  // Resume
  const resume = useCallback(() => {
    startedAtRef.current = Date.now();
    setIsPaused(false);
    startTimerInterval();
    requestWakeLock();
  }, [startTimerInterval, requestWakeLock]);

  // Stop — returns final elapsed seconds
  const stop = useCallback((): number => {
    const finalSeconds = computeElapsed();
    startedAtRef.current = null;
    pausedElapsedRef.current = 0;
    setIsRunning(false);
    setIsPaused(false);
    setSeconds(0);
    clearTimerInterval();
    releaseWakeLock();
    return finalSeconds;
  }, [computeElapsed, clearTimerInterval, releaseWakeLock]);

  // Reset without returning value
  const reset = useCallback(() => {
    startedAtRef.current = null;
    pausedElapsedRef.current = 0;
    setIsRunning(false);
    setIsPaused(false);
    setSeconds(0);
    clearTimerInterval();
    releaseWakeLock();
  }, [clearTimerInterval, releaseWakeLock]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimerInterval();
      releaseWakeLock();
    };
  }, [clearTimerInterval, releaseWakeLock]);

  // Re-acquire wake lock if tab becomes visible while running
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && isRunning && !isPaused) {
        if (!wakeLockRef.current || wakeLockRef.current.released) {
          await requestWakeLock();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isRunning, isPaused, requestWakeLock]);

  return { seconds, isRunning, isPaused, start, pause, resume, stop, reset };
}