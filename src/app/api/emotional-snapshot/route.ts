export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getEmotionalDashboardSnapshot } from '@/lib/server/emotional-dashboard-state';

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

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const snapshot = await getEmotionalDashboardSnapshot(user.id);

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Emotional snapshot error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
