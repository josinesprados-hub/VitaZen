export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { WIDGET_TYPES, WIDGET_TTL_MS, MIN_REFRESH_INTERVAL_MS, WidgetType, WidgetConfigResponse } from '@/lib/widgets/types';

// ═══════════════════════════════════════════
// GET /api/widgets/config
// Get widget configuration for the current user
// ═══════════════════════════════════════════
//
// Returns:
//   - Available widget types
//   - Per-type TTL (for client cache management)
//   - Minimum refresh interval
//   - User plan (for premium feature gating)
//
// This endpoint should be called ONCE when the widget is first configured,
// not on every widget refresh. The TTL values can be cached client-side.

export async function GET(request: NextRequest) {
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

    // ── Build config response ──
    const config: WidgetConfigResponse = {
      availableTypes: WIDGET_TYPES,
      ttlSeconds: Object.fromEntries(
        WIDGET_TYPES.map(type => [type, Math.floor(WIDGET_TTL_MS[type as WidgetType] / 1000)]),
      ) as WidgetConfigResponse['ttlSeconds'],
      minRefreshIntervalSec: Math.floor(MIN_REFRESH_INTERVAL_MS / 1000),
      plan: user.plan,
    };

    // Cache this response for a long time — config rarely changes
    const response = NextResponse.json(config);
    response.headers.set('Cache-Control', 'private, max-age=3600'); // 1 hour cache

    return response;
  } catch (error) {
    console.error('[Widgets] Config error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
