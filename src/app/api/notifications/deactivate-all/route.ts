export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/notifications/deactivate-all — Deactivate ALL push tokens for the user
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUserBasic(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Deactivate all tokens for this user
    await db.pushToken.updateMany({
      where: { userId: user.id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Deactivate all tokens error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}