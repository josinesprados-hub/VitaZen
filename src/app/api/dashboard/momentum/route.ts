export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMadridDateKey, getTodayDateKey } from '@/lib/deterministic';

// ═══════════════════════════════════════════
// Momentum Score — consistency-based metric
// ═══════════════════════════════════════════
//
// Momentum = recent consistency. Not XP, not levels.
// It measures "positive inertia" over the last 7 days.
//
// Factors (each contributes up to a portion of 100):
//   - Activity days (any action)     → up to 25 pts
//   - Habits completed               → up to 20 pts
//   - Check-ins done                 → up to 15 pts
//   - Meditation sessions            → up to 15 pts
//   - Journal entries                → up to 10 pts
//   - Challenges completed           → up to 10 pts
//   - Streak bonus (if active)       → up to 5 pts
//
// Levels:
//   0–30  → "bajo"     → "Tu impulso está despertando."
//   31–60 → "estable"  → "Vas con buen ritmo."
//   61–100→ "fuerte"   → "Tu consistencia es notable."

function getMomentumLevel(score: number): { level: string; description: string; trend: 'up' | 'down' | 'stable' } {
  if (score >= 61) {
    return { level: 'fuerte', description: 'Tu consistencia es notable.', trend: 'up' };
  }
  if (score >= 31) {
    return { level: 'estable', description: 'Vas con buen ritmo.', trend: 'stable' };
  }
  return { level: 'bajo', description: 'Tu impulso está despertando.', trend: 'down' };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    // Streak calculation: only need last 60 days (no real streak exceeds this)
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // ═══ PERFORMANCE FIX: Merge all 4 sequential rounds into 1 parallel round ═══
    // Previously: 4 rounds × 4-5 queries each = 18 queries sequentially
    // Now: 1 single Promise.all with all 13 count/date queries + 4 bounded streak queries
    const [
      // 7-day counts
      meditationSessions,
      habitCompletions,
      journalEntries,
      checkins,
      challengesCompleted,
      // 14-day counts (for trend)
      prevMeditation,
      prevHabits,
      prevJournal,
      prevCheckins,
      prevChallenges,
      // 7-day date lookups (for active days)
      medDates,
      habDates,
      jouDates,
      checkDates,
      // Bounded streak data (60 days, not ALL TIME)
      streakMed,
      streakHab,
      streakJou,
      streakCheck,
    ] = await Promise.all([
      // ─── 7-day activity counts ───
      db.meditationSession.count({
        where: { userId: user.id, completedAt: { gte: sevenDaysAgo } },
      }),
      db.habitLog.count({
        where: { userId: user.id, lastCompletedAt: { gte: sevenDaysAgo, not: null } },
      }),
      db.journalEntry.count({
        where: { userId: user.id, createdAt: { gte: sevenDaysAgo } },
      }),
      db.dailyCheckin.count({
        where: { userId: user.id, date: { gte: sevenDaysAgo } },
      }),
      db.userChallenge.count({
        where: { userId: user.id, completed: true, completedAt: { gte: sevenDaysAgo } },
      }),
      // ─── 14-day activity for trend comparison ───
      db.meditationSession.count({
        where: { userId: user.id, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      }),
      db.habitLog.count({
        where: { userId: user.id, lastCompletedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo, not: null } },
      }),
      db.journalEntry.count({
        where: { userId: user.id, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      }),
      db.dailyCheckin.count({
        where: { userId: user.id, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      }),
      db.userChallenge.count({
        where: { userId: user.id, completed: true, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      }),
      // ─── 7-day date lookups for active days ───
      db.meditationSession.findMany({
        where: { userId: user.id, completedAt: { gte: sevenDaysAgo } },
        select: { completedAt: true },
      }),
      db.habitLog.findMany({
        where: { userId: user.id, lastCompletedAt: { gte: sevenDaysAgo, not: null } },
        select: { lastCompletedAt: true },
      }),
      db.journalEntry.findMany({
        where: { userId: user.id, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }),
      db.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: sevenDaysAgo } },
        select: { date: true },
      }),
      // ─── Streak data: 60-day bounded (was unbounded ALL TIME) ───
      db.meditationSession.findMany({
        where: { userId: user.id, completedAt: { gte: sixtyDaysAgo } },
        select: { completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
      db.habitLog.findMany({
        where: { userId: user.id, lastCompletedAt: { not: null, gte: sixtyDaysAgo } },
        select: { lastCompletedAt: true },
        orderBy: { lastCompletedAt: 'desc' },
      }),
      db.journalEntry.findMany({
        where: { userId: user.id, createdAt: { gte: sixtyDaysAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      db.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: sixtyDaysAgo } },
        select: { date: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    // ─── Calculate active days ───
    const allRecentDates = new Set<string>();
    const addDates = (dates: Date[]) => {
      for (const d of dates) {
        allRecentDates.add(getMadridDateKey(new Date(d)));
      }
    };

    addDates(medDates.map(m => m.completedAt));
    addDates(habDates.map(h => h.lastCompletedAt!));
    addDates(jouDates.map(j => j.createdAt));
    addDates(checkDates.map(c => c.date));

    const activeDays = allRecentDates.size;

    // ─── Calculate streak from bounded data ───
    const streakDays = new Set<string>();
    for (const d of [
      ...streakMed.map(m => m.completedAt),
      ...streakHab.map(h => h.lastCompletedAt!),
      ...streakJou.map(j => j.createdAt),
      ...streakCheck.map(c => c.date),
    ]) {
      streakDays.add(getMadridDateKey(new Date(d)));
    }

    const todayStr = getTodayDateKey();
    let checkDateStr = todayStr;
    if (!streakDays.has(todayStr)) {
      const yesterday = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
      checkDateStr = getMadridDateKey(yesterday);
    }

    let currentStreak = 0;
    while (true) {
      if (streakDays.has(checkDateStr)) {
        currentStreak++;
        const prev = new Date(new Date(checkDateStr + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000);
        checkDateStr = getMadridDateKey(prev);
      } else {
        break;
      }
    }

    // ─── Calculate Momentum Score ───
    const activityScore = Math.min(25, Math.round((activeDays / 7) * 25));
    const habitScore = Math.min(20, Math.round((habitCompletions / 7) * 20));
    const checkinScore = Math.min(15, Math.round((checkins / 7) * 15));
    const meditationScore = Math.min(15, Math.round((meditationSessions / 5) * 15));
    const journalScore = Math.min(10, Math.round((journalEntries / 3) * 10));
    const challengeScore = Math.min(10, Math.round((challengesCompleted / 3) * 10));
    const streakBonus = Math.min(5, Math.round((currentStreak / 7) * 5));

    const totalScore = Math.min(100, activityScore + habitScore + checkinScore + meditationScore + journalScore + challengeScore + streakBonus);

    // ─── Calculate Trend ───
    const currentWeekTotal = meditationSessions + habitCompletions + journalEntries + checkins + challengesCompleted;
    const prevWeekTotal = prevMeditation + prevHabits + prevJournal + prevCheckins + prevChallenges;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (currentWeekTotal > prevWeekTotal + 2) trend = 'up';
    else if (currentWeekTotal < prevWeekTotal - 2) trend = 'down';

    const momentumLevel = getMomentumLevel(totalScore);
    const finalTrend = currentWeekTotal > 0 ? trend : momentumLevel.trend;

    return NextResponse.json({
      score: totalScore,
      level: momentumLevel.level,
      description: momentumLevel.description,
      trend: finalTrend,
      breakdown: {
        activityDays: activeDays,
        habitScore,
        checkinScore,
        meditationScore,
        journalScore,
        challengeScore,
        streakBonus,
      },
      currentStreak,
      currentWeekTotal,
      prevWeekTotal,
    });
  } catch (error) {
    console.error('Momentum error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
