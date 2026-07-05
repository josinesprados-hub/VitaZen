export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onEnergiaChange } from '@/lib/widgets/triggers';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { date, meals, water, calories, notes } = await request.json();

    const existing = await db.nutritionLog.findUnique({
      where: { userId_date: { userId: user.id, date: new Date(date) } },
    });

    const log = await db.nutritionLog.upsert({
      where: { userId_date: { userId: user.id, date: new Date(date) } },
      update: { meals, water, calories, notes },
      create: { userId: user.id, date: new Date(date), meals, water, calories, notes },
    });

    // Award XP and streak to energia empire only on first log of the day
    if (!existing) {
      await db.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
        update: { xp: { increment: 10 }, streak: { increment: 1 } },
        create: { userId: user.id, empire: 'energia', xp: 10, streak: 1 },
      });
    }

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'nutrition').catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Nutrition POST error:', error);
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
    const { logId, meals, water, calories, notes } = body;
    const log = await db.nutritionLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await db.nutritionLog.update({
      where: { id: logId },
      data: { meals, water, calories, notes },
    });

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    return NextResponse.json({ log: updated });
  } catch (error) {
    console.error('Nutrition PUT error:', error);
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
    const log = await db.nutritionLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.nutritionLog.delete({ where: { id: logId } });

    // Revert XP for energia empire (never below 0, don't create if missing)
    const energiaProgress = await db.empireProgress.findUnique({
      where: { userId_empire: { userId: user.id, empire: 'energia' } },
    });
    if (energiaProgress) {
      await db.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
        data: { xp: Math.max(0, energiaProgress.xp - 10), streak: Math.max(0, energiaProgress.streak - 1) },
      });
    }

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Nutrition DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
