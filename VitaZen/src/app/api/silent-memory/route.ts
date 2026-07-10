export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { getSilentMemorySnapshot } from '@/lib/server/silent-memory-state';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// GET /api/silent-memory
// ═══════════════════════════════════════════
//
// Single source of truth for the silent memory (rare observations).
// Returns only { silentMemory } — the daily quote is now served
// by /api/daily-quote (src/lib/daily-quotes.ts).
//
// This endpoint replaces /api/emotional-snapshot which previously
// returned both { reflection, silentMemory }. The reflection system
// has been removed; only the silent memory remains here.

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

    const snapshot = await getSilentMemorySnapshot(user.id);

    return NextResponse.json(snapshot);
  } catch (error) {
    serverLog.apiError('api/silent-memory', 'GET', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withTiming('api/silent-memory', handler);
