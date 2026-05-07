'use client';

import PremiumErrorState from '@/components/ui/PremiumErrorState';

// ═══════════════════════════════════════════
// Insights page error boundary
// ═══════════════════════════════════════════
//
// Catches unhandled errors in the insights
// page. Provides retry and fallback navigation.

export default function InsightsPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isNetworkError =
    error.message?.toLowerCase().includes('network') ||
    error.message?.toLowerCase().includes('fetch') ||
    error.message?.toLowerCase().includes('failed to fetch');

  return (
    <div className="max-w-5xl mx-auto min-h-[60dvh] flex items-center justify-center">
      <PremiumErrorState
        variant={isNetworkError ? 'network' : 'loading'}
        title="No se pudieron cargar los insights"
        subtitle="Tu actividad está registrada. Intenta recargar para ver tus datos."
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
