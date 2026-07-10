export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { getDailyQuote } from '@/lib/server/daily-quote';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// GET /api/daily-quote
// ═══════════════════════════════════════════
//
// Returns the user's daily quote.
// One quote per day. Deterministic. Cross-device consistent.
// Changes automatically at the start of each new day.
// Never repeats until the full collection has been shown.

async function handler(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUserBasic(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const quote = await getDailyQuote(user.id);

    return NextResponse.json(quote);
  } catch (error) {
    serverLog.apiError('api/daily-quote', 'GET', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withTiming('api/daily-quote', handler);
