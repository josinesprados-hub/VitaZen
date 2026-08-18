export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onHabitChange } from '@/lib/widgets/triggers';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries, startOfMadridDay } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // PERF-5.2: Safety cap — a user rarely manages >100 active habits.
    // take: 100 prevents unbounded growth while covering all realistic usage.
    const habits = await db.habitLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
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

    // H-06 FIX: Validate habit fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre del hábito es requerido' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'El nombre del hábito es demasiado largo (máx. 100 caracteres)' }, { status: 400 });
    }
    const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly'];
    if (frequency && !VALID_FREQUENCIES.includes(frequency)) {
      return NextResponse.json({ error: 'Frecuencia inválida (daily, weekly, monthly)' }, { status: 400 });
    }
    // H-06 FIX: Validate description length — previously unbounded, allowing
    // arbitrary data storage in the database.
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') return NextResponse.json({ error: 'La descripción debe ser texto' }, { status: 400 });
      if (description.length > 500) return NextResponse.json({ error: 'La descripción es demasiado larga (máx. 500 caracteres)' }, { status: 400 });
    }

    // H-05 FIX: Rate limit habit creation to 5 per day to prevent XP farming
    const todayStart = startOfMadridDay(getTodayDateKey());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const habitsCreatedToday = await db.habitLog.count({
      where: {
        userId: user.id,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });
    if (habitsCreatedToday >= 5) {
      return NextResponse.json(
        { error: 'Has alcanzado el límite de creación de hábitos por hoy (5)' },
        { status: 429 }
      );
    }

    // PERF-5.2: Wrap habit creation + XP award in a transaction to prevent
    // silent XP loss if the upsert fails after the habit is created.
    // This matches the pattern already used in checkin, meditation, wellness,
    // nutrition, finance, and journal POST routes.
    const habit = await db.$transaction(async (tx) => {
      const h = await tx.habitLog.create({
        data: { userId: user.id, name, description, frequency },
      });
      await tx.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
        update: { xp: { increment: 5 } },
        create: { userId: user.id, empire: 'disciplina', xp: 5 },
      });
      return h;
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
        const lastDateKey = getMadridDateKey(lastCompleted);
        // Compute day diff using date keys (timezone-aware)
        const todayMs = startOfMadridDay(todayDateKey).getTime();
        const lastMs = startOfMadridDay(lastDateKey).getTime();
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

      // H-10 FIX: Award XP + empire streak inside the transaction.
      // The empire streak must only increment once per active day, not once
      // per habit completion. A user with 3 daily habits completing all 3
      // on the same day should get streak=1 (one active day), not streak=3.
      // Check if any OTHER habit for this user was already completed today
      // (in Madrid timezone). If so, the empire streak was already incremented
      // for today — only increment XP.
      //
      // H-11 FIX: Compute the Madrid day boundaries as UTC instants.
      // `new Date(todayDateKey + 'T00:00:00')` (no Z suffix) is interpreted as
      // server-local time. On a UTC server this equals 02:00 Madrid (CEST) or
      // 01:00 Madrid (CET), NOT 00:00 Madrid. The query window was shifted 1-2
      // hours from the real Madrid day, so a habit completed at 00:30 Madrid
      // (= 22:30 UTC prev day) fell outside the window. If a second habit was
      // completed after 02:00 Madrid, the check found no prior completion and
      // incremented the streak again — double-incrementing the empire streak
      // for a single Madrid day. Now: derive the exact UTC instant of Madrid
      // midnight from the Madrid date key (same approach as startOfMadridDay
      // in insights.ts), so the DB query window matches the real Madrid day.
      const { start: todayStart, end: todayEnd } = madridDayBoundaries(todayDateKey);
      const otherCompletedToday = await tx.habitLog.findFirst({
        where: {
          userId: user.id,
          id: { not: habitId },
          lastCompletedAt: { gte: todayStart, lt: todayEnd },
        },
        select: { id: true },
      });
      const isFirstCompletionToday = !otherCompletedToday;

      await tx.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
        update: {
          xp: { increment: 10 },
          ...(isFirstCompletionToday ? { streak: { increment: 1 } } : {}),
        },
        create: { userId: user.id, empire: 'disciplina', xp: 10, streak: 1 },
      });

      return { status: 'ok' as const, habit: updated };
    });

    if (txResult.status === 'not_found') return NextResponse.json({ error: 'Hábito no encontrado' }, { status: 404 });
    if (txResult.status === 'already_completed') return NextResponse.json({ error: 'Ya completado en este período' }, { status: 400 });

    const updated = txResult.habit;

    // Track habit completion
    trackEvent({ event: 'habit_completed', userId: user.id, properties: { habitId, streak: updated.streak } });

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

    // H-06 FIX: Validate edited fields (same rules as POST)
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) return NextResponse.json({ error: 'name is required' }, { status: 400 });
      if (name.length > 100) return NextResponse.json({ error: 'name too long (max 100 chars)' }, { status: 400 });
    }
    if (frequency !== undefined) {
      const VALID_FREQUENCIES = ['daily', 'weekly', 'monthly'];
      if (!VALID_FREQUENCIES.includes(frequency)) return NextResponse.json({ error: 'Invalid frequency' }, { status: 400 });
    }
    if (description !== undefined && description !== null) {
      if (typeof description !== 'string') return NextResponse.json({ error: 'description must be a string' }, { status: 400 });
      if (description.length > 500) return NextResponse.json({ error: 'description too long (max 500 chars)' }, { status: 400 });
    }

    // H-9 FIX: Reset streak when frequency changes.
    // The streak value is frequency-dependent — a streak of 5 with weekly
    // frequency means "5 consecutive weekly completions", which is NOT
    // equivalent to "5 consecutive daily completions". Without resetting,
    // changing frequency from weekly to daily would preserve a streak earned
    // under weekly rules, inflating the daily streak and potentially
    // triggering achievements (habits_steady_14, hidden_habit_steady_30)
    // that were not legitimately earned under the new frequency.
    // lastCompletedAt is intentionally preserved: it prevents double-completion
    // within the same period (the guard uses the new frequency threshold).
    const data: Record<string, unknown> = { name, description, frequency };
    if (habit.frequency !== frequency) {
      data.streak = 0;
    }

    const updated = await db.habitLog.update({
      where: { id: habitId },
      data,
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

    const todayDateKey = getTodayDateKey();

    // H-12 FIX: Revert the empire streak when the deleted habit was the one
    // that triggered today's streak increment.
    // The H-10 check (PATCH endpoint) only increments the empire streak if no
    // OTHER habit was completed today. When a habit that was completed today is
    // deleted, its row disappears from the DB. A subsequent habit completion
    // would then see "no other habit completed today" and increment the streak
    // again — allowing a user to inflate the empire streak by repeatedly
    // creating + completing + deleting a habit on the same day.
    //
    // Fix: if the deleted habit was completed today (Madrid), check whether any
    // other habit was also completed today. If not, this habit was the one that
    // triggered today's streak increment — decrement the streak alongside the
    // XP revert. The whole operation (delete + XP/streak revert) runs inside a
    // transaction so partial failures cannot leave inconsistent state (M-4).
    await db.$transaction(async (tx) => {
      await tx.habitLog.delete({ where: { id: habitId } });

      const disciplinaProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
      });
      if (!disciplinaProgress) return;

      // Determine whether the deleted habit was completed today (Madrid) and,
      // if so, whether any other habit was also completed today.
      let decrementStreak = false;
      if (habit.lastCompletedAt) {
        const habitDateKey = getMadridDateKey(habit.lastCompletedAt);
        if (habitDateKey === todayDateKey) {
          // Use the same Madrid-aware day boundaries as the H-10/H-11 fix.
          const { start: todayStart, end: todayEnd } = madridDayBoundaries(todayDateKey);
          const otherCompletedToday = await tx.habitLog.findFirst({
            where: {
              userId: user.id,
              id: { not: habitId },
              lastCompletedAt: { gte: todayStart, lt: todayEnd },
            },
            select: { id: true },
          });
          decrementStreak = !otherCompletedToday;
        }
      }

      await tx.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
        data: {
          xp: Math.max(0, disciplinaProgress.xp - 5),
          ...(decrementStreak ? { streak: Math.max(0, disciplinaProgress.streak - 1) } : {}),
        },
      });
    });

    // Trigger widget snapshot refresh (non-blocking)
    onHabitChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Habits DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
