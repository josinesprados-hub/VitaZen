import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

const MAX_THREADS_FREE = 20;
const MAX_THREADS_PREMIUM = 100;

// History limits: FREE sees last 10 threads, PREMIUM sees all
const HISTORY_LIMIT_FREE = 10;

export async function GET(request: NextRequest) {
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

    const isPremium = user.plan === 'PREMIUM';

    // Support ?archived=true|false filter
    const { searchParams } = new URL(request.url);
    const archivedParam = searchParams.get('archived');
    const where: Record<string, unknown> = { userId: user.id };
    if (archivedParam === 'true') {
      where.archived = true;
    } else if (archivedParam === 'false') {
      where.archived = false;
    }
    // If no param, return all threads (both active and archived)

    // FREE users see limited recent threads, PREMIUM sees all
    const threadLimit = isPremium ? undefined : HISTORY_LIMIT_FREE;

    const threads = await db.aIThread.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: threadLimit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      threads,
      historyLimited: !isPremium,
      historyLimit: HISTORY_LIMIT_FREE,
    });
  } catch (error) {
    console.error('Get threads error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const maxThreads = user.plan === 'PREMIUM' ? MAX_THREADS_PREMIUM : MAX_THREADS_FREE;
    const threadCount = await db.aIThread.count({
      where: { userId: user.id, archived: false },
    });

    if (threadCount >= maxThreads) {
      return NextResponse.json(
        { error: `Maximum ${maxThreads} conversations allowed. Delete one to create a new one.` },
        { status: 403 }
      );
    }

    const { title } = await request.json();

    const thread = await db.aIThread.create({
      data: {
        userId: user.id,
        title: title || 'Nueva conversación',
      },
    });

    return NextResponse.json({ thread });
  } catch (error) {
    console.error('Create thread error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
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

    const { threadId, title, archived } = await request.json();

    if (!threadId) {
      return NextResponse.json({ error: 'threadId required' }, { status: 400 });
    }

    const thread = await db.aIThread.findFirst({
      where: { id: threadId, userId: user.id },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = (title as string).slice(0, 100);
    if (archived !== undefined) data.archived = archived;

    const updated = await db.aIThread.update({
      where: { id: threadId },
      data,
    });

    return NextResponse.json({ thread: updated });
  } catch (error) {
    console.error('Update thread error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    const { threadId } = await request.json();

    const thread = await db.aIThread.findFirst({
      where: { id: threadId, userId: user.id },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    // Delete thread — cascade deletes associated messages
    await db.aIThread.delete({ where: { id: threadId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete thread error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
