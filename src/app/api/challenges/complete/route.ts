export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

/**
 * DEPRECATED: Manual challenge completion is NO LONGER ALLOWED.
 *
 * Challenges now auto-complete server-side when the user performs the
 * actual action (check-in, habit, meditation, journal). This endpoint
 * returns 403 to prevent cheating.
 *
 * See: /src/lib/challenge-auto-complete.ts
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Los desafíos se completan automáticamente al realizar la acción correspondiente' },
    { status: 403 }
  );
}
