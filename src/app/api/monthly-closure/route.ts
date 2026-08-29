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
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

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
    // M-18 FIX: Validate month format in GET (matches POST validation)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Formato de mes inválido (YYYY-MM)' }, { status: 400 });
    }
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

    const rl = await rateLimit(user.id, 'monthly-closure:post', RATE_LIMITS['monthly-closure:post']);
    if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

    const body = await request.json();
    const { month, reflection, markSummaryViewed } = body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 });
    }

    // F7.5-05 FIX: Validate reflection type and length.
    if (reflection !== undefined && reflection !== null) {
      if (typeof reflection !== 'string') {
        return NextResponse.json({ error: 'reflection must be a string' }, { status: 400 });
      }
      if (reflection.length > 10000) {
        return NextResponse.json({ error: 'Reflection too long (max 10,000 chars)' }, { status: 400 });
      }
    }

    // F7.5-06 FIX: Use upsert to prevent race condition on concurrent POSTs.
    // Previously: findUnique → create (two concurrent requests both see null,
    // both try to create → second fails with P2002 unique constraint violation).
    const updateData: Record<string, unknown> = {};
    if (reflection !== undefined) {
      updateData.reflection = reflection;
      updateData.reflectedAt = new Date();
    }
    if (markSummaryViewed) {
      updateData.summaryViewedAt = new Date();
    }

    if (Object.keys(updateData).length > 0) {
      await db.monthlyClosure.upsert({
        where: { userId_month: { userId: user.id, month } },
        update: updateData,
        create: {
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
// Élite users see full depth: evolution, memories, patterns.

function trimDigestForFree(digest: MonthlyDigest) {
  return {
    ...digest,
    evolution: null,  // Élite only
    memories: [],     // Élite only
  };
}
