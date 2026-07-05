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

    // ── H-3 FIX: Race condition during habit completion ──
    // The original code performed a read (findFirst) → compute → write (update)
    // without any locking. Two concurrent PATCH requests for the same habitId
    // could both read the same stale data, both pass the "already completed
    // today" check, and both increment the streak — causing a lost update.
    //
    // Fix: wrap the read-compute-write cycle in an interactive transaction
    // with SELECT FOR UPDATE to acquire a row-level exclusive lock. This
    // ensures that concurrent requests are serialized: the second request
    // blocks at SELECT FOR UPDATE until the first transaction commits, then
    // sees the updated lastCompletedAt and correctly returns 400.
    //
    // Alternatives discarded:
    //  A) Prisma $transaction without FOR UPDATE: does NOT prevent the race.
    //     PostgreSQL READ COMMITTED allows both transactions to read the same
    //     row concurrently before either writes — same TOCTOU vulnerability.
    //  B) Single atomic SQL UPDATE with CASE: possible but moves all streak
    //     logic into raw SQL, bypasses Prisma's type system, and can't
    //     cleanly return the "already completed today" error.
    //  C) Schema-level unique constraint on (userId, date): would prevent
    //     duplicates but requires schema changes — explicitly forbidden.
    const txResult = await db.$transaction(async (tx) => {
      // SELECT FOR UPDATE acquires a row-level exclusive lock.
      // Concurrent PATCH requests for the same habitId will block here
      // until this transaction commits or rolls back.
      const habits = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        name: string;
        description: string | null;
        frequency: string;
        streak: number;
        lastCompletedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>>`SELECT * FROM "HabitLog" WHERE "id" = ${habitId} AND "userId" = ${user.id} FOR UPDATE`;

      const habit = habits[0];
      if (!habit) return { status: 'not_found' as const };

      // Use Europe/Madrid timezone for day boundary calculation.
      // Without this, a user completing a habit at 00:30 Madrid (23:30 UTC)
      // would be considered "same day" as yesterday, breaking streak logic.
      const todayDateKey = getTodayDateKey();
      const lastCompleted = habit.lastCompletedAt;
      let newStreak = habit.streak;

      if (lastCompleted) {
        const lastDateKey = lastCompleted.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).split(' ')[0];
        // Compute day diff using date keys (timezone-aware)
        const todayMs = new Date(todayDateKey + 'T00:00:00').getTime();
        const lastMs = new Date(lastDateKey + 'T00:00:00').getTime();
        const diffDays = Math.round((todayMs - lastMs) / 86400000);
        // H-7 FIX: Completion guard respects frequency.
        // Before this fix, the guard only checked lastDateKey === todayDateKey (daily logic),
        // allowing weekly/monthly habits to be completed every day. Each daily completion
        // granted +10 XP and +1 empire streak, inflating progress.
        // Now: block if diffDays < threshold (within the same frequency period).
        //   daily=1: diffDays < 1 means same day → block (unchanged behavior)
        //   weekly=7: diffDays < 7 means same week → block
        //   monthly=30: diffDays < 30 means same month → block
        const streakThreshold: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
        const threshold = streakThreshold[habit.frequency] || 1;
        if (diffDays < threshold) {
          return { status: 'already_completed' as const };
        }
        // H-8 FIX: Streak continuation window must span the next valid period.
        // Previously used diffDays <= threshold, which for weekly/monthly habits
        // meant the streak only continued on the EXACT boundary day (diffDays=7 or 30).
        // Any deviation — even one day late — reset the streak to 1.
        // Correct logic: streak continues if completed within the next valid period
        // (i.e. diffDays < threshold * 2). A missed full period resets the streak.
        //   daily=1:  diffDays < 2  → same as before (yesterday continues streak)
        //   weekly=7: diffDays < 14 → days 7-13 continue streak (any day in next week)
        //   monthly=30: diffDays < 60 → days 30-59 continue streak (any day in next month)
        newStreak = diffDays < threshold * 2 ? habit.streak + 1 : 1;
      } else {
        newStreak = 1;
      }

      const updated = await tx.habitLog.update({
        where: { id: habitId },
        data: { streak: newStreak, lastCompletedAt: new Date() },
      });

      return { status: 'ok' as const, habit: updated };
    });

    if (txResult.status === 'not_found') return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    if (txResult.status === 'already_completed') return NextResponse.json({ error: 'Already completed today' }, { status: 400 });

    const updated = txResult.habit;

    // Track habit completion
    trackEvent({ event: 'habit_completed', userId: user.id, properties: { habitId, streak: updated.streak } });

    // Award XP to disciplina empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
      update: { xp: { increment: 10 }, streak: { increment: 1 } },
      create: { userId: user.id, empire: 'disciplina', xp: 10, streak: 1 },
    });

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'habit', updated.name).catch(() => {});

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
