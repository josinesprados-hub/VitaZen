export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { madridDaysAgo } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    let days = 90;
    const daysParam = searchParams.get('days');
    if (daysParam) {
      const parsed = parseInt(daysParam);
      if (!isNaN(parsed)) days = Math.min(Math.max(parsed, 10), 365);
    }
    days = Math.max(0, days);

    // PERF-5.2: Add select to reduce response payload size.
    // Previously returned ALL columns (including id, createdAt, contexto)
    // for every row — up to 365 rows. Now only returns fields the frontend uses.
    const logs = await db.financeLog.findMany({
      where: { userId: user.id, date: { gte: madridDaysAgo(days) } },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        type: true,
        category: true,
        amount: true,
        description: true,
        mood: true,
        contexto: true,
      },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Finance GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
