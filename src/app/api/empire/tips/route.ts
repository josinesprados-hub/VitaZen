export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getDeterministicTips } from '@/lib/server/emotional-dashboard-state';

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

    // Fetch all tips from DB for this empire — no limit, need full battery
    const allTips = await db.empireTip.findMany({
      where: { empire },
      orderBy: [
        { plan: 'asc' },   // FREE first, then PREMIUM
        { createdAt: 'desc' },
      ],
    });

    // Server-side deterministic rotation — returns { freeTips, premiumTips }
    // already separated by plan. FREE tips come exclusively from FREE battery.
    // PREMIUM tips come exclusively from PREMIUM battery. No cross-contamination.
    const { freeTips, premiumTips } = await getDeterministicTips(user.id, empire, allTips);

    return NextResponse.json({
      tips: allTips,
      rotatedFreeTips: freeTips,
      rotatedPremiumTips: premiumTips,
    });
  } catch (error) {
    console.error('Empire tips GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
