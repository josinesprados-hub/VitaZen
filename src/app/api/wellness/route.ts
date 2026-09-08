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

    const { searchParams } = new URL(request.url);
    // M-15 FIX: Validate days is a valid number before using it
    const daysParam = Math.max(parseInt(searchParams.get('days') || '30'), 1);
    if (isNaN(daysParam)) {
      return NextResponse.json({ error: 'El parámetro "days" debe ser un número' }, { status: 400 });
    }
    const days = Math.min(daysParam, 365);

    // PERF-5.2: Add select to reduce response payload size.
    // Previously returned ALL columns including id and createdAt for every row.
    const logs = await db.wellnessLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: days,
      select: {
        id: true,
        date: true,
        mood: true,
        energy: true,
        sleep: true,
        stress: true,
        notes: true,
      },
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

    const rl = await rateLimit(user.id, 'wellness:post', RATE_LIMITS['wellness:post']);
    if (rl.limited) return rateLimitedResponse(rl);

    const { date, mood, energy, sleep, stress, notes } = await request.json();

    // H-06 FIX: Validate all fields before DB write.
    // Previously zero validation — any type, any value passed straight to DB.
    if (!date || typeof date !== 'string') {
      return NextResponse.json({ error: 'Valid date string is required' }, { status: 400 });
    }
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }

    // G-02 FIX: enforce the approved backdating window for NEW writes
    // (Europe/Madrid): today, yesterday and the day before yesterday are
    // allowed; older dates and any future date are rejected. Previously the
    // client could send arbitrary dates and farm historical XP, historical
    // activity and artificial streaks. This check gates NEW creates only —
    // it never modifies, deletes or recalculates historical records, and it
    // does not affect reads (GET) or content updates (PUT).
    const logDateKey = getMadridDateKey(parsedDate);
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

    const SCORE_VALIDATOR = (val: unknown, name: string) => {
      if (val !== undefined && val !== null) {
        if (typeof val !== 'number' || !Number.isInteger(val) || val < 1 || val > 5) {
          return NextResponse.json({ error: `${name} must be an integer 1-5` }, { status: 400 });
        }
      }
      return null;
    };
    const scoreErr = SCORE_VALIDATOR(mood, 'mood') || SCORE_VALIDATOR(energy, 'energy') || SCORE_VALIDATOR(sleep, 'sleep') || SCORE_VALIDATOR(stress, 'stress');
    if (scoreErr) return scoreErr;
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string') return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
      if (notes.length > 2000) return NextResponse.json({ error: 'notes too long (max 2,000 chars)' }, { status: 400 });
    }
    const safeNotes = typeof notes === 'string' ? notes : null;

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
    // The date stored is the Madrid date key provided by the client (frontend
    // sends getTodayDateKey()). We compute the Madrid day window from the LOG's
    // date key so the "first log of this day" check matches the log's perceived
    // day — not necessarily today. This is consistent with the finance POST
    // pattern and prevents streak inflation when backdating logs.
    // FINAL-3 FIX: Use logDateKey (from the client-provided date) instead of
    // todayDateKey, mirroring the finance/route.ts pattern.
    // G-02 FIX: logDateKey is now computed once, right after date parsing,
    // where the approved window is enforced.
    const logDate = parsedDate;
    const { start, end } = madridDayBoundaries(logDateKey);

    const { result: log, created: logCreated } = await db.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock on (userId, logDateKey).
      // Key is derived from md5(userId || '|' || logDateKey) — first 8 bytes as a
      // bigint. Collisions are acceptable (worst case: two unrelated users
      // serialize unnecessarily).
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|energia|' || ${logDateKey}), 1, 16))::bit(64)::bigint
        )`;

      const existing = await tx.wellnessLog.findUnique({
        where: { userId_date: { userId: user.id, date: logDate } },
      });

      const result = await tx.wellnessLog.upsert({
        where: { userId_date: { userId: user.id, date: logDate } },
        update: { mood, energy, sleep, stress, notes: safeNotes },
        create: { userId: user.id, date: logDate, mood, energy, sleep, stress, notes: safeNotes },
      });

      // F-2 FIX: award XP and streak to the energia empire only on first
      // creation (not on updates), and ONLY for the FIRST energia log
      // (wellness OR nutrition) of this Madrid natural day. The day identity
      // comes from the log's Madrid date key (G-02-validated), never from the
      // raw instant. The same isFirstEnergiaLogToday flag that drives the
      // streak drives XP, computed cross-module inside the advisory-locked
      // transaction — so no sequence of timestamps can exceed +10 XP/day.
      if (!existing) {
        const otherEnergiaLogToday = await tx.wellnessLog.findFirst({
          where: {
            userId: user.id,
            id: { not: result.id },
            date: { gte: start, lt: end },
          },
          select: { id: true },
        });
        const otherNutritionLogToday = !otherEnergiaLogToday ? await tx.nutritionLog.findFirst({
          where: {
            userId: user.id,
            date: { gte: start, lt: end },
          },
          select: { id: true },
        }) : null;
        const isFirstEnergiaLogToday = !otherEnergiaLogToday && !otherNutritionLogToday;

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
    tryAutoCompleteChallenge(user.id, 'wellness').catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    // G-05 FIX: evaluate wellness achievements right after the write commits.
    // The POST always writes mood (create OR update), so hidden_wellness_all_moods
    // can complete on either path; the 'empire' domain is only relevant on the
    // create path (+10 XP). Best-effort and non-fatal.
    const newlyUnlocked = await evaluateAchievements(
      user.id,
      logCreated ? ['wellness', 'empire'] : ['wellness'],
    );

    return NextResponse.json({ log, newlyUnlocked });
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

    const rl = await rateLimit(user.id, 'wellness:put', RATE_LIMITS['wellness:put']);
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { logId, mood, energy, sleep, stress, notes } = body;
    const log = await db.wellnessLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // H-06 FIX: Validate field types and ranges (same as POST)
    if (mood !== undefined && mood !== null && (typeof mood !== 'number' || !Number.isInteger(mood) || mood < 1 || mood > 5)) {
      return NextResponse.json({ error: 'mood must be an integer 1-5' }, { status: 400 });
    }
    if (energy !== undefined && energy !== null && (typeof energy !== 'number' || !Number.isInteger(energy) || energy < 1 || energy > 5)) {
      return NextResponse.json({ error: 'energy must be an integer 1-5' }, { status: 400 });
    }
    if (sleep !== undefined && sleep !== null && (typeof sleep !== 'number' || !Number.isInteger(sleep) || sleep < 1 || sleep > 5)) {
      return NextResponse.json({ error: 'sleep must be an integer 1-5' }, { status: 400 });
    }
    if (stress !== undefined && stress !== null && (typeof stress !== 'number' || !Number.isInteger(stress) || stress < 1 || stress > 5)) {
      return NextResponse.json({ error: 'stress must be an integer 1-5' }, { status: 400 });
    }
    if (notes !== undefined && notes !== null) {
      if (typeof notes !== 'string') return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
      if (notes.length > 2000) return NextResponse.json({ error: 'notes too long (max 2,000 chars)' }, { status: 400 });
    }

    const updated = await db.wellnessLog.update({
      where: { id: logId },
      data: { mood, energy, sleep, stress, notes: typeof notes === 'string' ? notes : null },
    });

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    // G-05 FIX: the PUT can change `mood`, which can complete
    // hidden_wellness_all_moods. Wellness domain only (no XP here). Best-effort.
    const newlyUnlocked = await evaluateAchievements(user.id, ['wellness']);

    return NextResponse.json({ log: updated, newlyUnlocked });
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

    const rl = await rateLimit(user.id, 'wellness:delete', RATE_LIMITS['wellness:delete']);
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { logId } = body;
    const log = await db.wellnessLog.findUnique({ where: { id: logId } });
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
    // day is now empty of energia logs. (No advisory lock here by design —
    // DELETE locking is tracked separately as F-5, out of scope.)
    const todayDateKey = getTodayDateKey();
    await db.$transaction(async (tx) => {
      await tx.wellnessLog.delete({ where: { id: logId } });

      const energiaProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
      });
      if (!energiaProgress) return;

      // Determine the deleted log's Madrid natural day and check whether any
      // other energia log (wellness OR nutrition) still exists for that day.
      const logDateKey = getMadridDateKey(log.date);
      const { start: dayStart, end: dayEnd } = madridDayBoundaries(logDateKey);
      const otherWellnessSameDay = await tx.wellnessLog.findFirst({
        where: {
          userId: user.id,
          id: { not: logId },
          date: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      });
      const otherNutritionSameDay = !otherWellnessSameDay ? await tx.nutritionLog.findFirst({
        where: {
          userId: user.id,
          date: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      }) : null;
      const dayNowEmpty = !otherWellnessSameDay && !otherNutritionSameDay;

      // F-2: revert the day's +10 only if the day is now empty; the streak is
      // only touched when the deleted log was today's AND the day is empty.
      const revertXp = dayNowEmpty;
      const decrementStreak = dayNowEmpty && logDateKey === todayDateKey;

      await tx.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'energia' } },
        data: {
          xp: Math.max(0, energiaProgress.xp - (revertXp ? 10 : 0)),
          ...(decrementStreak ? { streak: Math.max(0, energiaProgress.streak - 1) } : {}),
        },
      });
    });

    // Trigger widget snapshot refresh (non-blocking)
    onEnergiaChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Wellness DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
