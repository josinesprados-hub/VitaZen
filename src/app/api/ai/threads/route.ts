import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

const MAX_THREADS_FREE = 20;
const MAX_THREADS_PREMIUM = 100;

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

    const threads = await db.aIThread.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return NextResponse.json({ threads });
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
      where: { userId: user.id },
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

    const { threadId, title } = await request.json();

    if (!threadId || !title) {
      return NextResponse.json({ error: 'threadId and title required' }, { status: 400 });
    }

    const thread = await db.aIThread.findFirst({
      where: { id: threadId, userId: user.id },
    });

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const updated = await db.aIThread.update({
      where: { id: threadId },
      data: { title: title.slice(0, 100) },
    });

    return NextResponse.json({ thread: updated });
  } catch (error) {
    console.error('Rename thread error:', error);
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

    await db.aIThread.delete({ where: { id: threadId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete thread error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
