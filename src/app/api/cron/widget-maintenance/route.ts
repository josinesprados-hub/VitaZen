export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSnapshots, batchRefreshExpiredSnapshots } from '@/lib/widgets';
import { startCacheCleanup } from '@/lib/widgets/cache';
import { trackCronFailure, trackCronSlowRun, trackBatchProcessingFailure } from '@/lib/observability/server-tracking';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// CRON: Widget Maintenance
// Cleans up expired snapshots + refreshes stale ones
// ═══════════════════════════════════════════
//
// Called periodically (e.g., every 6 hours) by Vercel Cron.
// Secured with CRON_SECRET to prevent unauthorized access.
//
// Operations:
//   1. Clean up expired snapshots from DB (prevent table bloat)
//   2. Refresh stale snapshots (keep data fresh for active users)
//   3. Start cache cleanup timer (if not already running)

export async function GET(request: NextRequest) {
  const start = Date.now();

  // ── Auth: verify cron secret ──
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    serverLog.warn('cron/widget-maintenance', 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  serverLog.info('cron/widget-maintenance', 'Triggered');

  try {
    // ── 1. Start cache cleanup timer ──
    startCacheCleanup();

    // ── 2. Clean up expired snapshots ──
    const deletedCount = await cleanupExpiredSnapshots();

    // ── 3. Refresh stale snapshots (limited batch) ──
    const refreshResult = await batchRefreshExpiredSnapshots(50);
    const durationMs = Date.now() - start;

    // Track batch processing issues
    if (refreshResult.errors > 0) {
      trackBatchProcessingFailure('widget_refresh', refreshResult.errors, refreshResult.processed);
    }

    serverLog.info('cron/widget-maintenance', 'Completed', {
      deletedSnapshots: deletedCount,
      processed: refreshResult.processed,
      errors: refreshResult.errors,
      durationMs,
    });

    trackCronSlowRun('widget-maintenance', durationMs);

    return NextResponse.json({
      success: true,
      cleanup: { deletedSnapshots: deletedCount },
      refresh: refreshResult,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    serverLog.error('cron/widget-maintenance', 'Fatal error', error, { durationMs });
    trackCronFailure('widget-maintenance', error, durationMs);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
