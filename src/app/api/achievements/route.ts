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
  const endpoint = 'api/achievements';
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'noAuthHeader' }));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) {
      console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'userNotFound' }));
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'authOk', userId: user.id }));

    // Auto-unlock achievements that meet their target.
    const t0 = Date.now();
    const { newlyUnlocked, progressData, unlockedKeys } = await checkAndUnlock(user.id);
    console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'checkAndUnlockOk', durationMs: Date.now() - t0, newlyUnlockedCount: newlyUnlocked.length, unlockedKeysCount: unlockedKeys.size, progressKeysCount: Object.keys(progressData).length }));

    // Fetch unlockedAt timestamps (lightweight — only the unlocked records)
    const t1 = Date.now();
    const unlocked = await db.achievement.findMany({ where: { userId: user.id } });
    console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'achievementFindMany', isNull: unlocked === null, isArray: Array.isArray(unlocked), count: Array.isArray(unlocked) ? unlocked.length : 'N/A', durationMs: Date.now() - t1 }));
    // Guard: PrismaPg driver adapter can return null for findMany in edge cases.
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

    console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'returning200', achievementsCount: achievements.length, statsTotal: totalVisible, statsUnlocked: unlockedVisible }));
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
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') : undefined;
    console.error(JSON.stringify({ vz_debug: true, endpoint, step: 'CATCH', error: message, prismaCode: code, stack }));
    serverLog.apiError('api/achievements', 'GET', 500, error, { prismaCode: code, errorMessage: message });
    return NextResponse.json({ error: 'Internal server error', debug: message, prismaCode: code }, { status: 500 });
  }
}

export const GET = withTiming('api/achievements', handler, { slowThresholdMs: 5_000 });
