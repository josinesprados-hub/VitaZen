export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { withTiming, timeOperation } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';
import { startOf7DaysAgoMadrid, startOf30DaysAgoMadrid } from '@/lib/dates';

async function handler(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const weekAgo = startOf7DaysAgoMadrid();

    // Meditation sessions this week
    const meditationWeek = await db.meditationSession.count({
      where: {
        userId: user.id,
        completedAt: { gte: weekAgo },
      },
    });

    // Habits completed this week (consistent with /dashboard/progress and /dashboard/momentum)
    const habitsCompleted = await db.habitLog.count({
      where: {
        userId: user.id,
        lastCompletedAt: { gte: weekAgo, not: null },
      },
    });

    // Journal entries this week
    const journalWeek = await db.journalEntry.count({
      where: {
        userId: user.id,
        createdAt: { gte: weekAgo },
      },
    });

    // Financial balance (income - expenses, last 30 days)
    const thirtyDaysAgo = startOf30DaysAgoMadrid();
    const financeLogs = await db.financeLog.findMany({
      where: {
        userId: user.id,
        date: { gte: thirtyDaysAgo },
      },
      select: { type: true, amount: true },
    });

    const totalIncome = financeLogs.filter(l => l.type === 'income').reduce((s, l) => s + l.amount, 0);
    const totalExpense = financeLogs.filter(l => l.type === 'expense').reduce((s, l) => s + l.amount, 0);
    const balance = totalIncome - totalExpense;

    return NextResponse.json({
      meditationWeek,
      habitsCompleted,
      journalWeek,
      balance,
      totalIncome,
      totalExpense,
    });
  } catch (error) {
    serverLog.apiError('api/dashboard/metrics', 'GET', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withTiming('api/dashboard/metrics', handler);
