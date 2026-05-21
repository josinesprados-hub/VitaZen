// ═══════════════════════════════════════════
// VITAZEN — Silent Memories API Route
// ═══════════════════════════════════════════
//
// Server-only route that fetches raw data for
// silent memory computation.
//
// The client calls this, receives serializable data,
// and handles observation selection + rarity on its own.
//
// This keeps all DB/Prisma access on the server.
// No server state leaks to the client.
// ═══════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getSilentMemoryData } from '@/lib/server/silent-memories';

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

    const data = await getSilentMemoryData(user.id);

    return NextResponse.json(data);
  } catch (error) {
    // Silent memories never break the app.
    // If data fetch fails, return empty data — client shows nothing.
    console.error('[Silent Memories API] Error:', error);
    return NextResponse.json({
      firstActivityDate: null,
      consecutiveDays: 0,
      thisWeek: null,
      prevWeek: null,
      thisWeekForRecurrence: null,
      monthAgo: null,
    });
  }
}
