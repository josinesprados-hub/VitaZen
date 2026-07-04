export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { date, mood, energy, sleep, stress, notes } = await request.json();

    const existing = await db.wellnessLog.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(date) } },
    });

    const log = await db.wellnessLog.upsert({
      where: { userId_date: { userId: user.id, date: new Date(date) } },
      update: { mood, energy, sleep, stress, notes },
      create: { userId: user.id, date: new Date(date), mood, energy, sleep, stress, notes },
    });

    // Award XP and streak to energia empire only on first log of the day
    if (!existing) {
      await db.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
        update: { xp: { increment: 10 }, streak: { increment: 1 } },
        create: { userId: user.id, empire: 'energia', xp: 10, streak: 1 },
      });
    }

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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { logId, mood, energy, sleep, stress, notes } = body;
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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { logId } = body;
    const log = await db.wellnessLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.wellnessLog.delete({ where: { id: logId } });

    // Revert XP for energia empire (never below 0, don't create if missing)
    const energiaProgress = await db.empireProgress.findUnique({
      where: { userId_empire: { userId: user.id, empire: 'energia' } },
    });
    if (energiaProgress) {
      await db.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
        data: { xp: Math.max(0, energiaProgress.xp - 10) },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wellness DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
