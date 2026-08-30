export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════════════════════
// GET /api/analytics/insights
// Query analytics data for admin/dashboard viewing.
// Requires authentication. Returns aggregated metrics.
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // BUG-A2 FIX: Restrict platform analytics to PREMIUM users only.
    // Previously, any authenticated user (including FREE) could access
    // platform-wide DAU, retention, conversion funnel, and feature usage.
    // This is business intelligence that should not be publicly accessible.
    // PREMIUM is used as the gate because the User model has no role field.
    if (user.plan !== 'PREMIUM') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const daysRaw = parseInt(searchParams.get('days') || '30', 10);
    const days = Math.max(1, Math.min(90, daysRaw || 30));

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // PERF-5.2: Aggregate in DB instead of loading all events into memory.
    // Previous approach: fetchMany ALL events (potentially millions of rows),
    // then aggregate in JS with Sets per event type and per day.
    // New approach: three targeted groupBy queries (event counts, DAU per day,
    // unique users) — DB does the heavy lifting, only tiny result sets in memory.

    // P5/P6: Exclude rate-limiting events (rl:*) from product metrics.
    // These are internal infrastructure events, not user-facing product events.
    const productEventFilter = {
      createdAt: { gte: since } as const,
      event: { not: { startsWith: 'rl:' } } as const,
    };

    // ─── Event counts + unique users per event (single query) ──
    const eventAgg = await db.analyticsEvent.groupBy({
      by: ['event'],
      where: productEventFilter,
      _count: { id: true, userId: true },
    });

    // eventCounts: { event_name: total_count }
    const eventCounts: Record<string, number> = {};
    // uniqueUsersPerEvent needs a separate query (GROUP BY event, userId then count)
    for (const row of eventAgg) {
      eventCounts[row.event] = row._count.id;
    }

    // ─── Unique users per event type (raw SQL COUNT DISTINCT) ──
    // PERF-5.2: Previously materialized ALL (event, userId) pairs into JS
    // then counted. Now the DB does the counting — only tiny result set.
    const uniquePerEventRows = await db.$queryRaw<Array<{ event: string; unique_users: bigint }>>`
      SELECT event, COUNT(DISTINCT "userId")::bigint AS unique_users
      FROM "AnalyticsEvent"
      WHERE "createdAt" >= ${since} AND "userId" IS NOT NULL AND event NOT LIKE 'rl:%'
      GROUP BY event
    `;
    const uniqueUsersPerEvent: Record<string, number> = {};
    for (const row of uniquePerEventRows) {
      uniqueUsersPerEvent[row.event] = Number(row.unique_users);
    }

    // ─── DAU trend (daily_session events: COUNT DISTINCT per day) ──
    // PERF-5.2: Previously materialized ALL (day, userId) pairs into a JS Map<day, Set>,
    // which for 90 days × thousands of users could be tens of thousands of rows.
    // Now the DB computes COUNT(DISTINCT userId) per day — only ~90 rows returned.
    const dauRows = await db.$queryRaw<Array<{ day: string; dau: bigint }>>`
      SELECT DATE("createdAt" AT TIME ZONE 'UTC') as day, COUNT(DISTINCT "userId")::bigint AS dau
      FROM "AnalyticsEvent"
      WHERE "createdAt" >= ${since} AND "event" = 'daily_session' AND "userId" IS NOT NULL
      GROUP BY day
      ORDER BY day
    `;
    const dauTrend = dauRows.map(row => ({ date: row.day, dau: Number(row.dau) }));

    // ─── Total unique users (single COUNT DISTINCT query) ──
    // PERF-5.2: Previously materialized one row per unique userId.
    // Now DB returns a single scalar.
    const totalUniqueResult = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT "userId")::bigint AS count
      FROM "AnalyticsEvent"
      WHERE "createdAt" >= ${since} AND "userId" IS NOT NULL AND event NOT LIKE 'rl:%'
    `;
    const totalUniqueUsers = Number(totalUniqueResult[0]?.count ?? 0);

    // ─── Total event count (single query, excludes rl:*) ──
    const totalEvents = await db.analyticsEvent.count({
      where: productEventFilter,
    });

    // ─── Retention (registered users still active) ──
    // PERF-5.2: Use a single SQL query with COUNT(DISTINCT ... INTERSECT)
    // instead of materializing two full sets and computing intersection in JS.
    const registeredCount = eventCounts['user_registered'] || 0;
    const retainedResult = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT a."userId")::bigint AS count
      FROM "AnalyticsEvent" a
      WHERE a."createdAt" >= ${since}
        AND a."userId" IS NOT NULL
        AND a.event = 'user_registered'
        AND EXISTS (
          SELECT 1 FROM "AnalyticsEvent" b
          WHERE b."userId" = a."userId"
            AND b."createdAt" >= ${since}
            AND b."userId" IS NOT NULL
            AND b.event NOT LIKE 'rl:%'
            AND b.event != 'user_registered'
        )
    `;
    const retainedCount = Number(retainedResult[0]?.count ?? 0);

    // ─── Feature usage ranking ──
    const featureUsage = Object.entries(eventCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([event, count]) => ({
        event,
        count,
        uniqueUsers: uniqueUsersPerEvent[event] || 0,
      }));

    // ─── Funnel ──
    const funnel = {
      registered: eventCounts['user_registered'] || 0,
      onboarding_completed: eventCounts['onboarding_completed'] || 0,
      email_verified: eventCounts['email_verified'] || 0,
      checkin_created: eventCounts['checkin_created'] || 0,
      habit_completed: eventCounts['habit_completed'] || 0,
      mentor_used: eventCounts['mentor_used'] || 0,
      premium_upgrade_clicked: eventCounts['premium_upgrade_clicked'] || 0,
      premium_upgrade_completed: eventCounts['premium_upgrade_completed'] || 0,
    };

    return NextResponse.json({
      period: { days, from: since.toISOString() },
      totalEvents,
      uniqueUsers: totalUniqueUsers,
      eventCounts,
      dauTrend,
      retention: {
        registered: registeredCount,
        stillActive: retainedCount,
        rate: registeredCount > 0
          ? Math.round((retainedCount / registeredCount) * 100)
          : 0,
      },
      featureUsage,
      funnel,
    });
  } catch (error) {
    console.error('[Analytics] Insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
