'use client';

import { useEffect } from 'react';
import PremiumErrorState from '@/components/ui/PremiumErrorState';
import { reportError } from '@/lib/observability';

// ═══════════════════════════════════════════
// Auth route group error boundary
// ═══════════════════════════════════════════
//
// Catches unhandled errors in any page within
// the (auth) route group (login, register,
// onboarding, etc). Shows calm error state.
// Reports errors to observability system.

export default function AuthError({
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
      error.message || 'Auth error boundary triggered',
      error.constructor?.name || 'Error',
    );
  }, [error]);

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
