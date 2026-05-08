export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min timeout for batch email sending

import { NextRequest, NextResponse } from 'next/server';
import { sendWeeklyRecaps } from '@/lib/weekly-recap-sender';

// ═══════════════════════════════════════════
// CRON: WEEKLY RECAP EMAILS
// Triggered by Vercel Cron every Monday at 9:00 CET
// Secured with CRON_SECRET to prevent unauthorized calls
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized invocation
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[CRON/WEEKLY-RECAP] Unauthorized attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[CRON/WEEKLY-RECAP] Triggered at', new Date().toISOString());

  try {
    const result = await sendWeeklyRecaps();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[CRON/WEEKLY-RECAP] Fatal error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
