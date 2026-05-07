'use client';

import PremiumErrorState from '@/components/ui/PremiumErrorState';

// ═══════════════════════════════════════════
// Mentor page error boundary
// ═══════════════════════════════════════════
//
// Catches unhandled errors in the mentor
// AI chat page. Provides retry and fallback
// navigation.

export default function MentorPageError({
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
    <div className="max-w-6xl mx-auto min-h-[60dvh] flex items-center justify-center">
      <PremiumErrorState
        variant={isNetworkError ? 'network' : 'loading'}
        title="El mentor no está disponible"
        subtitle="No se pudo conectar con el asistente. Tu historial está a salvo."
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
