'use client';

import { ReactNode } from 'react';
import { usePrivacy } from '@/hooks/usePrivacy';
import { Shield } from 'lucide-react';

// ─────────────────────────────────────────
// PrivacyMask — Centralized visual privacy wrapper
//
// Philosophy:
// - Not a wall. Not a paywall. Not "you can't see this."
// - A calm, intentional veil over personal metrics.
// - The user chose this. It should feel like their choice.
//
// Design:
// - Gentle frosted blur — shapes visible, numbers hidden
// - user-select: none — prevents accidental copy
// - Small shield indicator — quiet, not loud
// - Smooth transition — privacy feels calm, not sudden
//
// Usage:
//   <PrivacyMask>
//     <ScoreRing score={78} />
//     <StreakDisplay days={12} />
//   </PrivacyMask>
//
// When privacyStatsVisible = true: children render normally
// When privacyStatsVisible = false: children are gently masked
// ─────────────────────────────────────────

interface PrivacyMaskProps {
  children: ReactNode;
  /** Override the hook — useful for screenshot mode */
  forceVisible?: boolean;
  /** Compact mode — smaller shield indicator */
  compact?: boolean;
}

export default function PrivacyMask({
  children,
  forceVisible = false,
  compact = false,
}: PrivacyMaskProps) {
  const { isPrivate } = usePrivacy();

  // If user chose to show stats, or caller forces visibility, render normally
  if (!isPrivate || forceVisible) {
    return <>{children}</>;
  }

  return (
    <div className="relative group/privacy">
      {/* Content — gently blurred, still structurally present */}
      <div
        className="transition-[filter] duration-500 ease-out select-none"
        style={{ filter: 'blur(6px)' }}
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Privacy indicator — calm, not alarming */}
      <div
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
          compact ? 'scale-90' : ''
        }`}
      >
        <div className="flex flex-col items-center gap-1.5 opacity-40 group-hover/privacy:opacity-60 transition-opacity duration-300">
          <Shield
            size={compact ? 10 : 12}
            className="text-champagne/50"
          />
          <span
            className="text-[8px] sm:text-[9px] text-champagne/40 tracking-wider uppercase font-medium"
          >
            Privado
          </span>
        </div>
      </div>
    </div>
  );
}
