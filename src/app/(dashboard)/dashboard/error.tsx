'use client';

import { useEffect } from 'react';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { isNetworkError } from '@/hooks/use-network-status';
import { reportError } from '@/lib/observability';

// ═══════════════════════════════════════════
// Dashboard page error boundary
// ═══════════════════════════════════════════
//
// Catches unhandled errors specifically in
// the dashboard page. Provides contextual
// retry and navigation options.
// Reports errors to observability system.

export default function DashboardPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report error to observability
  useEffect(() => {
    reportError(
      'error_boundary',
      'error',
      error.message || 'Dashboard page error boundary triggered',
      error.constructor?.name || 'Error',
    );
  }, [error]);

  const isNetError = isNetworkError(error);

  return (
    <div className="max-w-7xl mx-auto min-h-[60dvh] flex items-center justify-center">
      <PremiumErrorState
        variant={isNetError ? 'network' : 'loading'}
        title="No se pudo cargar el Inicio"
        subtitle="Tu progreso está seguro. Intenta recargar para volver a verlo."
        onRetry={reset}
        size="lg"
      />
    </div>
  );
}
