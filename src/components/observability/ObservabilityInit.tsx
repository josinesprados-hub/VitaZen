'use client';

// ═══════════════════════════════════════════
// OBSERVABILITY INIT — VitaZen
// Client-side initialization of the observability system
// ═══════════════════════════════════════════
//
// This component is rendered once in the root layout.
// It initializes all observability systems on mount:
//   - Global error handlers
//   - Performance observers
//   - Hydration mismatch detection
//   - Visibility change handler
//
// It renders nothing visible — zero DOM footprint.

import { useEffect } from 'react';
import { initObservability } from '@/lib/observability';

export function ObservabilityInit() {
  useEffect(() => {
    const cleanup = initObservability();
    return cleanup;
  }, []);

  return null; // Invisible — zero DOM footprint
}
