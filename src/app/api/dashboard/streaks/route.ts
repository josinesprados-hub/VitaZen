export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';

function calcStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  // Normalize to unique YYYY-MM-DD strings
  const uniqueDays = new Set<string>();
  for (const d of dates) {
    const day = new Date(d);
    uniqueDays.add(`${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`);
  }

  // Start from today; if no activity today, start from yesterday
  const now = new Date();
  let checkDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;

  if (!uniqueDays.has(todayStr)) {
    // No activity today, check from yesterday — graceful: today still counts if yesterday was active
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }

  let streak = 0;
  while (true) {
    const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;
    if (uniqueDays.has(dateStr)) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  return streak;
}

// Get a human, non-toxic message for streak state
function getStreakMessage(streak: number, wasActiveYesterday: boolean): { message: string; tone: 'active' | 'warm' | 'gentle' } {
  if (streak >= 7) {
    return { message: `${streak} días. Ya es costumbre.`, tone: 'active' };
  }
  if (streak >= 3) {
    return { message: `${streak} días seguidos. Poco a poco.`, tone: 'active' };
  }
  if (streak >= 1) {
    return { message: `${streak} día${streak > 1 ? 's' : ''}.`, tone: 'warm' };
  }
  if (wasActiveYesterday) {
    return { message: 'Hoy es un nuevo día.', tone: 'warm' };
  }
  return { message: '', tone: 'gentle' };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // ═══ PERFORMANCE FIX: Bound queries to 60 days instead of ALL TIME ═══
    // No real streak exceeds 60 days, and unbounded queries grow linearly
    // with user history — becoming slower every month.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Fetch dates for each category (bounded)
    const [meditationDates, habitDates, journalDates, checkinDates] = await Promise.all([
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

    const meditationStreak = calcStreak(meditationDates.map(m => m.completedAt));
    const habitStreak = calcStreak(habitDates.map(h => h.lastCompletedAt!));
    const journalStreak = calcStreak(journalDates.map(j => j.createdAt));
    const checkinStreak = calcStreak(checkinDates.map(c => c.date));

    // General streak: any activity (meditation, habit, journal, or checkin)
    const allDates = [
      ...meditationDates.map(m => m.completedAt),
      ...habitDates.map(h => h.lastCompletedAt!),
      ...journalDates.map(j => j.createdAt),
      ...checkinDates.map(c => c.date),
    ];
    const generalStreak = calcStreak(allDates);

    // Check if user was active yesterday (for message context)
    const now = new Date();
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 24 * 60 * 60 * 1000);
    const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${yesterday.getUTCDate().padStart(2, '0')}`;
    const uniqueAllDays = new Set<string>();
    for (const d of allDates) {
      const day = new Date(d);
      uniqueAllDays.add(`${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`);
    }
    const wasActiveYesterday = uniqueAllDays.has(yesterdayStr);

    const streakMessage = getStreakMessage(generalStreak, wasActiveYesterday);

    return NextResponse.json({
      meditationStreak,
      habitStreak,
      journalStreak,
      checkinStreak,
      generalStreak,
      streakMessage,
    });
  } catch (error) {
    console.error('Dashboard streaks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
