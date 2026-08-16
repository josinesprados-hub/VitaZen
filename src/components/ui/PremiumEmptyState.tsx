'use client';

import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════
// PremiumEmptyState — Reusable empty state
// ═══════════════════════════════════════════
//
// Consistent, premium-feeling empty states
// across all VitaZen pages. Elegant, calm,
// with soft CTAs and breathable design.
//
// Usage:
//   <PremiumEmptyState
//     icon={Clock}
//     title="Aún no hay actividad"
//     subtitle="Comienza registrando tu primera actividad"
//     cta="Registrar actividad"
//     onCta={() => ...}
//   />

interface PremiumEmptyStateProps {
  /** Lucide icon component */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Main message — short, calm */
  title: string;
  /** Secondary guidance — soft, encouraging */
  subtitle?: string;
  /** CTA button label — optional, soft style */
  cta?: string;
  /** CTA click handler */
  onCta?: () => void;
  /** Size variant: 'sm' for in-card, 'md' for full-section (default), 'lg' for full-page */
  size?: 'sm' | 'md' | 'lg';
  /** Variant: 'default' uses neutral icon container, 'gold' uses gold-tinted icon container */
  variant?: 'default' | 'gold';
  /** Additional className for outer container */
  className?: string;
}

export default function PremiumEmptyState({
  icon: Icon,
  title,
  subtitle,
  cta,
  onCta,
  size = 'md',
  variant = 'default',
  className,
}: PremiumEmptyStateProps) {
  // Size-aware config
  const config = {
    sm: {
      container: 'py-8',
      iconWrapper: 'w-12 h-12 rounded-xl',
      iconSize: 20,
      iconClass: variant === 'gold' ? 'text-champagne/40' : 'text-[#999]',
      titleClass: 'text-sm',
      subtitleClass: 'text-xs',
    },
    md: {
      container: 'py-14',
      iconWrapper: 'w-14 h-14 rounded-2xl',
      iconSize: 24,
      iconClass: variant === 'gold' ? 'text-champagne/50' : 'text-[#888]',
      titleClass: 'text-sm',
      subtitleClass: 'text-xs',
    },
    lg: {
      container: 'py-20',
      iconWrapper: 'w-16 h-16 rounded-2xl',
      iconSize: 28,
      iconClass: variant === 'gold' ? 'text-champagne/50' : 'text-[#888]',
      titleClass: 'text-sm',
      subtitleClass: 'text-xs',
    },
  }[size];

  const iconBg = variant === 'gold'
    ? 'bg-champagne/5'
    : 'bg-[#0a0a0a] border border-[#1a1a1a]';

  return (
    <div className={cn('text-center empty-state-enter', config.container, className)}>
      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center mx-auto mb-4',
          config.iconWrapper,
          iconBg,
        )}
      >
        <Icon size={config.iconSize} className={config.iconClass} />
      </div>

      {/* Title */}
      <p className={cn('text-[#888] font-medium mb-1', config.titleClass)}>
        {title}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p className={cn('text-[#999] mt-1', config.subtitleClass)}>
          {subtitle}
        </p>
      )}

      {/* Soft CTA */}
      {cta && onCta && (
        <button
          onClick={onCta}
          className="mt-5 inline-flex items-center gap-2 text-champagne/70 text-xs font-medium
                     hover:text-champagne transition-colors duration-300 touch-press"
        >
          {cta}
        </button>
      )}
    </div>
  );
}
