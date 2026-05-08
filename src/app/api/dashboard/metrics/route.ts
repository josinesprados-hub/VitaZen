export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Meditation sessions this week
    const meditationWeek = await db.meditationSession.count({
      where: {
        userId: user.id,
        completedAt: { gte: weekAgo },
      },
    });

    // Habits completed (with streak > 0 means completed at least once)
    const habitsCompleted = await db.habitLog.count({
      where: {
        userId: user.id,
        lastCompletedAt: { gte: weekAgo },
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
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
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
    console.error('Dashboard metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
