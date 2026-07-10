export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════
// POST /api/analytics/track
// Receives analytics events from the client.
// Privacy-first: only accepts whitelisted events,
// no fingerprinting, no PII stored.
// ═══════════════════════════════════════════════════════════

const VALID_EVENTS = new Set([
  'daily_session',
  'recap_opened',
]);

export async function POST(request: NextRequest) {
  try {
    const { event, properties } = await request.json();

    if (!event || !VALID_EVENTS.has(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
    }

    // Try to identify user from Bearer token (optional)
    let userId: string | undefined;
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const user = await getAuthUser(authHeader.split('Bearer ')[1]);
        if (user) userId = user.id;
      } catch {
        // User not authenticated — still track anonymously
      }
    }

    // Deduplicate daily_session: only one per user per calendar day
    if (event === 'daily_session' && userId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existing = await db.analyticsEvent.findFirst({
        where: {
          event: 'daily_session',
          userId,
          createdAt: { gte: today, lt: tomorrow },
        },
        select: { id: true },
      });

      if (existing) {
        return NextResponse.json({ tracked: false, reason: 'already_tracked_today' });
      }
    }

    await db.analyticsEvent.create({
      data: {
        event,
        userId: userId || null,
        properties: properties ? JSON.stringify(properties) : null,
      },
    });

    return NextResponse.json({ tracked: true });
  } catch (error) {
    console.error('[Analytics] Track error:', error);
    // Return success anyway — analytics never break UX
    return NextResponse.json({ tracked: false });
  }
}
