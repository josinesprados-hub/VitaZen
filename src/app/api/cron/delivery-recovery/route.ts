export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout

import { NextRequest, NextResponse } from 'next/server';
import { processDeferredNotifications } from '@/lib/notifications/delivery-recovery';
import { trackCronFailure, trackCronSlowRun } from '@/lib/observability/server-tracking';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// CRON: DELIVERY RECOVERY
// Triggered by Vercel Cron every 15 minutes
//
// Recovers notifications that were deferred during
// Quiet Hours and delivers them once the silent
// period ends.
//
// PROD-01 (FASE 12-P1-B)
//
// Safety guarantees:
//  - Atomic claim (pending → delivering) prevents duplicate sends
//  - Re-checks quiet hours before sending
//  - Max 100 per run, max 3 attempts per notification
//  - Notifications older than 24h are expired
//  - Secured with CRON_SECRET (same pattern as other crons)
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Verify cron secret to prevent unauthorized invocation
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    serverLog.warn('cron/delivery-recovery', 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  serverLog.info('cron/delivery-recovery', 'Triggered');

  try {
    const result = await processDeferredNotifications();
    const durationMs = Date.now() - start;

    serverLog.info('cron/delivery-recovery', 'Completed', {
      processed: result.processed,
      delivered: result.delivered,
      redeferred: result.redeferred,
      failed: result.failed,
      expired: result.expired,
      skipped: result.skipped,
      errors: result.errors,
      durationMs,
    });

    trackCronSlowRun('delivery-recovery', durationMs);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    serverLog.error('cron/delivery-recovery', 'Fatal error', error, { durationMs });
    trackCronFailure('delivery-recovery', error, durationMs);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
