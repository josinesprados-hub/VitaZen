'use client';

import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════
// PremiumErrorState — Reusable error state
// ═══════════════════════════════════════════
//
// Consistent, premium-feeling error states
// across all VitaZen pages. Elegant, calm,
// never alarming. Uses gold/warm tones instead
// of harsh red to maintain the premium feel.
//
// Variants:
//   'network' — Connection lost, server unreachable
//   'loading' — Data failed to load
//   'session' — Auth/session expired or invalid
//   'generic' — Catch-all, something went wrong
//
// Usage:
//   <PremiumErrorState
//     variant="network"
//     onRetry={() => refetch()}
//   />
//
//   <PremiumErrorState
//     variant="loading"
//     title="No se pudieron cargar los datos"
//     onRetry={() => window.location.reload()}
//   />

import {
  WifiOff,
  RefreshCw,
  CloudOff,
  Shield,
  AlertCircle,
} from 'lucide-react';

// ─────────────────────────────────────────
// Variant config
// ─────────────────────────────────────────

const VARIANT_CONFIG = {
  network: {
    icon: WifiOff,
    iconClass: 'text-champagne/50',
    iconBg: 'bg-champagne/5 border border-champagne/10',
    title: 'Sin conexión',
    subtitle: 'No se pudo conectar con el servidor. Revisa tu conexión a internet.',
    retryLabel: 'Reintentar',
  },
  loading: {
    icon: CloudOff,
    iconClass: 'text-champagne/50',
    iconBg: 'bg-champagne/5 border border-champagne/10',
    title: 'No se pudieron cargar los datos',
    subtitle: 'Algo falló al obtener la información. Puedes intentarlo de nuevo.',
    retryLabel: 'Reintentar',
  },
  session: {
    icon: Shield,
    iconClass: 'text-champagne/50',
    iconBg: 'bg-champagne/5 border border-champagne/10',
    title: 'Sesión expirada',
    subtitle: 'Tu sesión ha caducado por seguridad. Inicia sesión de nuevo para continuar.',
    retryLabel: 'Iniciar sesión',
  },
  generic: {
    icon: AlertCircle,
    iconClass: 'text-champagne/50',
    iconBg: 'bg-champagne/5 border border-champagne/10',
    title: 'Algo ha ido mal',
    subtitle: 'Ha ocurrido un error inesperado. Puedes intentarlo de nuevo.',
    retryLabel: 'Reintentar',
  },
} as const;

type ErrorVariant = keyof typeof VARIANT_CONFIG;

// ─────────────────────────────────────────
// Props
// ─────────────────────────────────────────

interface PremiumErrorStateProps {
  /** Error variant — determines icon, default copy, and behavior */
  variant?: ErrorVariant;
  /** Override default title */
  title?: string;
  /** Override default subtitle */
  subtitle?: string;
  /** Retry button click handler — if provided, shows retry button */
  onRetry?: () => void;
  /** Override retry button label */
  retryLabel?: string;
  /** Show a secondary action (e.g. "Volver al dashboard") */
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Size variant: 'sm' for in-card, 'md' for section (default), 'lg' for full-page */
  size?: 'sm' | 'md' | 'lg';
  /** Additional className for outer container */
  className?: string;
}

// ─────────────────────────────────────────
// Component
// ─────────────────────────────────────────

export default function PremiumErrorState({
  variant = 'generic',
  title,
  subtitle,
  onRetry,
  retryLabel,
  secondaryAction,
  size = 'md',
  className,
}: PremiumErrorStateProps) {
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  const sizeConfig = {
    sm: {
      container: 'py-6',
      iconWrapper: 'w-11 h-11 rounded-xl',
      iconSize: 18,
      titleClass: 'text-sm',
      subtitleClass: 'text-xs',
    },
    md: {
      container: 'py-12',
      iconWrapper: 'w-14 h-14 rounded-2xl',
      iconSize: 22,
      titleClass: 'text-sm',
      subtitleClass: 'text-xs',
    },
    lg: {
      container: 'py-20',
      iconWrapper: 'w-16 h-16 rounded-2xl',
      iconSize: 26,
      titleClass: 'text-base',
      subtitleClass: 'text-sm',
    },
  }[size];

  return (
    <div className={cn('text-center error-state-enter', sizeConfig.container, className)}>
      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center mx-auto mb-5',
          sizeConfig.iconWrapper,
          config.iconBg,
        )}
      >
        <Icon size={sizeConfig.iconSize} className={config.iconClass} />
      </div>

      {/* Title */}
      <p className={cn('text-[#888] font-medium mb-1.5', sizeConfig.titleClass)}>
        {title || config.title}
      </p>

      {/* Subtitle */}
      <p className={cn('text-[#888] max-w-xs mx-auto leading-relaxed', sizeConfig.subtitleClass)}>
        {subtitle || config.subtitle}
      </p>

      {/* Actions */}
      {(onRetry || secondaryAction) && (
        <div className="flex items-center justify-center gap-3 mt-5">
          {/* Retry button */}
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 text-champagne text-xs font-medium
                         bg-champagne/5 border border-champagne/15 rounded-lg px-4 py-2
                         hover:bg-champagne/10 hover:border-champagne/25
                         transition-all duration-200 active:scale-[0.97] touch-press"
            >
              <RefreshCw size={12} />
              {retryLabel || config.retryLabel}
            </button>
          )}

          {/* Secondary action */}
          {secondaryAction && (
            secondaryAction.href ? (
              <a
                href={secondaryAction.href}
                className="text-[#888] text-xs hover:text-[#999] transition-colors"
              >
                {secondaryAction.label}
              </a>
            ) : (
              <button
                onClick={secondaryAction.onClick}
                className="text-[#888] text-xs hover:text-[#999] transition-colors"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
