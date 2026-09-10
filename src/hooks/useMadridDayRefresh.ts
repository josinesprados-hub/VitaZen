'use client';

import { useEffect, useRef } from 'react';
import { watchMadridDay } from '@/lib/madrid-day-watcher';

/**
 * N-6: run `onDayChange` whenever the Madrid calendar day changes while
 * this component stays mounted — at the exact Madrid midnight (DST-exact,
 * computed via startOfNextDayMadrid, never "now + 24h") and whenever the
 * page becomes visible with a stale day key (background tab / PWA resume).
 *
 * Use it for day-scoped data only (today's check-in, daily challenge,
 * streaks, daily progress). Do NOT attach it to pages whose data is not
 * day-scoped — the callback should refetch, nothing more.
 *
 * The callback identity may change on every render (inline closures are
 * fine): it is kept in a ref, so the watcher is created once per mount and
 * always invokes the latest callback.
 */
export function useMadridDayRefresh(onDayChange: () => void): void {
  const callbackRef = useRef(onDayChange);
  callbackRef.current = onDayChange;

  useEffect(() => {
    const watcher = watchMadridDay(() => callbackRef.current());
    return () => watcher.stop();
  }, []);
}
