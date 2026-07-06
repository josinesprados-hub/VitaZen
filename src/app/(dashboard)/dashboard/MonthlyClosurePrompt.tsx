'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Calendar, X } from 'lucide-react';

// ─── Monthly Closure Prompt ───
// Appears subtly on the first days of a new month.
// No urgency. No badges. No "completa tu review".
// Just: "Cuando quieras, hay un momento esperándote."
//
// DASH-18/29: The prompt can now be dismissed with a discreet "Ahora no"
// button. The dismissal is persisted in localStorage scoped to the current
// month key (YYYY-MM). When a new month begins, the dismissal expires and
// the prompt can appear again (if the closure period is still active).

const DISMISS_KEY_PREFIX = 'vz_monthly_closure_dismissed_';

/** Returns the current month key (YYYY-MM) in Europe/Madrid timezone. */
function getCurrentMonthKey(): string {
  const madridStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  return madridStr.split(' ')[0].slice(0, 7); // YYYY-MM
}

/** Check if the user dismissed the prompt for the current month. */
function isDismissedThisMonth(): boolean {
  try {
    const key = DISMISS_KEY_PREFIX + getCurrentMonthKey();
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

/** Persist dismissal for the current month. */
function dismissThisMonth(): void {
  try {
    const key = DISMISS_KEY_PREFIX + getCurrentMonthKey();
    localStorage.setItem(key, '1');
  } catch {
    // localStorage unavailable — graceful, dismissal is session-only
  }
}

export function MonthlyClosurePrompt() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;

    // DASH-18/29: Check localStorage dismissal (scoped to current month)
    if (isDismissedThisMonth()) {
      setDismissed(true);
      return;
    }

    const checkClosure = async () => {
      try {
        // DASH-3: Use Madrid timezone for the day-of-month check, not browser-local.
        // The server's isClosurePeriod() uses Madrid time, so the client gate
        // must match to avoid premature hiding for traveling users.
        const madridStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
        const madridDay = parseInt(madridStr.split('-')[2], 10); // day-of-month
        if (madridDay > 7) return;

        const res = await apiFetch('/api/monthly-closure');
        if (res.ok) {
          const data = await res.json();
          // Show only if: closure period AND user hasn't reflected yet
          if (data.isClosurePeriod && !data.closure?.reflectedAt) {
            const { getEntryPrompt } = await import('@/lib/monthly-closure/copy');
            setMessage(getEntryPrompt(data.month));
            setShow(true);
          }
        }
      } catch {
        // Silent — never push
      }
    };

    checkClosure();
  }, [user, apiFetch]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dismissThisMonth();
    setDismissed(true);
    setShow(false);
  };

  if (!show || dismissed) return null;

  return (
    <div className="dash-section-enter">
      <Link
        href="/cierre-mensual"
        className="block py-3 hover:opacity-80 transition-all group touch-press"
      >
        <div className="flex items-center gap-3">
          <Calendar size={13} className="text-champagne/25 group-hover:text-champagne/50 transition-colors shrink-0" />
          <p className="text-[11px] text-[#555] group-hover:text-[#777] transition-colors flex-1">
            {message}
          </p>
          {/* DASH-18/29: Discreet dismiss button — persists until next month */}
          <button
            onClick={handleDismiss}
            className="text-[10px] text-[#333] hover:text-[#555] transition-colors shrink-0 ml-2"
            aria-label="Ahora no"
          >
            <X size={11} />
          </button>
        </div>
      </Link>
    </div>
  );
}
