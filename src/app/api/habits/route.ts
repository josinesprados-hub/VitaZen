export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onHabitChange } from '@/lib/widgets/triggers';
import { getTodayDateKey } from '@/lib/deterministic';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
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
    tryAutoCompleteChallenge(user.id, 'habit', name).catch(() => {});

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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { habitId } = await request.json();

    const habit = await db.habitLog.findFirst({ where: { id: habitId, userId: user.id } });
    if (!habit) return NextResponse.json({ error: 'Habit not found' }, { status: 404 });

    // Use Europe/Madrid timezone for day boundary calculation.
    // Without this, a user completing a habit at 00:30 Madrid (23:30 UTC)
    // would be considered "same day" as yesterday, breaking streak logic.
    const todayDateKey = getTodayDateKey();
    const lastCompleted = habit.lastCompletedAt;
    let newStreak = habit.streak;

    if (lastCompleted) {
      const lastDateKey = lastCompleted.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).split(' ')[0];
      if (lastDateKey === todayDateKey) {
        return NextResponse.json({ error: 'Already completed today' }, { status: 400 });
      }
      // Compute day diff using date keys (timezone-aware)
      const todayMs = new Date(todayDateKey + 'T00:00:00').getTime();
      const lastMs = new Date(lastDateKey + 'T00:00:00').getTime();
      const diffDays = Math.round((todayMs - lastMs) / 86400000);
      // Respect frequency: daily=1 day, weekly=7 days, monthly=30 days
      const streakThreshold: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
      newStreak = diffDays <= (streakThreshold[habit.frequency] || 1) ? habit.streak + 1 : 1;
    } else {
      newStreak = 1;
    }

    const updated = await db.habitLog.update({
      where: { id: habitId },
      data: { streak: newStreak, lastCompletedAt: new Date() },
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
    tryAutoCompleteChallenge(user.id, 'habit', habit.name).catch(() => {});

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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { habitId, name, description, frequency } = body;
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
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { habitId } = body;
    const habit = await db.habitLog.findFirst({ where: { id: habitId, userId: user.id } });
    if (!habit) return NextResponse.json({ error: 'Habit not found' }, { status: 404 });

    await db.habitLog.delete({ where: { id: habitId } });

    // Revert XP for disciplina empire (only the +5 from creation, not completion XP)
    const disciplinaProgress = await db.empireProgress.findUnique({
      where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
    });
    if (disciplinaProgress) {
      await db.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
        data: { xp: Math.max(0, disciplinaProgress.xp - 5) },
      });
    }

    // Trigger widget snapshot refresh (non-blocking)
    onHabitChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Habits DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
