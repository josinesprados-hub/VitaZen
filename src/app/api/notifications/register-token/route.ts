export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

// POST /api/notifications/register-token — Register or refresh a push token
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

    const rl = await rateLimit(user.id, 'notifications:register', RATE_LIMITS['notifications:register']);
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { token, platform, userAgent } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Valid FCM token is required' }, { status: 400 });
    }

    // ─── V-1 (FASE 27): bound input sizes + strict platform enum ───
    // token/userAgent previously went to PushToken with no length cap (a
    // user could store multi-megabyte strings — self-inflicted DB bloat),
    // and platform accepted any string. Now:
    //   - token: FCM tokens are ~140-260 chars; 4096 is a generous upper
    //     bound that cannot reject a real FCM token.
    //   - platform: only the values the codebase actually supports
    //     (RegisterPushTokenPayload in src/lib/notifications/types.ts;
    //     the web client sends 'web'). Absent platform still defaults to
    //     'web' below — unchanged behavior.
    //   - userAgent: real User-Agent strings are < 400 chars; 512 is a
    //     generous cap. Absent userAgent still becomes null — unchanged.
    // Invalid inputs return 400 (client error) instead of ever reaching the
    // write path.
    const MAX_TOKEN_LENGTH = 4096;
    if (token.length > MAX_TOKEN_LENGTH) {
      return NextResponse.json({ error: 'FCM token too long' }, { status: 400 });
    }

    const SUPPORTED_PLATFORMS = ['web', 'ios', 'android'];
    if (platform !== undefined && platform !== null) {
      if (typeof platform !== 'string' || !SUPPORTED_PLATFORMS.includes(platform)) {
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
      }
    }

    const MAX_USER_AGENT_LENGTH = 512;
    if (userAgent !== undefined && userAgent !== null) {
      if (typeof userAgent !== 'string' || userAgent.length > MAX_USER_AGENT_LENGTH) {
        return NextResponse.json({ error: 'User agent too long' }, { status: 400 });
      }
    }

    // Check if this token already exists (possibly under a different user)
    // FCM tokens are per-device/browser — if a different Firebase Auth user
    // logs in on the same device, getToken() returns the same FCM token.
    const existingToken = await db.pushToken.findUnique({
      where: { token },
      select: { id: true, userId: true },
    });

    // H-09 / F7.5-01/F7.5-10 FIX: Do NOT reassign tokens across users.
    // Previously, if a token belonged to another user, the old fix deactivated
    // it, but the upsert below would re-activate the SAME record (still
    // belonging to the other user) because the @unique token value still
    // existed. Now: DELETE the old token entirely so the upsert takes the
    // CREATE path for the new user.
    if (existingToken && existingToken.userId !== user.id) {
      await db.pushToken.delete({
        where: { id: existingToken.id },
      });
      // Fall through to create a new token for this user below
    } else if (existingToken) {
      // Same user — refresh the existing token
      await db.pushToken.update({
        where: { id: existingToken.id },
        data: {
          active: true,
          platform: platform || 'web',
          userAgent: userAgent || null,
          updatedAt: new Date(),
        },
      });

      // Auto-create notification preferences if they don't exist
      await db.notificationPreference.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, pushEnabled: true },
      });

      return NextResponse.json({ success: true, tokenId: existingToken.id });
    }

    // No existing token (or old one was deactivated) — create new

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

    // Upsert: if token exists for this user, refresh it; otherwise create
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
    const user = await getAuthUserBasic(idToken);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const rl = await rateLimit(user.id, 'notifications:unregister', RATE_LIMITS['notifications:unregister']);
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { token } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'FCM token is required' }, { status: 400 });
    }

    // Only deactivate if the token belongs to this user
    const pushToken = await db.pushToken.findUnique({
      where: { token },
      select: { id: true, userId: true },
    });

    if (!pushToken || pushToken.userId !== user.id) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    await db.pushToken.update({
      where: { id: pushToken.id },
      data: { active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Notifications] Delete token error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
