export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  ACHIEVEMENTS,
  calculateProgress,
  checkAndUnlock,
  buildAchievementResponse,
} from '@/lib/achievements';

// ═══════════════════════════════════════════
// GET — List achievements with progress
// Also auto-unlocks achievements that meet their target.
// This is the only unlock trigger: achievements
// are "remembered" when the user visits this page.
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Auto-unlock achievements that meet their target (non-blocking)
    // This is the "algo se recordó" moment — not an instant reward
    const newlyUnlocked = await checkAndUnlock(user.id);

    // Fetch all unlocked achievements + progress in parallel
    const [unlocked, progressData] = await Promise.all([
      db.achievement.findMany({ where: { userId: user.id } }),
      calculateProgress(user.id),
    ]);

    const unlockedKeys = new Set(unlocked.map(a => a.key));
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
  } catch (error) {
    console.error('Achievements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
