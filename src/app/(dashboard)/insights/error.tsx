'use client';

import { useEffect } from 'react';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { reportError } from '@/lib/observability';

// ═══════════════════════════════════════════
// Insights page error boundary
// ═══════════════════════════════════════════
//
// Catches unhandled errors in the insights
// page. Provides retry and fallback navigation.
// Reports errors to observability system.

export default function InsightsPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(
      'error_boundary',
      'error',
      error.message || 'Insights error boundary triggered',
      error.constructor?.name || 'Error',
    );
  }, [error]);

  const isNetworkError =
    error.message?.toLowerCase().includes('network') ||
    error.message?.toLowerCase().includes('fetch') ||
    error.message?.toLowerCase().includes('failed to fetch');

  return (
    <div className="max-w-5xl mx-auto min-h-[60dvh] flex items-center justify-center">
      <PremiumErrorState
        variant={isNetworkError ? 'network' : 'loading'}
        title="No se pudieron cargar las observaciones"
        subtitle="Tu actividad está guardada. Intenta recargar para ver tus datos."
        onRetry={reset}
        secondaryAction={{
          label: 'Volver al dashboard',
          href: '/dashboard',
        }}
        size="lg"
      />
    </div>
  );
}
