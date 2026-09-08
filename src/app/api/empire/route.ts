export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { withTiming } from '@/lib/observability/api-timing';
import { serverLog } from '@/lib/observability/server-logger';
import { gateEmpireStreak } from '@/lib/streaks';

const XP_PER_LEVEL = 100;

async function handler(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // PERF-5.2: Add select — only 4 rows per user, but avoids returning
    // unused columns (id, userId, updatedAt).
    //
    // G-06 FIX: EmpireProgress.streak is a stored counter that used to be
    // frozen after inactivity and presented as "current" ("12d" on the
    // dashboard). The current value is now derived from REAL activity:
    // each empire's stored count is gated by the latest activity instant
    // of its own event source (same day definition its write path uses —
    // mente: completedAt, riqueza: createdAt, energia: log date,
    // disciplina: any habit's lastCompletedAt). No cron, no write-back:
    // inactivity turns the streak to 0 at read time. The stored rows and
    // all XP data remain untouched.
    const [progress, lastMeditation, lastFinance, lastWellness, lastNutrition, lastHabitCompletion] = await Promise.all([
      db.empireProgress.findMany({
        where: { userId: user.id },
        select: {
          empire: true,
          xp: true,
          streak: true,
        },
      }),
      db.meditationSession.findFirst({
        where: { userId: user.id },
        orderBy: { completedAt: 'desc' },
        select: { completedAt: true },
      }),
      // F-4/G-03: the riqueza streak's day is defined by createdAt (server
      // clock) — never the user-supplied `date` field.
      db.financeLog.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      db.wellnessLog.findFirst({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      db.nutritionLog.findFirst({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      db.habitLog.findFirst({
        where: { userId: user.id, lastCompletedAt: { not: null } },
        orderBy: { lastCompletedAt: 'desc' },
        select: { lastCompletedAt: true },
      }),
    ]);

    // Latest energia activity = latest of (wellness, nutrition) log dates —
    // the energia streak counts a Madrid day with ≥1 log of either type (E-3).
    const energiaActivityCandidates = [lastWellness?.date, lastNutrition?.date]
      .filter((d): d is Date => d instanceof Date)
      .map((d) => d.getTime());
    const lastEnergiaActivity = energiaActivityCandidates.length > 0
      ? new Date(Math.max(...energiaActivityCandidates))
      : null;

    const lastActivityByEmpire: Record<string, Date | null> = {
      disciplina: lastHabitCompletion?.lastCompletedAt ?? null,
      mente: lastMeditation?.completedAt ?? null,
      riqueza: lastFinance?.createdAt ?? null,
      energia: lastEnergiaActivity,
      crecimiento: null, // no streak write path exists — always 0
    };

    // Calculate levels from XP
    const empires = progress.map((ep) => ({
      empire: ep.empire,
      level: Math.floor(ep.xp / XP_PER_LEVEL) + 1,
      xp: ep.xp,
      xpToNextLevel: XP_PER_LEVEL - (ep.xp % XP_PER_LEVEL),
      streak: gateEmpireStreak(ep.streak, lastActivityByEmpire[ep.empire] ?? null),
      progress: (ep.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100,
    }));

    return NextResponse.json({ empires });
  } catch (error) {
    serverLog.apiError('api/empire', 'GET', 500, error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withTiming('api/empire', handler);
