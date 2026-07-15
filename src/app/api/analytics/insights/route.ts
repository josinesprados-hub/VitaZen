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
    const days = Math.min(parseInt(searchParams.get('days') || '30'), 90);

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // PERF-5.2: Aggregate in DB instead of loading all events into memory.
    // Previous approach: fetchMany ALL events (potentially millions of rows),
    // then aggregate in JS with Sets per event type and per day.
    // New approach: three targeted groupBy queries (event counts, DAU per day,
    // unique users) — DB does the heavy lifting, only tiny result sets in memory.

    // ─── Event counts + unique users per event (single query) ──
    const eventAgg = await db.analyticsEvent.groupBy({
      by: ['event'],
      where: { createdAt: { gte: since } },
      _count: { id: true, userId: true },
    });

    // eventCounts: { event_name: total_count }
    const eventCounts: Record<string, number> = {};
    // uniqueUsersPerEvent needs a separate query (GROUP BY event, userId then count)
    for (const row of eventAgg) {
      eventCounts[row.event] = row._count.id;
    }

    // ─── Unique users per event type (separate groupBy) ──
    const uniquePerEvent = await db.analyticsEvent.groupBy({
      by: ['event', 'userId'],
      where: { createdAt: { gte: since }, userId: { not: null } },
      _count: { id: true },
    });
    const uniqueUsersPerEvent: Record<string, number> = {};
    for (const row of uniquePerEvent) {
      uniqueUsersPerEvent[row.event] = (uniqueUsersPerEvent[row.event] || 0) + 1;
    }

    // ─── DAU trend (daily_session events grouped by day) ──
    // PERF-5.2: Use raw SQL for DATE truncation (PostgreSQL-specific but this is
    // a Neon/PostgreSQL project). Prisma groupBy can't truncate timestamps.
    const dauRows = await db.$queryRaw<Array<{ day: string; user_id: string }>>`
      SELECT DATE("createdAt" AT TIME ZONE 'UTC') as day, "userId" as user_id
      FROM "AnalyticsEvent"
      WHERE "createdAt" >= ${since} AND "event" = 'daily_session' AND "userId" IS NOT NULL
      GROUP BY day, "userId"
    `;
    const dauMap: Record<string, Set<string>> = {};
    for (const row of dauRows) {
      if (!dauMap[row.day]) dauMap[row.day] = new Set();
      dauMap[row.day].add(row.user_id);
    }
    const dauTrend = Object.entries(dauMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, users]) => ({ date, dau: users.size }));

    // ─── Total unique users (single query) ──
    const totalUniqueResult = await db.analyticsEvent.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since }, userId: { not: null } },
    });
    const totalUniqueUsers = totalUniqueResult.length;

    // ─── Total event count (single query) ──
    const totalEvents = await db.analyticsEvent.count({
      where: { createdAt: { gte: since } },
    });

    // ─── Retention (simplified: registered users still active) ──
    const registeredCount = eventCounts['user_registered'] || 0;
    const activeUserIds = new Set(
      totalUniqueResult.map(r => r.userId).filter(Boolean)
    );
    // Count registered users who are also in the active set
    const registeredEvents = await db.analyticsEvent.findMany({
      where: { createdAt: { gte: since }, event: 'user_registered', userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    });
    const retainedCount = registeredEvents.filter(r => activeUserIds.has(r.userId!)).length;

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
