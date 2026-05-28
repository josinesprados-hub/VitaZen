export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout for batch processing

import { NextRequest, NextResponse } from 'next/server';
import { processDailyBatch } from '@/lib/notifications/reminders/daily';
import { trackCronFailure, trackCronSlowRun } from '@/lib/observability/server-tracking';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// CRON: DAILY PRESENCE REMINDERS
// Triggered by Vercel Cron daily at 11:00 UTC
// (approx 12:00–13:00 CET, the "midday pause window")
//
// Sends calm, emotional, presence-oriented reminders.
// NOT a check-in nudge — a "you're here, that's enough" nudge.
// The toggle for this is User.dailyReminders (in Ajustes → Email).
//
// Secured with CRON_SECRET to prevent unauthorized calls.
//
// Safety guarantees:
//  - Max 100 users per run (BATCH_SIZE limit)
//  - 100ms delay between sends (FCM rate limit protection)
//  - Full gate checks per user (preferences, quiet hours, caps, cooldowns)
//  - Skips users currently active in the app
//  - Only sends during 12:00–15:00 in user's local timezone
//  - Cooldown: 24 hours between daily reminders
//  - Weekly cap: 5 daily reminders per week
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Verify cron secret to prevent unauthorized invocation
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    serverLog.warn('cron/daily-reminder', 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  serverLog.info('cron/daily-reminder', 'Triggered');

  try {
    const result = await processDailyBatch();
    const durationMs = Date.now() - start;

    serverLog.info('cron/daily-reminder', 'Completed', {
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      total: result.total,
      durationMs,
    });

    trackCronSlowRun('daily-reminder', durationMs);

    return NextResponse.json({
      success: true,
      sent: result.sent,
      skipped: result.skipped,
      errors: result.errors,
      total: result.total,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    serverLog.error('cron/daily-reminder', 'Fatal error', error, { durationMs });
    trackCronFailure('daily-reminder', error, durationMs);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
