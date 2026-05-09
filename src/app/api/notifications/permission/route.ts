export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/notifications/permission — Track browser permission state change
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { permissionState } = body;

    if (!['granted', 'denied', 'default'].includes(permissionState)) {
      return NextResponse.json({ error: 'Invalid permission state' }, { status: 400 });
    }

    // If denied, disable push in preferences and deactivate tokens
    if (permissionState === 'denied') {
      await db.notificationPreference.upsert({
        where: { userId: user.id },
        update: { pushEnabled: false },
        create: { userId: user.id, pushEnabled: false },
      });

      await db.pushToken.updateMany({
        where: { userId: user.id },
        data: { active: false },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Permission tracking error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
