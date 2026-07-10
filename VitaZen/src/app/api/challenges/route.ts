export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTodayDateKey } from '@/lib/deterministic';
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

      // Select a random challenge, excluding recent ones
      const totalChallenges = await db.dailyChallenge.count();
      const availableChallenges = excludeIds.length > 0
        ? await db.dailyChallenge.findMany({
            where: { id: { notIn: excludeIds } },
          })
        : await db.dailyChallenge.findMany();

      const pool = availableChallenges.length > 0 ? availableChallenges : await db.dailyChallenge.findMany();
      const randomIndex = Math.floor(Math.random() * pool.length);
      const selectedChallenge = pool[randomIndex];

      if (!selectedChallenge) {
        return NextResponse.json({ error: 'No challenges available' }, { status: 404 });
      }

      userChallenge = await db.userChallenge.create({
        data: {
          userId: user.id,
          challengeId: selectedChallenge.id,
          date: today,
        },
        include: { challenge: true },
      });
    }

    return NextResponse.json({ challenge: userChallenge });
  } catch (error) {
    console.error('Challenges GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
