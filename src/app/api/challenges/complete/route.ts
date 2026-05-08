export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { challengeId } = await request.json();

    const userChallenge = await db.userChallenge.findFirst({
      where: { userId: user.id, challengeId, completed: false },
    });

    if (!userChallenge) {
      return NextResponse.json({ error: 'Challenge not found or already completed' }, { status: 404 });
    }

    const updated = await db.userChallenge.update({
      where: { id: userChallenge.id },
      data: { completed: true, completedAt: new Date() },
    });

    // Award XP to disciplina empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
      update: { xp: { increment: 25 } },
      create: { userId: user.id, empire: 'disciplina', xp: 25 },
    });

    return NextResponse.json({ challenge: updated });
  } catch (error) {
    console.error('Challenge complete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
