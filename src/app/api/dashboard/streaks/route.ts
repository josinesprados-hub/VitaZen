import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
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
    // No activity today, check from yesterday
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

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Fetch all dates for each category
    const [meditationDates, habitDates, journalDates] = await Promise.all([
      db.meditationSession.findMany({
        where: { userId: user.id },
        select: { completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
      db.habitLog.findMany({
        where: { userId: user.id, lastCompletedAt: { not: null } },
        select: { lastCompletedAt: true },
        orderBy: { lastCompletedAt: 'desc' },
      }),
      db.journalEntry.findMany({
        where: { userId: user.id },
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const meditationStreak = calcStreak(meditationDates.map(m => m.completedAt));
    const habitStreak = calcStreak(habitDates.map(h => h.lastCompletedAt!));
    const journalStreak = calcStreak(journalDates.map(j => j.createdAt));

    return NextResponse.json({
      meditationStreak,
      habitStreak,
      journalStreak,
    });
  } catch (error) {
    console.error('Dashboard streaks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
