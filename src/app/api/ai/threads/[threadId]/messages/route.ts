export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// FREE users see last 50 messages per thread, PREMIUM sees all
const MESSAGES_LIMIT_FREE = 50;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const user = await getAuthUser(idToken);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { threadId } = await params;

    const thread = await db.aIThread.findFirst({
      where: { id: threadId, userId: user.id },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const isPremium = user.plan === 'PREMIUM';

    // FREE users see limited messages, PREMIUM sees all.
    // T-1 FIX: Previously used `orderBy: asc + take: 50` which returned the
    // OLDEST 50 messages (the first 50 in the thread). A FREE user with 80
    // messages saw messages 1-50, missing messages 51-80 (the most recent,
    // including the conversation they just had). The thread appeared "stuck"
    // in the past.
    //
    // Fix: fetch the NEWEST 50 (orderBy: desc + take: 50), then reverse to
    // chronological order for display. This matches the pattern used by
    // /api/ai/chat (lines 66-71) which does the same desc+take+reverse.
    if (isPremium) {
      const messages = await db.aIMessage.findMany({
        where: { threadId },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({
        messages,
        historyLimited: false,
        historyLimit: MESSAGES_LIMIT_FREE,
      });
    }

    const recentMessages = await db.aIMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'desc' },
      take: MESSAGES_LIMIT_FREE,
    });
    const messages = recentMessages.reverse(); // restore chronological order for display

    return NextResponse.json({
      messages,
      historyLimited: true,
      historyLimit: MESSAGES_LIMIT_FREE,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
