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

    // FREE users see limited messages, PREMIUM sees all
    const messages = await db.aIMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      ...(isPremium ? {} : { take: MESSAGES_LIMIT_FREE }),
    });

    return NextResponse.json({
      messages,
      historyLimited: !isPremium,
      historyLimit: MESSAGES_LIMIT_FREE,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
