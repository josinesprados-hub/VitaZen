'use client';

import { useEffect } from 'react';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { reportError } from '@/lib/observability';

// ═══════════════════════════════════════════
// Dashboard route group error boundary
// ═══════════════════════════════════════════
//
// Catches unhandled errors in any page within
// the (dashboard) route group. Shows a calm,
// premium error state with retry option.
// Reports errors to observability system.

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report error to observability
  useEffect(() => {
    const isNetworkError =
      error.message?.toLowerCase().includes('network') ||
      error.message?.toLowerCase().includes('fetch') ||
      error.message?.toLowerCase().includes('failed to fetch');

    const isSessionError =
      error.message?.toLowerCase().includes('unauthorized') ||
      error.message?.toLowerCase().includes('401') ||
      error.message?.toLowerCase().includes('session');

    reportError(
      'error_boundary',
      isSessionError ? 'warning' : 'error',
      error.message || 'Dashboard error boundary triggered',
      error.constructor?.name || 'Error',
    );
  }, [error]);

  // Determine variant based on error type
  const isNetworkError =
    error.message?.toLowerCase().includes('network') ||
    error.message?.toLowerCase().includes('fetch') ||
    error.message?.toLowerCase().includes('failed to fetch');

  const isSessionError =
    error.message?.toLowerCase().includes('unauthorized') ||
    error.message?.toLowerCase().includes('401') ||
    error.message?.toLowerCase().includes('session');

  const variant = isSessionError
    ? 'session'
    : isNetworkError
    ? 'network'
    : 'loading';

  return (
    <div className="min-h-[60dvh] flex items-center justify-center">
      <PremiumErrorState
        variant={variant}
        onRetry={reset}
        secondaryAction={{
          label: 'Volver al inicio',
          href: '/dashboard',
        }}
        size="lg"
      />
    </div>
  );
}
