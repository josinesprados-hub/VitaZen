import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    const logs = await db.wellnessLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: days,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Wellness GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { date, mood, energy, sleep, stress, notes } = await request.json();

    const log = await db.wellnessLog.upsert({
      where: { userId_date: { userId: user.id, date: new Date(date) } },
      update: { mood, energy, sleep, stress, notes },
      create: { userId: user.id, date: new Date(date), mood, energy, sleep, stress, notes },
    });

    // Award XP to energia empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'energia' } },
      update: { xp: { increment: 10 } },
      create: { userId: user.id, empire: 'energia', xp: 10 },
    });

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Wellness POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
