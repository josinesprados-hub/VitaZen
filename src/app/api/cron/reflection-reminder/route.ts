export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout for batch processing

import { NextRequest, NextResponse } from 'next/server';
import { processReflectionBatch } from '@/lib/notifications/reminders/reflection';
import { trackCronFailure, trackCronSlowRun } from '@/lib/observability/server-tracking';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// CRON: REFLECTION REMINDERS
// Triggered by Vercel Cron daily at 18:00 UTC
// (approx 19:00–20:00 CET, the "reflection window")
//
// Sends calm evening reflection reminders to eligible users.
// Secured with CRON_SECRET to prevent unauthorized calls.
//
// Safety guarantees:
//  - Max 100 users per run (BATCH_SIZE limit)
//  - 100ms delay between sends (FCM rate limit protection)
//  - Full gate checks per user (preferences, quiet hours, caps, cooldowns)
//  - Skips users who already checked in today
//  - Skips users currently active in the app
//  - Only sends during 18:00–21:00 in user's local timezone
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Verify cron secret to prevent unauthorized invocation
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    serverLog.warn('cron/reflection-reminder', 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  serverLog.info('cron/reflection-reminder', 'Triggered');

  try {
    const result = await processReflectionBatch();
    const durationMs = Date.now() - start;

    serverLog.info('cron/reflection-reminder', 'Completed', {
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      total: result.total,
      durationMs,
    });

    trackCronSlowRun('reflection-reminder', durationMs);

    return NextResponse.json({
      success: true,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      total: result.total,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    serverLog.error('cron/reflection-reminder', 'Fatal error', error, { durationMs });
    trackCronFailure('reflection-reminder', error, durationMs);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
