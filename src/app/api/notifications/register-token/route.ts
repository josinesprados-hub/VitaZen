export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// POST /api/notifications/register-token — Register or refresh a push token
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
    const { token, platform, userAgent } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Valid FCM token is required' }, { status: 400 });
    }

    // Limit tokens per user to prevent abuse (max 5 devices)
    const existingTokens = await db.pushToken.count({
      where: { userId: user.id, active: true },
    });

    if (existingTokens >= 5) {
      // Deactivate oldest token
      const oldest = await db.pushToken.findFirst({
        where: { userId: user.id, active: true },
        orderBy: { createdAt: 'asc' },
      });
      if (oldest) {
        await db.pushToken.update({
          where: { id: oldest.id },
          data: { active: false },
        });
      }
    }

    // Upsert: if token exists, refresh it; otherwise create
    const upserted = await db.pushToken.upsert({
      where: { token },
      update: {
        active: true,
        platform: platform || 'web',
        userAgent: userAgent || null,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        token,
        platform: platform || 'web',
        userAgent: userAgent || null,
        active: true,
      },
    });

    // Auto-create notification preferences if they don't exist
    await db.notificationPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        pushEnabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      tokenId: upserted.id,
    });
  } catch (error) {
    console.error('[Notifications] Register token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/notifications/register-token — Deactivate a push token
export async function DELETE(request: NextRequest) {
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
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'FCM token is required' }, { status: 400 });
    }

    // Only deactivate if the token belongs to this user
    const pushToken = await db.pushToken.findUnique({
      where: { token },
    });

    if (!pushToken || pushToken.userId !== user.id) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    await db.pushToken.update({
      where: { token },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Delete token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
