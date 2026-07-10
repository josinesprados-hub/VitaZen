export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMadridDateKey } from '@/lib/deterministic';
import { startOf7DaysAgoMadrid } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const weekAgo = startOf7DaysAgoMadrid();

    // Meditation: sessions this week (target 7)
    const meditationCount = await db.meditationSession.count({
      where: {
        userId: user.id,
        completedAt: { gte: weekAgo },
      },
    });

    // Habits: count of habits completed this week (target 7)
    // H-4 FIX: Previously used distinct active days (findMany + Set), which was
    // semantically inconsistent with /dashboard/metrics (raw count) and
    // /dashboard/momentum (raw count). Also, distinct days from lastCompletedAt
    // is bounded by the number of habits — a user with 3 habits can never show
    // more than 3 active days even if they completed habits on all 7 days.
    // Source of truth: raw count (habits completed at least once this week),
    // consistent with metrics and momentum endpoints.
    const habitsCompleted = await db.habitLog.count({
      where: {
        userId: user.id,
        lastCompletedAt: { gte: weekAgo, not: null },
      },
    });

    // Journal: entries this week (target 3)
    const journalCount = await db.journalEntry.count({
      where: {
        userId: user.id,
        createdAt: { gte: weekAgo },
      },
    });

    // Wellness: distinct days this week (target 7, one per day via @@unique)
    const wellnessLogs = await db.wellnessLog.findMany({
      where: {
        userId: user.id,
        date: { gte: weekAgo },
      },
      select: { date: true },
    });
    const wellnessCount = new Set(
      wellnessLogs.map(w => getMadridDateKey(new Date(w.date)))
    ).size;

    // Nutrition: distinct days this week (target 7, one per day via @@unique)
    const nutritionLogs = await db.nutritionLog.findMany({
      where: {
        userId: user.id,
        date: { gte: weekAgo },
      },
      select: { date: true },
    });
    const nutritionCount = new Set(
      nutritionLogs.map(n => getMadridDateKey(new Date(n.date)))
    ).size;

    // Calculate percentages (capped at 100)
    const meditationPercent = Math.min(Math.round((meditationCount / 7) * 100), 100);
    const habitsPercent = Math.min(Math.round((habitsCompleted / 7) * 100), 100);
    const journalPercent = Math.min(Math.round((journalCount / 3) * 100), 100);
    const wellnessPercent = Math.min(Math.round((wellnessCount / 7) * 100), 100);
    const nutritionPercent = Math.min(Math.round((nutritionCount / 7) * 100), 100);

    // Total progress (average of five)
    const totalPercent = Math.round((meditationPercent + habitsPercent + journalPercent + wellnessPercent + nutritionPercent) / 5);

    return NextResponse.json({
      meditation: { count: meditationCount, target: 7, percent: meditationPercent },
      habits: { count: habitsCompleted, target: 7, percent: habitsPercent },
      journal: { count: journalCount, target: 3, percent: journalPercent },
      wellness: { count: wellnessCount, target: 7, percent: wellnessPercent },
      nutrition: { count: nutritionCount, target: 7, percent: nutritionPercent },
      totalPercent,
    });
  } catch (error) {
    console.error('Dashboard progress error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
