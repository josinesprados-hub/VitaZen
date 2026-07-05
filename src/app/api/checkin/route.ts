export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { trackEvent } from '@/lib/analytics-server';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onCheckinChange } from '@/lib/widgets/triggers';
import { getTodayDateKey } from '@/lib/deterministic';

// ─── GET: today's checkin + history ─────────────────────

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode'); // "today" | "history" | "trends"

    // Today's checkin — use Europe/Madrid timezone to match user's perceived "today"
    if (mode === 'today' || !mode) {
      const today = new Date(getTodayDateKey() + 'T00:00:00');

      const todayCheckin = await db.dailyCheckin.findUnique({
        where: { userId_date: { userId: user.id, date: today } },
      });

      return NextResponse.json({ today: todayCheckin });
    }

    // History
    if (mode === 'history') {
      const days = Math.min(parseInt(searchParams.get('days') || '30'), 90);
      const checkins = await db.dailyCheckin.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: days,
      });

      return NextResponse.json({ checkins });
    }

    // Trends — last 14 days averages
    if (mode === 'trends') {
      const days = Math.min(parseInt(searchParams.get('days') || '14'), 30);
      const todayDate = new Date(getTodayDateKey() + 'T00:00:00');
      const since = new Date(todayDate);
      since.setDate(since.getDate() - days);

      const checkins = await db.dailyCheckin.findMany({
        where: { userId: user.id, date: { gte: since } },
        orderBy: { date: 'asc' },
      });

      if (checkins.length === 0) {
        return NextResponse.json({ trends: null });
      }

      const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

      const trends = {
        emotion: Math.round(avg(checkins.map(c => c.emotion)) * 10) / 10,
        energy: Math.round(avg(checkins.map(c => c.energy)) * 10) / 10,
        focus: Math.round(avg(checkins.map(c => c.focus)) * 10) / 10,
        stress: Math.round(avg(checkins.map(c => c.stress)) * 10) / 10,
        totalDays: checkins.length,
        daily: checkins.map(c => ({
          date: c.date.toISOString(),
          emotion: c.emotion,
          energy: c.energy,
          focus: c.focus,
          stress: c.stress,
        })),
      };

      return NextResponse.json({ trends });
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  } catch (error) {
    console.error('Checkin GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST: create today's checkin ───────────────────────

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { emotion, energy, focus, stress, intention, note } = await request.json();

    if (!emotion || !energy || !focus || !stress || !intention) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Use Europe/Madrid timezone — Vercel servers run UTC, so
    // new Date() at 00:30 Madrid = 23:30 UTC = wrong day.
    const today = new Date(getTodayDateKey() + 'T00:00:00');

    const checkin = await db.dailyCheckin.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: { emotion, energy, focus, stress, intention, note },
      create: { userId: user.id, date: today, emotion, energy, focus, stress, intention, note },
    });

    // Track checkin event
    trackEvent({ event: 'checkin_created', userId: user.id, properties: { emotion, energy, focus, stress } });

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'checkin').catch(() => {});

    // Award XP to mente empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'mente' } },
      update: { xp: { increment: 10 } },
      create: { userId: user.id, empire: 'mente', xp: 10 },
    });

    // Trigger widget snapshot refresh (non-blocking)
    onCheckinChange(user.id, user.plan);

    return NextResponse.json({ checkin });
  } catch (error) {
    console.error('Checkin POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT: update existing checkin ───────────────────────

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { checkinId, emotion, energy, focus, stress, intention, note } = await request.json();

    const existing = await db.dailyCheckin.findUnique({ where: { id: checkinId } });
    if (!existing) return NextResponse.json({ error: 'Checkin not found' }, { status: 404 });
    if (existing.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await db.dailyCheckin.update({
      where: { id: checkinId },
      data: { emotion, energy, focus, stress, intention, note },
    });

    return NextResponse.json({ checkin: updated });
  } catch (error) {
    console.error('Checkin PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE: remove a checkin ────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { checkinId } = await request.json();

    const existing = await db.dailyCheckin.findUnique({ where: { id: checkinId } });
    if (!existing) return NextResponse.json({ error: 'Checkin not found' }, { status: 404 });
    if (existing.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.dailyCheckin.delete({ where: { id: checkinId } });

    // Revert XP for mente empire (never below 0, don't create if missing)
    const menteProgress = await db.empireProgress.findUnique({
      where: { userId_empire: { userId: user.id, empire: 'mente' } },
    });
    if (menteProgress) {
      await db.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'mente' } },
        data: { xp: Math.max(0, menteProgress.xp - 10) },
      });
    }

    // Trigger widget snapshot refresh (non-blocking)
    onCheckinChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Checkin DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
