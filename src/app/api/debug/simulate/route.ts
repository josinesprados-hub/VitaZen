export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkAndUnlock, buildAchievementResponse, ACHIEVEMENTS } from '@/lib/achievements';

// TEMPORAL: Simulates the exact flow of /api/journal and /api/achievements
// using a real user ID from the database, bypassing auth.
// This tells us if the queries work or if they fail for some reason.
export async function GET() {
  const results: Record<string, unknown> = { timestamp: new Date().toISOString() };

  // Step 1: Get a real user
  try {
    const user = await db.user.findFirst();
    if (!user) {
      results.error = 'No users found in database';
      return NextResponse.json(results, { status: 500 });
    }
    results.userId = user.id;
    results.userPlan = user.plan;
    results.userFirebaseUid = user.firebaseUid;

    // Step 2: Simulate /api/journal GET
    const journalStart = Date.now();
    try {
      const entries = await db.journalEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      results.journalSuccess = true;
      results.journalEntriesCount = entries.length;
      results.journalIsNull = entries === null;
      results.journalIsArray = Array.isArray(entries);
      results.journalDurationMs = Date.now() - journalStart;
    } catch (error: any) {
      results.journalSuccess = false;
      results.journalError = error?.message || String(error);
      results.journalErrorCode = error?.code;
      results.journalDurationMs = Date.now() - journalStart;
    }

    // Step 3: Simulate /api/achievements GET
    const achievementsStart = Date.now();
    try {
      // checkAndUnlock
      const { newlyUnlocked, progressData, unlockedKeys } = await checkAndUnlock(user.id);
      results.checkAndUnlockSuccess = true;
      results.newlyUnlockedCount = newlyUnlocked.length;
      results.unlockedKeysCount = unlockedKeys.size;
      results.progressKeysCount = Object.keys(progressData).length;

      // findMany for unlockedAt
      const unlocked = await db.achievement.findMany({ where: { userId: user.id } });
      results.achievementFindManySuccess = true;
      results.achievementIsNull = unlocked === null;
      results.achievementIsArray = Array.isArray(unlocked);
      results.achievementCount = Array.isArray(unlocked) ? unlocked.length : 'N/A';

      // Build response
      if (unlocked) {
        const unlockedAtMap = new Map(unlocked.map(a => [a.key, a.unlockedAt.toISOString()]));
        const achievements = buildAchievementResponse(ACHIEVEMENTS, progressData, unlockedKeys, unlockedAtMap);
        results.achievementsBuilt = true;
        results.achievementsCount = achievements.length;
      }

      results.achievementsDurationMs = Date.now() - achievementsStart;
      results.achievementsSuccess = true;
    } catch (error: any) {
      results.achievementsSuccess = false;
      results.achievementsError = error?.message || String(error);
      results.achievementsErrorCode = error?.code;
      results.achievementsStack = error?.stack?.split('\n').slice(0, 5).join(' | ');
      results.achievementsDurationMs = Date.now() - achievementsStart;
    }
  } catch (error: any) {
    results.outerError = error?.message || String(error);
  }

  return NextResponse.json(results, { status: 200 });
}
