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

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { logId, mood, energy, sleep, stress, notes } = await request.json();

    const log = await db.wellnessLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await db.wellnessLog.update({
      where: { id: logId },
      data: { mood, energy, sleep, stress, notes },
    });

    return NextResponse.json({ log: updated });
  } catch (error) {
    console.error('Wellness PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { logId } = await request.json();

    const log = await db.wellnessLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.wellnessLog.delete({ where: { id: logId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wellness DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
