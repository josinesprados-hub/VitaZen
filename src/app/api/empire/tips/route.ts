import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const empire = searchParams.get('empire');

    if (!empire) {
      return NextResponse.json({ error: 'empire parameter required' }, { status: 400 });
    }

    // FREE users can only see FREE tips, PREMIUM see all
    const tips = await db.empireTip.findMany({
      where: {
        empire,
        ...(user.plan === 'FREE' ? { plan: 'FREE' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({ tips });
  } catch (error) {
    console.error('Empire tips GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
