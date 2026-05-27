export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  ACHIEVEMENTS,
  checkAndUnlock,
  buildAchievementResponse,
} from '@/lib/achievements';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';

// ═══════════════════════════════════════════
// GET — List achievements with progress
// Also auto-unlocks achievements that meet their target.
// This is the only unlock trigger: achievements
// are "remembered" when the user visits this page.
// ═══════════════════════════════════════════

async function handler(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Auto-unlock achievements that meet their target.
    // checkAndUnlock returns progressData + unlockedKeys so we
    // don't need to recalculate — eliminates a duplicate set of
    // ~19 DB queries that was causing timeouts and failures.
    const { newlyUnlocked, progressData, unlockedKeys } = await checkAndUnlock(user.id);

    // Fetch unlockedAt timestamps (lightweight — only the unlocked records)
    const unlocked = await db.achievement.findMany({ where: { userId: user.id } });
    // Guard: PrismaPg driver adapter can return null for findMany in edge cases.
    // A cryptic TypeError here ("Cannot read properties of null") would bypass
    // the route handler's catch and trigger the dashboard error boundary,
    // showing a generic "No se pudieron cargar los datos" to the user.
    // Throw a descriptive error so the 500 response includes the real cause.
    if (!unlocked) {
      throw new Error('PrismaPg adapter returned null for achievement.findMany — userId: ' + user.id);
    }
    const unlockedAtMap = new Map(unlocked.map(a => [a.key, a.unlockedAt.toISOString()]));

    // Build response with hidden achievement logic
    const achievements = buildAchievementResponse(
      ACHIEVEMENTS,
      progressData,
      unlockedKeys,
      unlockedAtMap,
    );

    // Stats count only visible achievements for the overall progress
    const visibleAchievements = ACHIEVEMENTS.filter(a => !a.hidden);
    const totalVisible = visibleAchievements.length;
    const unlockedVisible = visibleAchievements.filter(a => unlockedKeys.has(a.key)).length;

    return NextResponse.json({
      achievements,
      newlyUnlocked,
      stats: {
        total: totalVisible,
        unlocked: unlockedVisible,
        percent: totalVisible > 0 ? Math.round((unlockedVisible / totalVisible) * 100) : 0,
      },
    });
  } catch (error: unknown) {
    // Structured error logging — includes Prisma code and message so
    // that "table does not exist" or connection errors are immediately
    // visible in server logs without hiding behind a generic message.
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code || (error as any)?.prismaCode || 'UNKNOWN';
    serverLog.apiError('api/achievements', 'GET', 500, error, { prismaCode: code, errorMessage: message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withTiming('api/achievements', handler, { slowThresholdMs: 5_000 });
