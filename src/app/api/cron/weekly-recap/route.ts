export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout for batch email sending

import { NextRequest, NextResponse } from 'next/server';
import { sendWeeklyRecaps } from '@/lib/weekly-recap-sender';
import { trackCronFailure, trackCronSlowRun } from '@/lib/observability/server-tracking';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// CRON: WEEKLY RECAP EMAILS
// Triggered by Vercel Cron every Monday at 9:00 CET
// Secured with CRON_SECRET to prevent unauthorized calls
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  const start = Date.now();

  // Verify cron secret to prevent unauthorized invocation
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    serverLog.warn('cron/weekly-recap', 'Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  serverLog.info('cron/weekly-recap', 'Triggered');

  try {
    const result = await sendWeeklyRecaps();
    const durationMs = Date.now() - start;

    serverLog.info('cron/weekly-recap', 'Completed', {
      ...result,
      durationMs,
    });

    trackCronSlowRun('weekly-recap', durationMs);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    serverLog.error('cron/weekly-recap', 'Fatal error', error, { durationMs });
    trackCronFailure('weekly-recap', error, durationMs);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
