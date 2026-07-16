import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── AUTH ARCHITECTURE ─────────────────────────────────────────────────
// VitaZen uses a client-side auth model:
// - API routes verify Firebase ID tokens via Authorization: Bearer header
//   (each route handler calls getAuthUser/getAuthUserBasic independently).
// - Page routes are protected by client-side AuthContext (Firebase onAuthStateChanged)
//   which redirects unauthenticated users to /login.
//
// This middleware exists as a lightweight edge guard ONLY for static assets
// and Next.js internals. It does NOT perform token verification because
// Firebase Admin SDK (required for token verification) is not available in
// Next.js Edge Runtime.
//
// Page-route protection at the edge would require either:
// (a) A JWT verification library compatible with Edge Runtime (new dependency), or
// (b) Rotating short-lived session cookies (architectural change).
// Both are out of scope for this security fix phase.
// ─────────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and Next.js internals (no auth needed)
  if (pathname.startsWith('/_next') || pathname.startsWith('/images') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // ─── H-01 FIX: Security headers ─────────────────────────────────────
  // The middleware cannot verify Firebase tokens (Edge Runtime limitation),
  // but it CAN inject security response headers on all non-static responses.
  // These headers are defense-in-depth measures that cost nothing and
  // mitigate entire classes of client-side attacks.
  const response = NextResponse.next();

  // Prevent MIME type sniffing — browsers must respect the declared Content-Type
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking — VitaZen is a web app, never embedded in iframes
  response.headers.set('X-Frame-Options', 'DENY');

  // Control referrer information leaked to external sites on navigation
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict browser features not used by VitaZen (camera, microphone, etc.)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  // HSTS: force HTTPS for 1 year, include subdomains
  // Only set in production — localhost development uses HTTP
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};