export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getWidgetSnapshot } from '@/lib/widgets/snapshot';
import { WIDGET_TYPES, WidgetType, WidgetResponse } from '@/lib/widgets/types';

// ═══════════════════════════════════════════
// GET /api/widgets/[type]
// Fetch widget snapshot data (O(1) read path)
// ═══════════════════════════════════════════
//
// This is the endpoint that iOS/Android widget clients call.
// It's designed to be:
//   - Fast: reads from cache/DB, no heavy computation
//   - Lightweight: returns minimal payloads
//   - Safe: serves stale data while revalidating in background
//
// Headers:
//   - Cache-Control: max-age based on widget TTL
//   - X-Widget-Stale: true if data is past TTL
//
// Rate limiting:
//   - Client-side: respect Cache-Control headers
//   - Server-side: stale-while-revalidate (never blocks)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
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

    // ── Validate widget type ──
    const { type } = await params;
    if (!WIDGET_TYPES.includes(type as WidgetType)) {
      return NextResponse.json(
        { error: 'Invalid widget type', validTypes: WIDGET_TYPES },
        { status: 400 },
      );
    }

    const widgetType = type as WidgetType;

    // ── Get snapshot (O(1) read path) ──
    const snapshot: WidgetResponse = await getWidgetSnapshot(
      user.id,
      widgetType,
      user.plan,
    );

    // ── Set cache headers based on widget TTL ──
    // This tells the widget client how long to wait before re-fetching
    const remainingTtl = Math.max(
      0,
      Math.floor((new Date(snapshot.expiresAt).getTime() - Date.now()) / 1000),
    );

    // Minimum cache of 60 seconds, even for stale data
    const cacheMaxAge = Math.max(60, remainingTtl);

    const response = NextResponse.json(snapshot);
    response.headers.set('Cache-Control', `private, max-age=${cacheMaxAge}, stale-while-revalidate=300`);
    response.headers.set('X-Widget-Stale', snapshot.stale ? 'true' : 'false');
    response.headers.set('X-Widget-Type', widgetType);
    response.headers.set('X-Widget-Computed-At', snapshot.computedAt);

    return response;
  } catch (error) {
    console.error('[Widgets] GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
