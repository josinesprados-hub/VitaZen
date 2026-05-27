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

    // ╔══════════════════════════════════════════════════╗
    // ║  TEMPORAL DEBUG — REMOVE AFTER FIXING            ║
    // ╚══════════════════════════════════════════════════╝
    const _dbg = (step: string, data?: any) => {
      console.error(JSON.stringify({ vz_dbg: true, route: 'achievements', step, ...data, ts: new Date().toISOString() }));
    };
    _dbg('start');

    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) {
      _dbg('auth_failed', { reason: 'getAuthUserBasic returned null' });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    _dbg('auth_ok', { userId: user.id, plan: user.plan });

    // Auto-unlock achievements that meet their target.
    let checkResult: any;
    try {
      checkResult = await checkAndUnlock(user.id);
      _dbg('checkAndUnlock_ok', { newlyUnlocked: checkResult.newlyUnlocked?.length, unlockedKeys: checkResult.unlockedKeys?.size });
    } catch (cuErr: any) {
      _dbg('checkAndUnlock_FAILED', { errMsg: cuErr?.message, errName: cuErr?.constructor?.name, errStack: cuErr?.stack?.slice(0, 500) });
      throw cuErr;
    }
    const { newlyUnlocked, progressData, unlockedKeys } = checkResult;

    // Fetch unlockedAt timestamps (lightweight — only the unlocked records)
    let unlocked: any;
    try {
      unlocked = await db.achievement.findMany({ where: { userId: user.id } });
      _dbg('findMany_ok', { count: unlocked?.length, isNull: unlocked === null, type: typeof unlocked });
    } catch (fmErr: any) {
      _dbg('findMany_FAILED', { errMsg: fmErr?.message, errName: fmErr?.constructor?.name, prismaCode: (fmErr as any)?.code });
      throw fmErr;
    }

    if (!unlocked) {
      _dbg('findMany_null_guard');
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

    _dbg('success', { achievementCount: achievements?.length, totalVisible, unlockedVisible });

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
    const stack = error instanceof Error ? error.stack?.slice(0, 800) : undefined;
    serverLog.apiError('api/achievements', 'GET', 500, error, { prismaCode: code, errorMessage: message });
    // TEMPORAL: include debug info in response body for network tab inspection
    return NextResponse.json({ error: 'Internal server error', _dbg: { message, code, stack } }, { status: 500 });
  }
}

export const GET = withTiming('api/achievements', handler, { slowThresholdMs: 5_000 });
