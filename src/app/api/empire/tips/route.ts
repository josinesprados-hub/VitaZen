export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getDeterministicTips } from '@/lib/server/tips-server';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
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

    // Try server-side deterministic rotation. If it fails (e.g. DB error in
    // emotional dashboard state), fall back to returning raw tips so the
    // client can still display something. NEVER return empty if tips exist.
    let rotatedFreeTips: typeof allTips = [];
    let rotatedPremiumTips: typeof allTips = [];

    try {
      const result = await getDeterministicTips(user.id, empire, allTips);
      rotatedFreeTips = result.freeTips;
      rotatedPremiumTips = result.premiumTips;
    } catch (rotationError) {
      console.error('[Tips] Deterministic rotation failed — using raw fallback:', rotationError);
      // Fallback: return first 2 FREE and first 1 PREMIUM from raw tips
      rotatedFreeTips = allTips.filter(t => t.plan !== 'PREMIUM').slice(0, 2);
      rotatedPremiumTips = allTips.filter(t => t.plan === 'PREMIUM').slice(0, 1);
    }

    return NextResponse.json({
      tips: allTips,
      rotatedFreeTips,
      rotatedPremiumTips,
    });
  } catch (error) {
    console.error('Empire tips GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
