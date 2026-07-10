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

    // ─── Event counts ─────────────────────────────────────
    const events = await db.analyticsEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { event: true, createdAt: true, userId: true },
    });

    // ─── Aggregate by event type ──────────────────────────
    const eventCounts: Record<string, number> = {};
    const uniqueUsersPerEvent: Record<string, Set<string>> = {};

    for (const e of events) {
      eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
      if (e.userId) {
        if (!uniqueUsersPerEvent[e.event]) uniqueUsersPerEvent[e.event] = new Set();
        uniqueUsersPerEvent[e.event].add(e.userId);
      }
    }

    // ─── Daily active users (DAU) ─────────────────────────
    const dailySessions = events.filter(e => e.event === 'daily_session');
    const dauByDay: Record<string, Set<string>> = {};
    for (const s of dailySessions) {
      if (!s.userId) continue;
      const day = s.createdAt.toISOString().split('T')[0];
      if (!dauByDay[day]) dauByDay[day] = new Set();
      dauByDay[day].add(s.userId);
    }

    const dauTrend = Object.entries(dauByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, users]) => ({ date, dau: users.size }));

    // ─── Retention (simplified: day 1, 7, 30) ─────────────
    const registeredUsers = events
      .filter(e => e.event === 'user_registered' && e.userId)
      .map(e => ({ userId: e.userId!, date: e.createdAt }));

    const activeUsers = new Set(
      events.filter(e => e.event === 'daily_session' && e.userId).map(e => e.userId!)
    );

    const retainedUsers = registeredUsers.filter(r => activeUsers.has(r.userId));

    // ─── Feature usage ranking ────────────────────────────
    const featureUsage = Object.entries(eventCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([event, count]) => ({
        event,
        count,
        uniqueUsers: uniqueUsersPerEvent[event]?.size || 0,
      }));

    // ─── Funnel: registration → onboarding → checkin → premium ─
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
      totalEvents: events.length,
      uniqueUsers: new Set(events.filter(e => e.userId).map(e => e.userId)).size,
      eventCounts,
      dauTrend,
      retention: {
        registered: registeredUsers.length,
        stillActive: retainedUsers.length,
        rate: registeredUsers.length > 0
          ? Math.round((retainedUsers.length / registeredUsers.length) * 100)
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
