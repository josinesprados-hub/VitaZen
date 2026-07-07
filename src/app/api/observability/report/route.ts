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
// Reports are logged server-side using structured JSON via serverLog
// and can be filtered in Vercel with: vz_obs:true

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  BatchReportPayload,
  ErrorReport,
  PerformanceReport,
} from '@/lib/observability/types';
import { serverLog } from '@/lib/observability/server-logger';
import { getAuthUserBasic } from '@/lib/auth';

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
  // Use serverLog for structured, consistent, filterable output
  const level = report.severity === 'critical' || report.severity === 'error' ? 'error' : 'warn';
  if (level === 'error') {
    serverLog.error(
      `client/${report.category}`,
      `Client error: ${report.errorType}`,
      undefined,
      {
        category: report.category,
        severity: report.severity,
        errorType: report.errorType,
        route: report.route,
        widgetType: report.widgetType,
        messageHash: report.messageHash,
        clientTs: report.ts,
      },
    );
  } else {
    serverLog.warn(
      `client/${report.category}`,
      `Client warning: ${report.errorType}`,
      {
        category: report.category,
        severity: report.severity,
        errorType: report.errorType,
        route: report.route,
        messageHash: report.messageHash,
        clientTs: report.ts,
      },
    );
  }
}

function processPerformanceReport(report: PerformanceReport): void {
  serverLog.info(
    `client/perf/${report.type}`,
    `Client perf: ${report.type}`,
    {
      perfType: report.type,
      durationMs: report.durationMs,
      route: report.route,
      component: report.component,
      memory: report.memory ? {
        usedMB: Math.round((report.memory.usedJSHeapSize || 0) / 1024 / 1024),
        totalMB: Math.round((report.memory.totalJSHeapSize || 0) / 1024 / 1024),
        limitMB: Math.round((report.memory.jsHeapSizeLimit || 0) / 1024 / 1024),
      } : undefined,
      clientTs: report.ts,
    },
  );
}

// ─── POST Handler ───────────────────────────

export async function POST(request: NextRequest) {
  try {
    // GLOBAL-12 FIX: Require authentication. Previously, the endpoint accepted
    // unauthenticated POSTs — any internet user could spam fake error reports.
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ received: false, error: 'Unauthorized' }, { status: 401 });
    }
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ received: false, error: 'Unauthorized' }, { status: 401 });
    }

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
      serverLog.info(
        'client/session',
        'Client session report',
        {
          sessionId: body.sessionId,
          deviceClass: body.deviceClass,
          connectionType: body.connectionType,
          errorCount: body.errors?.length || 0,
          perfCount: body.performance?.length || 0,
        },
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // Observability endpoint must never break the app
    serverLog.error('observability/report', 'Report processing error', error);
    return NextResponse.json(
      { received: false },
      { status: 500 },
    );
  }
}
