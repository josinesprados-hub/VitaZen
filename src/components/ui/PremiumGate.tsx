'use client';

import Link from 'next/link';
import { Crown } from 'lucide-react';

// ─────────────────────────────────────────
// PremiumGate
// Wraps content with a partial blur + subtle
// gold overlay for FREE users. Premium sees
// content unmodified.
// ─────────────────────────────────────────

interface PremiumGateProps {
  isPremium: boolean;
  /** blur strength: 'light' = 4px, 'medium' = 8px (default) */
  intensity?: 'light' | 'medium';
  /** compact mode — smaller overlay text, for inline or small cards */
  compact?: boolean;
  /** custom label below the crown (default: "Premium") */
  label?: string;
  children: React.ReactNode;
}

export default function PremiumGate({
  isPremium,
  intensity = 'medium',
  compact = false,
  label = 'Premium',
  children,
}: PremiumGateProps) {
  if (isPremium) return <>{children}</>;

  const blurPx = intensity === 'light' ? 4 : 8;

  return (
    <div className="relative group/premium-gate">
      {/* Blurred content */}
      <div
        style={{ filter: `blur(${blurPx}px)` }}
        className="pointer-events-none select-none"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080808]/40 rounded-xl transition-colors duration-300 group-hover/premium-gate:bg-[#080808]/30">
        <div
          className={`flex flex-col items-center gap-1.5 ${
            compact ? 'scale-90' : ''
          }`}
        >
          <div
            className={`rounded-full bg-[#c8a55a]/10 border border-[#c8a55a]/20 flex items-center justify-center ${
              compact ? 'w-7 h-7' : 'w-9 h-9'
            }`}
          >
            <Crown
              size={compact ? 12 : 15}
              className="text-[#c8a55a]/70"
            />
          </div>
          <Link
            href="/pricing"
            className={`text-[#c8a55a]/80 hover:text-[#c8a55a] transition-colors flex items-center gap-1 ${
              compact ? 'text-[9px]' : 'text-[10px]'
            }`}
          >
            <Crown size={compact ? 8 : 9} />
            {label}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// PremiumInlineBadge
// Small inline pill that shows "FREE" limit
// or "Premium" badge — calm and unobtrusive.
// ─────────────────────────────────────────

interface PremiumInlineBadgeProps {
  isPremium: boolean;
  /** FREE label text, e.g. "7 días" or "3 insights" */
  freeLabel: string;
  /** Premium label text, e.g. "Ilimitado" */
  premiumLabel?: string;
}

export function PremiumInlineBadge({
  isPremium,
  freeLabel,
  premiumLabel = 'Ilimitado',
}: PremiumInlineBadgeProps) {
  if (isPremium) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#c8a55a]/70 bg-[#c8a55a]/5 border border-[#c8a55a]/10 px-2 py-0.5 rounded-full">
        <Crown size={8} />
        {premiumLabel}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-medium text-[#555] bg-[#111] border border-[#1a1a1a] px-2 py-0.5 rounded-full">
      {freeLabel}
    </span>
  );
}

// ─────────────────────────────────────────
// PremiumHistoryGate
// Shown at the bottom of history lists to
// indicate more content is available with
// Premium. Calm, not aggressive.
// ─────────────────────────────────────────

interface PremiumHistoryGateProps {
  isPremium: boolean;
  /** e.g. "historial completo" */
  label?: string;
}

export function PremiumHistoryGate({
  isPremium,
  label = 'historial completo',
}: PremiumHistoryGateProps) {
  if (isPremium) return null;

  return (
    <div className="flex items-center justify-center gap-2 py-4 mt-2 border-t border-[#1a1a1a]/60">
      <div className="flex items-center gap-1.5 text-[10px] text-[#555]">
        <Crown size={10} className="text-[#c8a55a]/40" />
        <span>
          {label} con{' '}
          <Link
            href="/pricing"
            className="text-[#c8a55a]/70 hover:text-[#c8a55a] transition-colors"
          >
            Premium
          </Link>
        </span>
      </div>
    </div>
  );
}
