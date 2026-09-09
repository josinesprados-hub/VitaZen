export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { evaluateAchievements } from '@/lib/achievements';
import { onEnergiaChange } from '@/lib/widgets/triggers';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries } from '@/lib/dates';
import { checkLogDateWindow } from '@/lib/log-date-window';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

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

    const rl = await rateLimit(user.id, 'nutrition:post', RATE_LIMITS['nutrition:post']);
    if (rl.limited) return rateLimitedResponse(rl);

    const { date, meals, water, calories, notes } = await request.json();

    // F7.5-02 FIX: Validate all input fields (types, ranges, lengths).
    if (typeof date !== 'string' || !date.trim()) {
      return NextResponse.json({ error: 'date is required and must be a non-empty string' }, { status: 400 });
    }
    const logDate = new Date(date);
    if (isNaN(logDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    // G-02 FIX: enforce the approved backdating window for NEW writes
    // (Europe/Madrid): today, yesterday and the day before yesterday are
    // allowed; older dates and any future date are rejected. Previously the
    // client could send arbitrary dates and farm historical XP, historical
    // activity and artificial streaks. This check gates NEW creates only —
    // it never modifies, deletes or recalculates historical records, and it
    // does not affect reads (GET) or content updates (PUT).
    const logDateKey = getMadridDateKey(logDate);
    const windowCheck = checkLogDateWindow(logDateKey, getTodayDateKey());
    if (!windowCheck.ok) {
      return NextResponse.json(
        {
          error:
            windowCheck.reason === 'future'
              ? 'Date cannot be in the future'
              : 'Date cannot be more than 2 days in the past',
        },
        { status: 400 }
      );
    }
    if (water !== undefined && water !== null) {
      if (typeof water !== 'number' || !Number.isInteger(water) || water < 0 || water > 30) {
        return NextResponse.json({ error: 'water must be an integer 0-30' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'water is required' }, { status: 400 });
    }
    if (calories !== undefined && calories !== null) {
      if (typeof calories !== 'number' || calories < 0 || calories > 10000) {
        return NextResponse.json({ error: 'calories must be 0-10000' }, { status: 400 });
      }
    }
    if (meals !== undefined && meals !== null) {
      if (typeof meals !== 'string') return NextResponse.json({ error: 'meals must be a string' }, { status: 400 });
      if (meals.length > 5000) return NextResponse.json({ error: 'meals too long (max 5,000 chars)' }, { status: 400 });
    }
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string') return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
      if (notes.length > 2000) return NextResponse.json({ error: 'notes too long (max 2,000 chars)' }, { status: 400 });
    }

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
    // exists. The advisory lock serializes concurrent wellness POSTs,
    // concurrent nutrition POSTs, AND cross-type races (wellness POST racing
    // with nutrition POST) — all share the same (userId, today) key.
    //
    // F-2 FIX: XP is now ALSO a once-per-Madrid-day reward, gated by the SAME
    // isFirstEnergiaLogToday flag that drives the streak. `@@unique([userId,
    // date])` is an instant-based key, so a manipulated client could send two
    // different timestamps of the SAME Madrid day, create two rows, and farm
    // +10 XP twice. Now the first energia log of the day awards +10 XP and
    // every later log of the same day (wellness OR nutrition) awards +0 XP —
    // the exact G-03 finance/meditation pattern. Rows are still always saved
    // (history, stats, achievements); only the XP payout is day-gated.
    //
    // The advisory lock key MUST match the one used in wellness/route.ts so
    // that cross-type races are serialized correctly. The key includes the
    // literal 'energia' to namespace it.
    // FINAL-3 FIX: Use logDateKey (from the client-provided date) instead of
    // todayDateKey, mirroring the finance/route.ts pattern and matching
    // the wellness/route.ts fix.
    // G-02 FIX: logDateKey is now computed once, right after date parsing,
    // where the approved window is enforced.
    const { start, end } = madridDayBoundaries(logDateKey);

    const { result: log, created: logCreated } = await db.$transaction(async (tx) => {
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

      // F-2 FIX: award XP and streak to the energia empire only on first
      // creation (not on updates), and ONLY for the FIRST energia log
      // (wellness OR nutrition) of this Madrid natural day. The day identity
      // comes from the log's Madrid date key (G-02-validated), never from the
      // raw instant. The same isFirstEnergiaLogToday flag that drives the
      // streak drives XP, computed cross-module inside the advisory-locked
      // transaction — so no sequence of timestamps can exceed +10 XP/day.
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
            xp: { increment: isFirstEnergiaLogToday ? 10 : 0 },
            ...(isFirstEnergiaLogToday ? { streak: { increment: 1 } } : {}),
          },
          // Defensive create path: the row is normally created at signup; if
          // it is ever missing, only a genuinely first-of-day log may seed it
          // with the daily reward (mirrors the finance G-03 pattern).
          create: {
            userId: user.id,
            empire: 'energia',
            xp: isFirstEnergiaLogToday ? 10 : 0,
            streak: isFirstEnergiaLogToday ? 1 : 0,
          },
        });
      }

      return { result, created: !existing };
    });

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'nutrition').catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    // G-05 FIX: evaluate nutrition achievements right after the write commits.
    // Only the CREATE path changes achievement metrics (nutritionLog.count and
    // the +10 XP that can complete empire_all); the update path writes
    // meals/water/calories/notes, which no achievement condition reads, so no
    // evaluation is run there (G-05: no unnecessary evaluations). Best-effort.
    const newlyUnlocked = logCreated
      ? await evaluateAchievements(user.id, ['nutrition', 'empire'])
      : [];

    return NextResponse.json({ log, newlyUnlocked });
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

    const rl = await rateLimit(user.id, 'nutrition:put', RATE_LIMITS['nutrition:put']);
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { logId, meals, water, calories, notes } = body;

    // F7.5-08 FIX: Validate all input fields before DB write.
    if (water !== undefined && water !== null) {
      if (typeof water !== 'number' || !Number.isInteger(water) || water < 0 || water > 30) {
        return NextResponse.json({ error: 'water must be an integer 0-30' }, { status: 400 });
      }
    }
    if (calories !== undefined && calories !== null) {
      if (typeof calories !== 'number' || calories < 0 || calories > 10000) {
        return NextResponse.json({ error: 'calories must be 0-10000' }, { status: 400 });
      }
    }
    if (meals !== undefined && meals !== null) {
      if (typeof meals !== 'string') return NextResponse.json({ error: 'meals must be a string' }, { status: 400 });
      if (meals.length > 5000) return NextResponse.json({ error: 'meals too long (max 5,000 chars)' }, { status: 400 });
    }
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string') return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
      if (notes.length > 2000) return NextResponse.json({ error: 'notes too long (max 2,000 chars)' }, { status: 400 });
    }

    const log = await db.nutritionLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await db.nutritionLog.update({
      where: { id: logId },
      data: { meals, water, calories, notes },
    });

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    // G-05 NOTE: no achievement evaluation here on purpose. No achievement
    // condition reads meals/water/calories/notes, and this PUT never creates
    // rows or XP — there is nothing it can complete. (See evaluateAchievements.)

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

    const rl = await rateLimit(user.id, 'nutrition:delete', RATE_LIMITS['nutrition:delete']);
    if (rl.limited) return rateLimitedResponse(rl);

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
    //
    // F-2 FIX: XP revert is now day-coherent with the award. Since XP is a
    // once-per-Madrid-day reward, deleting a repeat log that never awarded XP
    // must NOT remove 10 XP. The day's +10 is reverted only when this delete
    // leaves the log's Madrid day (the same day definition the award uses)
    // with NO other energia log (wellness OR nutrition) — mirroring the
    // finance G-03 DELETE pattern. The streak keeps its existing semantics:
    // decremented only when the deleted log belongs to today (Madrid) and the
    // day is now empty of energia logs.
    //
    // F-5A FIX (concurrency): identical to the wellness DELETE — the operation
    // runs under the SAME advisory-lock family the POSTs use
    // ('user|energia|<logDateKey>'), keyed from the STORED row date
    // (getMadridDateKey(log.date)), never from a client-supplied value. A
    // nutrition DELETE of day D therefore collides with POST/DELETE wellness
    // and POST/DELETE nutrition of the same Madrid day and serializes with
    // them; different days never block each other. The reverts are single
    // atomic clamped SQL statements (GREATEST(0, value - 10)) that commute
    // with the POSTs' atomic `xp: { increment: 10 }` even across different
    // days — no lost update, no stale absolute write, no negative XP.
    const todayDateKey = getTodayDateKey();
    // The deleted log's Madrid natural day, derived from the REAL stored date.
    const logDateKey = getMadridDateKey(log.date);

    await db.$transaction(async (tx) => {
      // F-5A: same lock expression and key namespace as the POSTs — first
      // statement inside the transaction, before any read or write.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|energia|' || ${logDateKey}), 1, 16))::bit(64)::bigint
        )`;

      await tx.nutritionLog.delete({ where: { id: logId } });

      // Determine whether any OTHER energia log (wellness OR nutrition) still
      // exists for the deleted log's Madrid natural day (DST-exact window from
      // the canonical utilities, never a fixed 24h span).
      const { start: dayStart, end: dayEnd } = madridDayBoundaries(logDateKey);
      const otherNutritionSameDay = await tx.nutritionLog.findFirst({
        where: {
          userId: user.id,
          id: { not: logId },
          date: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      });
      const otherWellnessSameDay = !otherNutritionSameDay ? await tx.wellnessLog.findFirst({
        where: {
          userId: user.id,
          date: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      }) : null;
      const dayNowEmpty = !otherNutritionSameDay && !otherWellnessSameDay;

      // F-2 semantics kept: revert the day's +10 only if the day is now empty;
      // touch the streak only when the deleted log was today's AND empty.
      const revertXp = dayNowEmpty;
      const decrementStreak = dayNowEmpty && logDateKey === todayDateKey;

      // F-5A: atomic, clamped reverts (see comment above).
      if (revertXp) {
        await tx.$executeRaw`
          UPDATE "EmpireProgress"
          SET "xp" = GREATEST(0, "xp" - 10)
          WHERE "userId" = ${user.id} AND "empire" = 'energia'`;
      }
      if (decrementStreak) {
        await tx.$executeRaw`
          UPDATE "EmpireProgress"
          SET "streak" = GREATEST(0, "streak" - 1)
          WHERE "userId" = ${user.id} AND "empire" = 'energia'`;
      }
    });

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Nutrition DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
