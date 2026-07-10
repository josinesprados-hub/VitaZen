'use client';

// ═══════════════════════════════════════════
// ENHANCED ERROR BOUNDARY — VitaZen
// Reports caught errors to observability
// ═══════════════════════════════════════════
//
// Drop-in replacement for Next.js error boundaries that:
//   1. Reports the error to our observability system
//   2. Preserves the premium UX (calm error state)
//   3. Adds error digest for tracking
//   4. Detects repeated errors (possible infinite loops)
//
// This is a CLIENT component — error boundaries
// must be client components in Next.js App Router.

import React from 'react';
import { reportError } from './logger';
import { ErrorCategory, Severity } from './types';

// ─── Repeated Error Detection ───────────────
//
// Track error counts per route to detect loops.
// If the same route errors 5+ times in a minute,
// something is very wrong.

const routeErrorCounts = new Map<string, { count: number; firstSeen: number }>();
const ERROR_LOOP_THRESHOLD = 5;
const ERROR_LOOP_WINDOW_MS = 60_000;

function detectErrorLoop(route: string): boolean {
  const now = Date.now();
  const existing = routeErrorCounts.get(route);

  if (!existing || (now - existing.firstSeen) > ERROR_LOOP_WINDOW_MS) {
    routeErrorCounts.set(route, { count: 1, firstSeen: now });
    return false;
  }

  existing.count++;
  if (existing.count >= ERROR_LOOP_THRESHOLD) {
    return true; // Error loop detected
  }

  return false;
}

// ─── Error Boundary Component ───────────────

interface ObservantErrorBoundaryProps {
  children: React.ReactNode;
  /** Which error category to report as */
  category?: ErrorCategory;
  /** Severity of the error */
  severity?: Severity;
  /** Fallback component to render on error */
  fallback: React.ReactNode;
  /** Called when an error is caught (for custom handling) */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ObservantErrorBoundaryState {
  hasError: boolean;
  errorCount: number;
}

export class ObservantErrorBoundary extends React.Component<
  ObservantErrorBoundaryProps,
  ObservantErrorBoundaryState
> {
  private resetTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ObservantErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorCount: 0 };
  }

  static getDerivedStateFromError(): ObservantErrorBoundaryState {
    return { hasError: true, errorCount: 0 };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const route = typeof window !== 'undefined' ? window.location.pathname : 'unknown';
    const category = this.props.category || 'error_boundary';
    const severity = this.props.severity || 'error';

    // Report to observability
    reportError(
      category,
      severity,
      error.message || 'Unknown boundary error',
      error.constructor.name || 'Error',
      { route },
    );

    // Detect error loops
    const isLoop = detectErrorLoop(route);
    if (isLoop) {
      reportError(
        'error_boundary',
        'critical',
        `Error loop detected on ${route} — possible infinite render loop`,
        'ErrorLoop',
        { route },
      );
    }

    // Increment error count
    this.setState(prev => ({ errorCount: prev.errorCount + 1 }));

    // Call custom handler if provided
    this.props.onError?.(error, errorInfo);

    // Auto-reset after 5 seconds to allow retry
    // (But not if we're in an error loop)
    if (!isLoop && this.state.errorCount < 3) {
      this.resetTimeoutId = setTimeout(() => {
        this.setState({ hasError: false, errorCount: 0 });
      }, 5000);
    }
  }

  componentWillUnmount(): void {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// ─── Convenience Wrapper ────────────────────
//
// A simpler wrapper for wrapping specific components
// (like widgets) with error boundaries.

interface WidgetErrorBoundaryProps {
  children: React.ReactNode;
  /** Widget type for tracking */
  widgetType: string;
  /** Fallback to render on error */
  fallback?: React.ReactNode;
}

/**
 * Error boundary specifically for widget components.
 * Reports errors with widget-specific context.
 */
export function WidgetErrorBoundary({ children, widgetType, fallback }: WidgetErrorBoundaryProps) {
  return (
    <ObservantErrorBoundary
      category="widget_render"
      severity="warning"
      fallback={fallback || <div className="hidden" aria-hidden="true" />}
    >
      {children}
    </ObservantErrorBoundary>
  );
}

/**
 * Error boundary for notification components.
 * Reports errors with notification-specific context.
 */
export function NotificationErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ObservantErrorBoundary
      category="push_notification"
      severity="warning"
      fallback={<div className="hidden" aria-hidden="true" />}
    >
      {children}
    </ObservantErrorBoundary>
  );
}
