export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';

const XP_PER_LEVEL = 100;

async function handler(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const progress = await db.empireProgress.findMany({
      where: { userId: user.id },
    });

    // Calculate levels from XP
    const empires = progress.map((ep) => ({
      empire: ep.empire,
      level: Math.floor(ep.xp / XP_PER_LEVEL) + 1,
      xp: ep.xp,
      xpToNextLevel: XP_PER_LEVEL - (ep.xp % XP_PER_LEVEL),
      streak: ep.streak,
      progress: (ep.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100,
    }));

    return NextResponse.json({ empires });
  } catch (error) {
    serverLog.apiError('api/empire', 'GET', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withTiming('api/empire', handler);
