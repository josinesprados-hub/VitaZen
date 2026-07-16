export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMadridDateKey } from '@/lib/deterministic';
import { calcStreak, startOf60DaysAgoMadrid, addDaysToDateKey, getTodayDateKey } from '@/lib/dates';

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
    const sixtyDaysAgo = startOf60DaysAgoMadrid();

    // Fetch dates for each category (bounded)
    const [meditationDates, habitDates, journalDates, checkinDates, wellnessDates, nutritionDates] = await Promise.all([
      db.meditationSession.findMany({
        where: { userId: user.id, completedAt: { gte: sixtyDaysAgo } },
        select: { completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
      db.habitLog.findMany({
        where: { userId: user.id, lastCompletedAt: { not: null, gte: sixtyDaysAgo } },
        select: { lastCompletedAt: true, streak: true },
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
      db.wellnessLog.findMany({
        where: { userId: user.id, date: { gte: sixtyDaysAgo } },
        select: { date: true },
        orderBy: { date: 'desc' },
      }),
      db.nutritionLog.findMany({
        where: { userId: user.id, date: { gte: sixtyDaysAgo } },
        select: { date: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    const meditationStreak = calcStreak(meditationDates.map(m => m.completedAt));
    // T-4 FIX: habitStreak previously used calcStreak(habitDates.map(h =>
    // h.lastCompletedAt!)) — but HabitLog has ONE row per habit with
    // lastCompletedAt as a SINGLE timestamp (the most recent completion),
    // not a per-day completion log. So habitDates contained at most N
    // timestamps (N = num habits), all from the most recent completion day(s).
    // calcStreak could never see more days than there are habits, so for a
    // user with 1 habit completed daily for 45 days, habitStreak was always 1
    // (only today's lastCompletedAt was visible).
    //
    // Fix: use the authoritative HabitLog.streak field (updated atomically in
    // habits/route.ts PATCH with the H-10/H-11 logic — per active Madrid day,
    // Madrid-aware boundaries). habitStreak = max streak across all habits,
    // which is the "best habit streak" the user has. This is consistent with
    // how the disciplina page displays streak per habit, and how the insights
    // engine uses topStreak = max(HabitLog.streak).
    const habitStreak = habitDates.length > 0
      ? Math.max(...habitDates.map(h => h.streak))
      : 0;
    const journalStreak = calcStreak(journalDates.map(j => j.createdAt));
    const checkinStreak = calcStreak(checkinDates.map(c => c.date));
    const wellnessStreak = calcStreak(wellnessDates.map(w => w.date));
    const nutritionStreak = calcStreak(nutritionDates.map(n => n.date));

    // General streak: any activity (meditation, habit, journal, checkin, wellness, nutrition)
    const allDates = [
      ...meditationDates.map(m => m.completedAt),
      ...habitDates.map(h => h.lastCompletedAt!),
      ...journalDates.map(j => j.createdAt),
      ...checkinDates.map(c => c.date),
      ...wellnessDates.map(w => w.date),
      ...nutritionDates.map(n => n.date),
    ];
    const generalStreak = calcStreak(allDates);

    // Check if user was active yesterday (for message context)
    // Use Europe/Madrid timezone — same as calcStreak and the rest of VitaZen.
    const todayStr = getTodayDateKey();
    const yesterdayStr = addDaysToDateKey(todayStr, -1);
    const uniqueAllDays = new Set<string>();
    for (const d of allDates) {
      uniqueAllDays.add(getMadridDateKey(new Date(d)));
    }
    const wasActiveYesterday = uniqueAllDays.has(yesterdayStr);

    const streakMessage = getStreakMessage(generalStreak, wasActiveYesterday);

    return NextResponse.json({
      meditationStreak,
      habitStreak,
      journalStreak,
      checkinStreak,
      wellnessStreak,
      nutritionStreak,
      generalStreak,
      streakMessage,
    });
  } catch (error) {
    console.error('Dashboard streaks error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
