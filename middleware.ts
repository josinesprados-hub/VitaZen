import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
// GLOBAL-10 FIX: Use exact match for terminal routes and prefix match with
// trailing slash for routes that may have sub-paths. Previously, startsWith
// was used for all routes, which meant '/api/auth/sync' would also match
// '/api/auth/sync-malicious' — a latent security risk for future routes.
const publicRoutes = ['/login', '/register', '/onboarding', '/verify-email', '/privacy'];
const publicApiRoutes = [
  '/api/auth/sync',
  '/api/auth/session',
  '/api/auth/verify-email',
  '/api/auth/send-verification',
  '/api/auth/reset-password',
  '/api/stripe/webhook',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes (exact match for page routes, prefix for API routes)
  if (publicRoutes.includes(pathname) || publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }
  if (publicApiRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow static files and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/images') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // API routes handle their own auth via Bearer tokens
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // For dashboard routes, the client-side AuthContext handles redirects
  // This middleware is a fallback for direct URL access
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
