export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { getEmotionalDashboardSnapshot } from '@/lib/server/emotional-dashboard-state';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// GET /api/emotional-snapshot
// ═══════════════════════════════════════════
//
// Single source of truth for the emotional dashboard.
// Returns reflection + silent memory — computed once,
// persisted server-side, shared across all devices.
//
// This replaces:
//   - Client-side Math.random() in reflections
//   - Client-side localStorage for reflection state
//   - Client-side localStorage for silent memory rarity
//
// No more per-device inconsistency.

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

    const snapshot = await getEmotionalDashboardSnapshot(user.id);

    return NextResponse.json(snapshot);
  } catch (error) {
    serverLog.apiError('api/emotional-snapshot', 'GET', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withTiming('api/emotional-snapshot', handler);
