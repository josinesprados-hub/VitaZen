// ═══════════════════════════════════════════
// /api/monthly-closure
// ═══════════════════════════════════════════
// GET  — Returns closure status + monthly digest
// POST — Saves reflection and/or marks summary viewed
//
// The reflection is NEVER sent to AI.
// NEVER analyzed. NEVER scored.
// It is private. Intimate. Human.
// ═══════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateMonthlyDigest, getPreviousMonthForClosure, isClosurePeriod, type MonthlyDigest } from '@/lib/monthly-closure/digest';

// ─── GET ───

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const month = request.nextUrl.searchParams.get('month') || getPreviousMonthForClosure();
    const isPremium = user.plan === 'PREMIUM';

    // Check if closure exists
    const closure = await db.monthlyClosure.findUnique({
      where: { userId_month: { userId: user.id, month } },
    });

    // Generate the digest (always fresh from real data)
    const digest = await generateMonthlyDigest(user.id, month);

    return NextResponse.json({
      month,
      closure: closure ? {
        reflection: closure.reflection,
        reflectedAt: closure.reflectedAt?.toISOString() || null,
        summaryViewedAt: closure.summaryViewedAt?.toISOString() || null,
      } : null,
      digest: isPremium ? digest : trimDigestForFree(digest),
      isPremium,
      isClosurePeriod: isClosurePeriod(),
    });
  } catch (error) {
    console.error('[Monthly Closure] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ───

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { month, reflection, markSummaryViewed } = body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    // Upsert the closure record
    const existing = await db.monthlyClosure.findUnique({
      where: { userId_month: { userId: user.id, month } },
    });

    if (existing) {
      const updateData: Record<string, unknown> = {};

      if (reflection !== undefined) {
        updateData.reflection = reflection;
        updateData.reflectedAt = new Date();
      }

      if (markSummaryViewed) {
        updateData.summaryViewedAt = new Date();
      }

      if (Object.keys(updateData).length > 0) {
        await db.monthlyClosure.update({
          where: { id: existing.id },
          data: updateData,
        });
      }
    } else {
      await db.monthlyClosure.create({
        data: {
          userId: user.id,
          month,
          reflection: reflection || null,
          reflectedAt: reflection ? new Date() : null,
          summaryViewedAt: markSummaryViewed ? new Date() : null,
        },
      });
    }

    return NextResponse.json({ ok: true, month });
  } catch (error) {
    console.error('[Monthly Closure] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── FREE trim ───
// FREE users see basic summary.
// Élite users see full depth: evolution, memories, connections.
//
// FREE connections: only profunda/relevante, max 1, no empire labels.
// Élite connections: all weights, up to 2, with empire context.

function trimDigestForFree(digest: MonthlyDigest) {
  // FREE: only show the strongest, most trustworthy connection
  const eliteConnections = digest.connections.filter(
    c => c.weight === 'profunda' || c.weight === 'relevante'
  );

  return {
    ...digest,
    evolution: null,                        // Élite only
    memories: [],                           // Élite only
    connections: eliteConnections.slice(0, 1), // FREE: max 1, high confidence only
  };
}
