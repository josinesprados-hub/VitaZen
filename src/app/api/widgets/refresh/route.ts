export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { refreshWidgetSnapshot } from '@/lib/widgets/refresh';
import { WIDGET_TYPES, WidgetType } from '@/lib/widgets/types';
import { trackWidgetApiError, trackWidgetRefreshRateLimit } from '@/lib/observability/tracking';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

// ═══════════════════════════════════════════
// POST /api/widgets/refresh
// Manually trigger a widget snapshot refresh
// ═══════════════════════════════════════════
//
// Rate-limited to prevent battery drain:
//   - Min 5 minutes between refreshes per widget type
//   - Max 12 refreshes per widget type per day
//
// This endpoint exists for "pull to refresh" gestures in widgets.
// Most refreshes should happen automatically via trigger hooks.

export async function POST(request: NextRequest) {
  try {
    // ── Auth ──
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // ── HTTP rate limit (on top of internal widget refresh rate limit) ──
    const rl = await rateLimit(user.id, 'widgets:refresh', RATE_LIMITS['widgets:refresh']);
    if (rl.limited) return rateLimitedResponse(rl);

    // ── Parse request ──
    const body = await request.json();
    const { type } = body;

    if (!type || !WIDGET_TYPES.includes(type as WidgetType)) {
      return NextResponse.json(
        { error: 'Invalid widget type', validTypes: WIDGET_TYPES },
        { status: 400 },
      );
    }

    const widgetType = type as WidgetType;

    // ── Attempt refresh (rate-limited internally) ──
    const result = await refreshWidgetSnapshot(user.id, widgetType, user.plan);

    // Track rate limit hits
    if (!result.refreshed && result.reason) {
      trackWidgetRefreshRateLimit(widgetType, result.reason);
    }

    const status = result.refreshed ? 200 : 429;

    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('[Widgets] Refresh error:', error);
    trackWidgetApiError('refresh', 500, error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
