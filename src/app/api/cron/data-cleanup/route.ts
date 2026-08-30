export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout

import { NextRequest, NextResponse } from 'next/server';
import { runAllCleanups } from '@/lib/data-cleanup';
import { serverLog } from '@/lib/observability/server-logger';

// ═════════════════════════════════════════════════════════════════════
// CRON: DATA CLEANUP
// Triggered by Vercel Cron every hour.
//
// Cleans up infrastructure tables that grow indefinitely:
//   1. AnalyticsEvent rl:* (>10 min)    — rate-limiting ephemera
//   2. NotificationLog (>8 days)        — caps/cooldowns data
//   3. PushToken inactive (>30 days)    — dead FCM tokens
//   4. DeferredNotification terminal (>3 days)
//   5. AnalyticsEvent product (>120 days)
//
// Safety:
//   - Each cleanup is independent (failure in one doesn't affect others)
//   - All deletes are batched and filtered by status/time
//   - DeferredNotification pending/delivering are NEVER touched
//   - PushToken active=true are NEVER touched
//   - Secured with CRON_SECRET (same pattern as other crons)
//
// FASE 12-P6 (PROD-05 / PROD-08)
// ═════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Verify cron secret to prevent unauthorized invocation
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    serverLog.warn('cron/data-cleanup', 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  serverLog.info('cron/data-cleanup', 'Triggered');

  try {
    const result = await runAllCleanups();
    const durationMs = Date.now() - start;

    serverLog.info('cron/data-cleanup', 'Completed', {
      analyticsRateLimitDeleted: result.analyticsRateLimitDeleted,
      notificationLogsDeleted: result.notificationLogsDeleted,
      inactivePushTokensDeleted: result.inactivePushTokensDeleted,
      deferredNotificationsDeleted: result.deferredNotificationsDeleted,
      analyticsEventsDeleted: result.analyticsEventsDeleted,
      errors: result.errors.length,
      durationMs,
    });

    return NextResponse.json({
      success: result.errors.length === 0,
      ...result,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    serverLog.error('cron/data-cleanup', 'Fatal error', error, { durationMs });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
