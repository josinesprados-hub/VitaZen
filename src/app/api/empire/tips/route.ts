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

    // BUG-B6 FIX: Filter out PREMIUM tips for FREE users.
    // Previously, the endpoint returned ALL tips (FREE + PREMIUM content)
    // to any authenticated user. FREE users could read PREMIUM tip content
    // by inspecting the API response. Now, FREE users only receive FREE tips.
    const isPremium = user.plan === 'PREMIUM';
    const visibleTips = isPremium ? allTips : allTips.filter(t => t.plan !== 'PREMIUM');

    // Try server-side deterministic rotation. If it fails (e.g. DB error in
    // emotional dashboard state), fall back to returning raw tips so the
    // client can still display something. NEVER return empty if tips exist.
    //
    // B6-R1 FIX: For FREE users, rotatedPremiumTips must contain 1 Premium tip
    // with its content stripped (only id, title, plan). This allows the frontend
    // to render the locked Premium card (showing the title + lock + CTA) without
    // leaking the Premium content. The rotation algorithm is unchanged — the
    // same deterministic tip is selected; only the content field is stripped
    // for FREE users.
    let rotatedFreeTips: Array<{ id: string; title: string; content: string; plan: string; empire?: string; createdAt?: Date }> = [];
    let rotatedPremiumTips: Array<{ id: string; title: string; content: string; plan: string; empire?: string; createdAt?: Date }> = [];

    try {
      const result = await getDeterministicTips(user.id, empire, allTips);
      rotatedFreeTips = result.freeTips;
      if (isPremium) {
        rotatedPremiumTips = result.premiumTips;
      } else {
        // FREE user: strip content from the Premium tip — only id/title/plan
        // are needed to render the locked card. Content must never reach FREE.
        rotatedPremiumTips = result.premiumTips.map(t => ({
          ...t,
          content: '',
        }));
      }
    } catch (rotationError) {
      console.error('[Tips] Deterministic rotation failed — using raw fallback:', rotationError);
      // Fallback: return first 2 FREE and first 1 PREMIUM from raw tips
      rotatedFreeTips = allTips.filter(t => t.plan !== 'PREMIUM').slice(0, 2);
      if (isPremium) {
        rotatedPremiumTips = allTips.filter(t => t.plan === 'PREMIUM').slice(0, 1);
      } else {
        rotatedPremiumTips = allTips.filter(t => t.plan === 'PREMIUM').slice(0, 1).map(t => ({
          ...t,
          content: '',
        }));
      }
    }

    return NextResponse.json({
      tips: visibleTips,
      rotatedFreeTips,
      rotatedPremiumTips,
    });
  } catch (error) {
    console.error('Empire tips GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
