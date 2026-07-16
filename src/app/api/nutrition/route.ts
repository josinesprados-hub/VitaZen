export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onEnergiaChange } from '@/lib/widgets/triggers';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries } from '@/lib/dates';

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

    // E-3 FIX (race condition + double streak from wellness+nutrition).
    // The original code did `findUnique(date) → upsert → if (!existing) award
    // XP+streak` as three separate operations with no transaction. Two
    // concurrent POSTs could both pass the findUnique check (both see null),
    // both succeed on the upsert (ON CONFLICT DO UPDATE), and BOTH award +10
    // XP and +1 streak — inflating energia progress. This is the same race
    // class as M-3 (checkin) and H-3 (habits).
    //
    // Additionally, even without concurrency, wellness and nutrition POSTs
    // BOTH independently increment energia.streak when their respective log
    // type is first-of-day. A user logging wellness today (+1 streak) AND
    // nutrition today (+1 streak) got energia.streak = 2 for a single Madrid
    // day. This contradicts the Disciplina H-10 fix ("streak must only
    // increment once per active day, not once per habit completion") and the
    // Mente M-1 fix ("streak per active day, not per session").
    //
    // Fix: acquire a transaction-scoped advisory lock keyed on (userId, today)
    // BEFORE reading or writing. Then check if ANY energia log (wellness OR
    // nutrition) already exists for today. Only increment streak if none
    // exists. XP still increments per log (wellness +10, nutrition +10).
    // The advisory lock serializes concurrent wellness POSTs, concurrent
    // nutrition POSTs, AND cross-type races (wellness POST racing with
    // nutrition POST) — all share the same (userId, today) key.
    //
    // The advisory lock key MUST match the one used in wellness/route.ts so
    // that cross-type races are serialized correctly. The key includes the
    // literal 'energia' to namespace it.
    // FINAL-3 FIX: Use logDateKey (from the client-provided date) instead of
    // todayDateKey, mirroring the finance/route.ts pattern and matching
    // the wellness/route.ts fix.
    const logDate = new Date(date);
    const logDateKey = getMadridDateKey(logDate);
    const { start, end } = madridDayBoundaries(logDateKey);

    const log = await db.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock on (userId, logDateKey).
      // Key MUST match the one in wellness/route.ts so cross-type POSTs are
      // serialized.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|energia|' || ${logDateKey}), 1, 16))::bit(64)::bigint
        )`;

      const existing = await tx.nutritionLog.findUnique({
        where: { userId_date: { userId: user.id, date: logDate } },
      });

      const result = await tx.nutritionLog.upsert({
        where: { userId_date: { userId: user.id, date: logDate } },
        update: { meals, water, calories, notes },
        create: { userId: user.id, date: logDate, meals, water, calories, notes },
      });

      // Award XP and streak to energia empire only on first creation (not on
      // updates). The streak is only incremented if no OTHER energia log
      // (wellness OR nutrition) exists for today — so the first log of either
      // type triggers the streak, and the second type only adds XP.
      if (!existing) {
        const otherNutritionLogToday = await tx.nutritionLog.findFirst({
          where: {
            userId: user.id,
            id: { not: result.id },
            date: { gte: start, lt: end },
          },
          select: { id: true },
        });
        const otherWellnessLogToday = !otherNutritionLogToday ? await tx.wellnessLog.findFirst({
          where: {
            userId: user.id,
            date: { gte: start, lt: end },
          },
          select: { id: true },
        }) : null;
        const isFirstEnergiaLogToday = !otherNutritionLogToday && !otherWellnessLogToday;

        await tx.empireProgress.upsert({
          where: { userId_empire: { userId: user.id, empire: 'energia' } },
          update: {
            xp: { increment: 10 },
            ...(isFirstEnergiaLogToday ? { streak: { increment: 1 } } : {}),
          },
          create: { userId: user.id, empire: 'energia', xp: 10, streak: 1 },
        });
      }

      return result;
    });

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

    // E-1/E-2 FIX: Only revert the energia streak when the deleted log was the
    // one that triggered today's streak increment.
    // The POST fix (E-3) only increments the streak on the first energia log
    // (wellness OR nutrition) of each Madrid day. When a log from today is
    // deleted, we must check whether any OTHER energia log (wellness OR
    // nutrition) still exists for today. If yes, today was still an active day
    // (the streak should remain). If no, this log was the sole trigger for
    // today's increment — decrement the streak. Logs from previous days never
    // affect today's streak.
    //
    // The previous code always did `streak: max(0, streak - 1)` on every
    // DELETE, regardless of which day the log belonged to. Combined with the
    // double-increment from wellness+nutrition, the energia streak was a
    // meaningless number that drifted in both directions.
    //
    // The whole operation (delete + XP/streak revert) runs inside a transaction
    // so partial failures cannot leave inconsistent state (E-2).
    const todayDateKey = getTodayDateKey();
    await db.$transaction(async (tx) => {
      await tx.nutritionLog.delete({ where: { id: logId } });

      const energiaProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
      });
      if (!energiaProgress) return;

      // Determine whether the deleted log was for today (Madrid) and, if so,
      // whether any other energia log (wellness OR nutrition) still exists for
      // today.
      let decrementStreak = false;
      const logDateKey = getMadridDateKey(log.date);
      if (logDateKey === todayDateKey) {
        const { start, end } = madridDayBoundaries(todayDateKey);
        const otherNutritionToday = await tx.nutritionLog.findFirst({
          where: {
            userId: user.id,
            id: { not: logId },
            date: { gte: start, lt: end },
          },
          select: { id: true },
        });
        const otherWellnessToday = !otherNutritionToday ? await tx.wellnessLog.findFirst({
          where: {
            userId: user.id,
            date: { gte: start, lt: end },
          },
          select: { id: true },
        }) : null;
        decrementStreak = !otherNutritionToday && !otherWellnessToday;
      }

      await tx.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
        data: {
          xp: Math.max(0, energiaProgress.xp - 10),
          ...(decrementStreak ? { streak: Math.max(0, energiaProgress.streak - 1) } : {}),
        },
      });
    });

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Nutrition DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
