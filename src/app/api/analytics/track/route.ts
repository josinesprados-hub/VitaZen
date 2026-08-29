export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfTodayMadrid, startOfNextDayMadrid } from '@/lib/dates';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

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
    // M-05 FIX: Limit request body size to prevent DB bloat from abuse
    const bodyText = await request.text();
    if (bodyText.length > 2048) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    let event: string, properties: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(bodyText);
      event = parsed.event;
      properties = parsed.properties;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

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

    // Rate limit only for authenticated users
    if (userId) {
      const rl = await rateLimit(userId, 'analytics:track', RATE_LIMITS['analytics:track']);
      if (rl.limited) return rateLimitedResponse(rl);
    }

    // Deduplicate daily_session: only one per user per calendar day
    if (event === 'daily_session' && userId) {
      const today = startOfTodayMadrid();
      const tomorrow = startOfNextDayMadrid();

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
