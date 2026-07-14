'use client';

import Link from 'next/link';
import { Circle } from 'lucide-react';

// ─────────────────────────────────────────
// DepthGate (formerly PremiumGate)
//
// Not a paywall. Not a lock.
// A quiet suggestion that there's more here.
//
// Philosophy:
// - No blur. Blur says "I'm hiding something from you."
// - No Crown. Crown says "pay more."
// - No aggressive overlay. Overlays say "you can't have this."
//
// Instead: a gentle fade, a whisper, an invitation.
// The user should feel: "There's more here."
// NOT: "They're blocking this from me."
// ─────────────────────────────────────────

interface PremiumGateProps {
  isPremium: boolean;
  /** blur strength — KEPT FOR API COMPAT but ignored.
   *  DepthGate never blurs. */
  intensity?: 'light' | 'medium';
  /** compact mode — smaller hint text */
  compact?: boolean;
  /** custom label — ignored in favor of contemplative copy */
  label?: string;
  children: React.ReactNode;
}

export default function PremiumGate({
  isPremium,
  intensity: _intensity,
  compact = false,
  label,
  children,
}: PremiumGateProps) {
  if (isPremium) return <>{children}</>;

  const displayLabel = label || '';

  return (
    <div className="relative overflow-hidden group/depth-gate">
      {/* Content hidden — occupies layout space but invisible */}
      <div className="opacity-0 select-none pointer-events-none" aria-hidden="true">
        {children}
      </div>

      {/* Gentle depth overlay — gradient fade, not hard wall */}
      <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl depth-gate-overlay">
        <div
          className={`flex flex-col items-center gap-2.5 ${
            compact ? 'scale-90' : ''
          }`}
        >
          {/* Small gold dot — presence, not crown */}
          <Circle
            size={compact ? 4 : 5}
            className="text-champagne/40"
            fill="currentColor"
          />
          {displayLabel && (
            <p className={`text-[#444] text-center leading-snug ${
              compact ? 'text-[9px]' : 'text-[10px]'
            }`}>
              {displayLabel}
            </p>
          )}
          <Link
            href="/elite"
            className={`text-champagne/50 hover:text-champagne/80 transition-colors text-center leading-snug ${
              compact ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            Descubre más · Élite
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// DepthInlineBadge (formerly PremiumInlineBadge)
// Shows FREE context or depth indicator.
// Quiet, not promotional.
// ─────────────────────────────────────────

interface PremiumInlineBadgeProps {
  isPremium: boolean;
  /** FREE label text, e.g. "7 días" or "3 insights" */
  freeLabel: string;
  /** Premium label text — now more contemplative */
  premiumLabel?: string;
}

export function PremiumInlineBadge({
  isPremium,
  freeLabel,
  premiumLabel = 'Completo',
}: PremiumInlineBadgeProps) {
  if (isPremium) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-medium text-champagne/50 bg-champagne/5 border border-champagne/8 px-2 py-0.5 rounded-full">
        <Circle size={3} className="text-champagne/40" fill="currentColor" />
        {premiumLabel}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-medium text-[#555] px-2 py-0.5">
      {freeLabel}
    </span>
  );
}

// ─────────────────────────────────────────
// DepthHistoryGate (formerly PremiumHistoryGate)
// Shown at the bottom of truncated lists.
// A whisper, not a wall.
// ─────────────────────────────────────────

interface PremiumHistoryGateProps {
  isPremium: boolean;
  /** ignored — kept for API compat */
  label?: string;
}

export function PremiumHistoryGate({
  isPremium,
  label: _label,
}: PremiumHistoryGateProps) {
  if (isPremium) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-4 mt-2 border-t border-[#1a1a1a]/40">
      <div className="flex items-center gap-1.5 text-[10px] text-[#444]">
        <Circle size={3} className="text-champagne/25" fill="currentColor" />
        <span>
          Hay más aquí —{' '}
          <Link
            href="/elite"
            className="text-champagne/50 hover:text-champagne/80 transition-colors"
          >
            conocer Élite
          </Link>
        </span>
      </div>
    </div>
  );
}
