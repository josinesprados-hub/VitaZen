'use client';

import PremiumErrorState from '@/components/ui/PremiumErrorState';

// ═══════════════════════════════════════════
// Onboarding page error boundary
// ═══════════════════════════════════════════
//
// Catches unhandled errors during onboarding.
// Provides retry and fallback to login.

export default function OnboardingPageError({
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

  const isSessionError =
    error.message?.toLowerCase().includes('unauthorized') ||
    error.message?.toLowerCase().includes('401') ||
    error.message?.toLowerCase().includes('session');

  const variant = isSessionError
    ? 'session'
    : isNetworkError
    ? 'network'
    : 'generic';

  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-5">
      <PremiumErrorState
        variant={variant}
        title="Error en la configuración"
        subtitle="No se pudo completar la configuración inicial. Puedes intentarlo de nuevo."
        onRetry={reset}
        secondaryAction={{
          label: 'Ir a iniciar sesión',
          href: '/login',
        }}
        size="lg"
      />
    </div>
  );
}
