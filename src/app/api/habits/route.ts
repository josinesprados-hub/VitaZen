export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onHabitChange } from '@/lib/widgets/triggers';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const habits = await db.habitLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ habits });
  } catch (error) {
    console.error('Habits GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { name, description, frequency } = await request.json();

    const habit = await db.habitLog.create({
      data: { userId: user.id, name, description, frequency },
    });

    // Award XP to disciplina empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
      update: { xp: { increment: 5 } },
      create: { userId: user.id, empire: 'disciplina', xp: 5 },
    });

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'habit').catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onHabitChange(user.id, user.plan);

    return NextResponse.json({ habit });
  } catch (error) {
    console.error('Habits POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { habitId } = await request.json();

    const habit = await db.habitLog.findFirst({ where: { id: habitId, userId: user.id } });
    if (!habit) return NextResponse.json({ error: 'Habit not found' }, { status: 404 });

    const today = new Date();
    const lastCompleted = habit.lastCompletedAt;
    let newStreak = habit.streak;

    if (lastCompleted) {
      const diffDays = Math.floor((today.getTime() - new Date(lastCompleted).getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return NextResponse.json({ error: 'Already completed today' }, { status: 400 });
      }
      newStreak = diffDays === 1 ? habit.streak + 1 : 1;
    } else {
      newStreak = 1;
    }

    const updated = await db.habitLog.update({
      where: { id: habitId },
      data: { streak: newStreak, lastCompletedAt: today },
    });

    // Track habit completion
    trackEvent({ event: 'habit_completed', userId: user.id, properties: { habitId, streak: newStreak } });

    // Award XP to disciplina empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
      update: { xp: { increment: 10 }, streak: { increment: 1 } },
      create: { userId: user.id, empire: 'disciplina', xp: 10, streak: 1 },
    });

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'habit').catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onHabitChange(user.id, user.plan);

    return NextResponse.json({ habit: updated });
  } catch (error) {
    console.error('Habits PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { habitId, name, description, frequency } = body;
    console.log('[CRUD DEBUG] Habits PUT - habitId:', habitId, 'userId:', user.id);

    const habit = await db.habitLog.findUnique({ where: { id: habitId } });
    if (!habit) return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    if (habit.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await db.habitLog.update({
      where: { id: habitId },
      data: { name, description, frequency },
    });

    return NextResponse.json({ habit: updated });
  } catch (error) {
    console.error('Habits PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { habitId } = body;
    console.log('[CRUD DEBUG] Habits DELETE - habitId:', habitId, 'userId:', user.id);

    await db.habitLog.deleteMany({ where: { id: habitId, userId: user.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Habits DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
