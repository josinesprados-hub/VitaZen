import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const logs = await db.nutritionLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Nutrition GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { date, meals, water, calories, notes } = await request.json();

    const log = await db.nutritionLog.upsert({
      where: { userId_date: { userId: user.id, date: new Date(date) } },
      update: { meals, water, calories, notes },
      create: { userId: user.id, date: new Date(date), meals, water, calories, notes },
    });

    // Award XP to energia empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'energia' } },
      update: { xp: { increment: 10 } },
      create: { userId: user.id, empire: 'energia', xp: 10 },
    });

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Nutrition POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
