import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/register', '/onboarding', '/api/auth/sync', '/api/auth/session', '/api/stripe/webhook'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
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
