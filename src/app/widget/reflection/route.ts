// ═══════════════════════════════════════════
// REFLECTION WIDGET — Standalone HTML Endpoint
// ═══════════════════════════════════════════
//
// Serves a complete, self-contained HTML page for the
// Reflection Widget. Designed for:
//   - iOS WidgetKit (WKWebView)
//   - Android Glance (WebView)
//   - PWA widget containers
//   - Browser iframes
//
// Authentication:
//   - Bearer token in Authorization header (standard)
//   - OR token query parameter (for widget webviews that can't set headers)
//
// The rendered HTML has:
//   - ZERO JavaScript (no CPU = no battery drain)
//   - ZERO external dependencies
//   - ZERO network requests after initial load
//   - System fonts only (no font loading)
//   - Complete inline CSS
//
// This is the most battery-efficient way to render a widget:
// one server round-trip, then pure static display.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getWidgetSnapshot } from '@/lib/widgets/snapshot';
import { renderReflectionWidget, WidgetSize } from '@/lib/widgets/render/reflection-html';
import { ReflectionWidgetPayload, WIDGET_TTL_MS } from '@/lib/widgets/types';

// ─── Auth Helper ────────────────────────────
//
// Widget webviews can't always set custom headers.
// Support token via query param as fallback.

function extractToken(request: NextRequest): string | null {
  // 1. Authorization header (preferred)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.split('Bearer ')[1];
  }

  // 2. Query parameter (for widget webviews)
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  if (tokenParam) {
    return tokenParam;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──
    const token = extractToken(request);
    if (!token) {
      return new NextResponse(
        renderErrorWidget('Acceso requerido'),
        {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      );
    }

    const user = await getAuthUser(token);
    if (!user) {
      return new NextResponse(
        renderErrorWidget('Sesión expirada'),
        {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        },
      );
    }

    // ── Parse size parameter ──
    const url = new URL(request.url);
    const sizeParam = url.searchParams.get('size') || 'medium';
    const size: WidgetSize = sizeParam === 'small' ? 'small' : 'medium';

    // ── Get snapshot data (O(1) read path) ──
    const snapshot = await getWidgetSnapshot(user.id, 'reflection', user.plan);
    const payload = snapshot.data as ReflectionWidgetPayload;

    // ── Render HTML ──
    const html = renderReflectionWidget({
      payload,
      size,
      plan: user.plan,
    });

    // ── Set response headers ──
    const ttlSeconds = Math.floor(WIDGET_TTL_MS.reflection / 1000);
    const remainingTtl = Math.max(60, Math.floor(
      (new Date(snapshot.expiresAt).getTime() - Date.now()) / 1000,
    ));

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `private, max-age=${remainingTtl}, stale-while-revalidate=300`,
        'X-Widget-Type': 'reflection',
        'X-Widget-Size': size,
        'X-Widget-Stale': snapshot.stale ? 'true' : 'false',
        'X-Widget-Computed-At': snapshot.computedAt,
      },
    });
  } catch (error) {
    console.error('[ReflectionWidget] Render error:', error);
    return new NextResponse(
      renderErrorWidget('Algo pasó'),
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }
}

// ─── Error State Widget ─────────────────────
//
// Even errors should feel calm and premium.
// No red error banners, no aggressive messages.

function renderErrorWidget(message: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="color-scheme" content="dark">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      background: #0C0C14;
      color: #8A8694;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-widget {
      text-align: center;
      padding: 24px;
    }
    .error-text {
      font-size: 13px;
      font-weight: 300;
      letter-spacing: 0.5px;
      opacity: 0.6;
    }
    .brand {
      margin-top: 16px;
      font-size: 8px;
      font-weight: 400;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #5A5666;
    }
  </style>
</head>
<body>
  <div class="error-widget">
    <div class="error-text">${message}</div>
    <div class="brand">VitaZen</div>
  </div>
</body>
</html>`;
}
