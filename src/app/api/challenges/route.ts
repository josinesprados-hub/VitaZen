export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfTodayMadrid } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const today = startOfTodayMadrid();

    // Check if user already has a challenge for today
    let userChallenge = await db.userChallenge.findFirst({
      where: { userId: user.id, date: today },
      include: { challenge: true },
    });

    if (!userChallenge) {
      // Get IDs of recent challenges to avoid repetition
      const recentChallenges = await db.userChallenge.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: 7,
        select: { challengeId: true },
      });

      const excludeIds = recentChallenges.map((rc) => rc.challengeId);

      // PERF-5.2: Use count + skip for O(1) random selection instead of
      // loading all challenge rows into memory and picking one.
      const totalCount = excludeIds.length > 0
        ? await db.dailyChallenge.count({ where: { id: { notIn: excludeIds } } })
        : await db.dailyChallenge.count();
      if (totalCount === 0) {
        return NextResponse.json({ error: 'No challenges available' }, { status: 404 });
      }
      const skip = Math.floor(Math.random() * totalCount);
      const candidates = await db.dailyChallenge.findMany({
        where: excludeIds.length > 0 ? { id: { notIn: excludeIds } } : undefined,
        skip,
        take: 1,
      });
      const selectedChallenge = candidates[0];
      if (!selectedChallenge) {
        return NextResponse.json({ error: 'No challenges available' }, { status: 404 });
      }

      userChallenge = await db.userChallenge.create({
        data: { userId: user.id, challengeId: selectedChallenge.id, date: today },
        include: { challenge: true },
      });
    }

    return NextResponse.json({ challenge: userChallenge });
  } catch (error) {
    console.error('Challenges GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}