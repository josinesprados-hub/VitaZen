'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useApi } from '@/hooks/useApi';
import { Calendar, ArrowRight } from 'lucide-react';

// ─── Monthly Closure Prompt ───
// Appears subtly on the first days of a new month.
// No urgency. No badges. No "completa tu review".
// Just: "Cuando quieras, hay un momento esperándote."

export function MonthlyClosurePrompt() {
  const { user } = useAuth();
  const { apiFetch } = useApi();
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || dismissed) return;

    const checkClosure = async () => {
      try {
        // Only check in first 7 days of month
        const now = new Date();
        if (now.getDate() > 7) return;

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
  }, [user, dismissed, apiFetch]);

  if (!show || dismissed) return null;

  return (
    <div className="dash-section-enter">
      <Link
        href="/cierre-mensual"
        className="block py-3 hover:opacity-80 transition-all group touch-press"
      >
        <div className="flex items-center gap-3">
          <Calendar size={13} className="text-[#c8a55a]/25 group-hover:text-[#c8a55a]/50 transition-colors shrink-0" />
          <p className="text-[11px] text-[#555] group-hover:text-[#777] transition-colors flex-1">
            {message}
          </p>
        </div>
      </Link>
    </div>
  );
}
