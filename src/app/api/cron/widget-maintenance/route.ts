export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredSnapshots, batchRefreshExpiredSnapshots } from '@/lib/widgets';
import { startCacheCleanup } from '@/lib/widgets/cache';
import { trackCronFailure, trackBatchProcessingFailure } from '@/lib/observability/server-tracking';

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
  // ── Auth: verify cron secret ──
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ── 1. Start cache cleanup timer ──
    startCacheCleanup();

    // ── 2. Clean up expired snapshots ──
    const deletedCount = await cleanupExpiredSnapshots();

    // ── 3. Refresh stale snapshots (limited batch) ──
    const refreshResult = await batchRefreshExpiredSnapshots(50);

    // Track batch processing issues
    if (refreshResult.errors > 0) {
      trackBatchProcessingFailure('widget_refresh', refreshResult.errors, refreshResult.processed);
    }

    return NextResponse.json({
      success: true,
      cleanup: { deletedSnapshots: deletedCount },
      refresh: refreshResult,
    });
  } catch (error) {
    console.error('[WidgetCron] Maintenance error:', error);
    trackCronFailure('widget-maintenance', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
