export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

async function handler(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (request.method === 'GET') {
      const favorites = await db.aIMessage.findMany({
        where: {
          isFavorited: true,
          role: 'assistant',
          thread: { userId: user.id },
        },
        select: {
          id: true,
          content: true,
          favoritedAt: true,
          createdAt: true,
          thread: { select: { id: true, title: true } },
        },
        orderBy: { favoritedAt: 'desc' },
        take: 50,
      });
      return NextResponse.json({ favorites });
    }

    if (request.method === 'PATCH') {
      const rl = await rateLimit(user.id, 'ai:favorites:patch', RATE_LIMITS['ai:favorites:patch']);
      if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

      const { messageId } = await request.json();
      if (!messageId) {
        return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
      }

      const message = await db.aIMessage.findFirst({
        where: {
          id: messageId,
          role: 'assistant',
          thread: { userId: user.id },
        },
        select: { id: true, isFavorited: true },
      });

      if (!message) {
        return NextResponse.json({ error: 'Message not found' }, { status: 404 });
      }

      const newFavorited = !message.isFavorited;
      await db.aIMessage.update({
        where: { id: messageId },
        data: {
          isFavorited: newFavorited,
          favoritedAt: newFavorited ? new Date() : null,
        },
      });

      return NextResponse.json({ isFavorited: newFavorited });
    }

    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    console.error('api/ai/favorites', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export { handler as GET, handler as PATCH };