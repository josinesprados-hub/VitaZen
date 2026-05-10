// ═══════════════════════════════════════════
// OBSERVABILITY REPORT ENDPOINT — VitaZen
// Receives batched error & performance reports
// ═══════════════════════════════════════════
//
// This endpoint is designed to be:
//   - Ultra lightweight (no DB writes for most reports)
//   - Rate-limited (max 1 report per session per 30s)
//   - Privacy-safe (no PII stored)
//   - Non-blocking (fire-and-forget on client, minimal server work)
//
// The endpoint accepts both:
//   - POST with JSON body (fetch fallback)
//   - POST with Blob body (sendBeacon)
//
// Reports are logged server-side (structured JSON logs)
// and can be forwarded to an external monitoring service
// (Sentry, Datadog, etc.) in production.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  BatchReportPayload,
  ErrorReport,
  PerformanceReport,
} from '@/lib/observability/types';

// ─── Rate Limiting (in-memory) ──────────────
//
// Max 1 report per session per 30 seconds.
// This prevents a broken client from flooding the server.

const lastReportPerSession = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 30_000;
const MAX_SESSIONS = 5000;

function isRateLimited(sessionId: string): boolean {
  const now = Date.now();
  const lastTime = lastReportPerSession.get(sessionId);

  if (lastTime && (now - lastTime) < RATE_LIMIT_WINDOW_MS) {
    return true;
  }

  lastReportPerSession.set(sessionId, now);

  // Prune old sessions periodically
  if (lastReportPerSession.size > MAX_SESSIONS) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS * 2;
    for (const [key, ts] of lastReportPerSession.entries()) {
      if (ts < cutoff) lastReportPerSession.delete(key);
    }
  }

  return false;
}

// ─── Report Processing ──────────────────────

function processErrorReport(report: ErrorReport): void {
  // Structured log for server-side observability
  // In production, this could forward to Sentry/Datadog
  console.info(JSON.stringify({
    vz_obs: true,
    type: 'error',
    category: report.category,
    severity: report.severity,
    errorType: report.errorType,
    route: report.route,
    widgetType: report.widgetType,
    messageHash: report.messageHash,
    ts: report.ts,
  }));
}

function processPerformanceReport(report: PerformanceReport): void {
  // Structured log for performance metrics
  console.info(JSON.stringify({
    vz_obs: true,
    type: 'performance',
    perfType: report.type,
    durationMs: report.durationMs,
    route: report.route,
    component: report.component,
    memory: report.memory ? {
      usedMB: Math.round((report.memory.usedJSHeapSize || 0) / 1024 / 1024),
      totalMB: Math.round((report.memory.totalJSHeapSize || 0) / 1024 / 1024),
      limitMB: Math.round((report.memory.jsHeapSizeLimit || 0) / 1024 / 1024),
    } : undefined,
    ts: report.ts,
  }));
}

// ─── POST Handler ───────────────────────────

export async function POST(request: NextRequest) {
  try {
    // ── Parse body ──
    let body: BatchReportPayload;

    try {
      const text = await request.text();
      body = JSON.parse(text) as BatchReportPayload;
    } catch {
      return NextResponse.json(
        { received: false, error: 'Invalid JSON' },
        { status: 400 },
      );
    }

    // ── Validate ──
    if (!body.sessionId) {
      return NextResponse.json(
        { received: false, error: 'Missing sessionId' },
        { status: 400 },
      );
    }

    // ── Rate limit ──
    if (isRateLimited(body.sessionId)) {
      return NextResponse.json(
        { received: true, throttled: true },
        { status: 200 }, // Still 200 — client shouldn't retry
      );
    }

    // ── Process reports ──
    if (body.errors && Array.isArray(body.errors)) {
      for (const report of body.errors) {
        processErrorReport(report);
      }
    }

    if (body.performance && Array.isArray(body.performance)) {
      for (const report of body.performance) {
        processPerformanceReport(report);
      }
    }

    // ── Log session info ──
    if (body.deviceClass || body.connectionType) {
      console.info(JSON.stringify({
        vz_obs: true,
        type: 'session_info',
        sessionId: body.sessionId,
        deviceClass: body.deviceClass,
        connectionType: body.connectionType,
        errorCount: body.errors?.length || 0,
        perfCount: body.performance?.length || 0,
      }));
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // Observability endpoint must never break the app
    console.error('[Observability] Report processing error:', error);
    return NextResponse.json(
      { received: false },
      { status: 500 },
    );
  }
}
