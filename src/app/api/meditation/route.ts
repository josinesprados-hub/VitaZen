export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onMeditationChange } from '@/lib/widgets/triggers';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries } from '@/lib/dates';
import { VALID_MEDITATION_TYPES } from '@/lib/meditation-types';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const rl = await rateLimit(user.id, 'meditation:put', RATE_LIMITS['meditation:put']);
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { sessionId, duration, type } = body;
    // Verify the session belongs to the user before updating
    const session = await db.meditationSession.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // H-06 FIX: Validate duration and type (same as POST)
    // F7.5-03 FIX: Validate type using shared constant.
    if (duration !== undefined && (typeof duration !== 'number' || duration < 1 || duration > 1440)) {
      return NextResponse.json({ error: 'duration must be a number 1-1440 minutes' }, { status: 400 });
    }
    if (type !== undefined) {
      if (typeof type !== 'string' || !VALID_MEDITATION_TYPES.includes(type as any)) {
        return NextResponse.json({ error: 'Invalid meditation type' }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (duration !== undefined) updateData.duration = duration;
    if (type !== undefined) updateData.type = type;

    const updated = await db.meditationSession.update({
      where: { id: sessionId },
      data: updateData,
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

    const rl = await rateLimit(user.id, 'meditation:delete', RATE_LIMITS['meditation:delete']);
    if (rl.limited) return rateLimitedResponse(rl);

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
          const { start, end } = madridDayBoundaries(todayDateKey);
          const otherSessionToday = await tx.meditationSession.findFirst({
            where: {
              userId: user.id,
              id: { not: sessionId },
              completedAt: { gte: start, lt: end },
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

    const rl = await rateLimit(user.id, 'meditation:post', RATE_LIMITS['meditation:post']);
    if (rl.limited) return rateLimitedResponse(rl);

    const { duration, type } = await request.json();

    // H-06 FIX: Validate duration and type before DB write.
    // Previously zero validation — any value passed straight to DB.
    if (typeof duration !== 'number' || duration < 1 || duration > 1440) {
      return NextResponse.json({ error: 'duration must be a number 1-1440 minutes' }, { status: 400 });
    }
    if (typeof type !== 'string' || !VALID_MEDITATION_TYPES.includes(type as any)) {
      return NextResponse.json({ error: 'Invalid meditation type' }, { status: 400 });
    }

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
    const { start, end } = madridDayBoundaries(todayDateKey);

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
          completedAt: { gte: start, lt: end },
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
