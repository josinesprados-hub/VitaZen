export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onMeditationChange } from '@/lib/widgets/triggers';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';

// M-1/M-2 helper: compute the UTC instants that bound the Madrid calendar day
// for the given Madrid date key (YYYY-MM-DD). Used by POST and DELETE so the
// "first meditation today" check aligns with the user's perceived day boundary
// (same approach as startOfMadridDay in insights.ts and the H-11 fix in habits).
function madridDayBoundaries(todayDateKey: string): { todayStart: Date; todayEnd: Date } {
  const madridNoonUtc = new Date(todayDateKey + 'T12:00:00Z');
  const parts = madridNoonUtc
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .split(' ')[1].split(':').map(Number);
  const msSinceMadridMidnight = (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  const todayStart = new Date(madridNoonUtc.getTime() - msSinceMadridMidnight);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  return { todayStart, todayEnd };
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { sessionId, duration, type } = body;
    // Verify the session belongs to the user before updating
    const session = await db.meditationSession.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await db.meditationSession.update({
      where: { id: sessionId },
      data: { duration, type },
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error('Meditation PUT error:', error);
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
    const { sessionId } = body;
    // Verify the session belongs to the user before deleting
    const session = await db.meditationSession.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // M-2 FIX: Only revert the mente streak when the deleted session was the
    // one that triggered today's streak increment.
    // The M-1 fix (POST) only increments the streak on the first meditation of
    // each Madrid day. When a session from today is deleted, we must check
    // whether any OTHER meditation session exists for today. If yes, today was
    // still an active day (the streak should remain). If no, this session was
    // the sole trigger for today's increment — decrement the streak.
    // Sessions from previous days never affect today's streak.
    //
    // The previous code always did `streak: max(0, streak - 1)` on every
    // DELETE, which combined with the per-session increment (M-1) made the
    // mente streak a meaningless number that drifted in both directions.
    //
    // The whole operation (delete + XP/streak revert) runs inside a transaction
    // so partial failures cannot leave inconsistent state (M-4/M-5).
    const todayDateKey = getTodayDateKey();
    await db.$transaction(async (tx) => {
      await tx.meditationSession.delete({ where: { id: sessionId } });

      const menteProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'mente' } },
      });
      if (!menteProgress) return;

      // Determine whether the deleted session was completed today (Madrid) and,
      // if so, whether any other session still exists for today.
      let decrementStreak = false;
      if (session.completedAt) {
        const sessionDateKey = getMadridDateKey(session.completedAt);
        if (sessionDateKey === todayDateKey) {
          const { todayStart, todayEnd } = madridDayBoundaries(todayDateKey);
          const otherSessionToday = await tx.meditationSession.findFirst({
            where: {
              userId: user.id,
              id: { not: sessionId },
              completedAt: { gte: todayStart, lt: todayEnd },
            },
            select: { id: true },
          });
          decrementStreak = !otherSessionToday;
        }
      }

      await tx.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'mente' } },
        data: {
          xp: Math.max(0, menteProgress.xp - 15),
          ...(decrementStreak ? { streak: Math.max(0, menteProgress.streak - 1) } : {}),
        },
      });
    });

    // Trigger widget snapshot refresh (non-blocking)
    onMeditationChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Meditation DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const sessions = await db.meditationSession.findMany({
      where: { userId: user.id },
      orderBy: { completedAt: 'desc' },
      take: 30,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Meditation GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { duration, type } = await request.json();

    // M-1 FIX: Empire streak must only increment once per active Madrid day,
    // not once per meditation session. The previous code did
    // `streak: { increment: 1 }` on every POST, so a user doing 5 meditations
    // in one day got streak=5. This contradicted the Disciplina H-10 fix
    // ("streak must only increment once per active day, not once per habit
    // completion"), the insights engine (which displays the streak as "X días
    // seguidos" — X consecutive days), and the mentor context (which tells
    // the AI mentor "racha X días").
    //
    // Fix: check if any OTHER meditation session exists for today (Madrid). If
    // yes, today was already an active day — only increment XP. If no, this is
    // the first session of the day — increment both XP and streak.
    //
    // The whole operation (session create + empire progress upsert) runs inside
    // a transaction so partial failures cannot leave inconsistent state (M-4).
    const todayDateKey = getTodayDateKey();
    const { todayStart, todayEnd } = madridDayBoundaries(todayDateKey);

    const session = await db.$transaction(async (tx) => {
      // CERT-1 FIX: Acquire transaction-scoped advisory lock on (userId, today)
      // before reading or writing. Without this lock, two concurrent POSTs
      // (e.g., mobile + desktop completing a meditation simultaneously) both
      // enter the transaction, both create a session, both run findFirst
      // (which doesn't see the other's uncommitted row under READ COMMITTED),
      // both see isFirstSessionToday=true, and both increment the mente streak.
      // This mirrors the pattern in checkin/route.ts:138-141.
      const lockSeed = user.id + '|' + todayDateKey;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${lockSeed}), 1, 16))::bit(64)::bigint
        )`;

      const created = await tx.meditationSession.create({
        data: { userId: user.id, duration, type },
      });

      // Check if any OTHER meditation session was already completed today
      // (in Madrid timezone). Query with the same Madrid-aware window used by
      // the H-10/H-11 fix in habits, so the streak check is consistent.
      const otherSessionToday = await tx.meditationSession.findFirst({
        where: {
          userId: user.id,
          id: { not: created.id },
          completedAt: { gte: todayStart, lt: todayEnd },
        },
        select: { id: true },
      });
      const isFirstSessionToday = !otherSessionToday;

      await tx.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'mente' } },
        update: {
          xp: { increment: 15 },
          ...(isFirstSessionToday ? { streak: { increment: 1 } } : {}),
        },
        create: { userId: user.id, empire: 'mente', xp: 15, streak: 1 },
      });

      return created;
    });

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'meditation').catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onMeditationChange(user.id, user.plan);

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Meditation POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
