export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAIUsageRemaining } from '@/lib/limits';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

const MAX_THREADS_FREE = 5;
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
    const usageInfo = await getAIUsageRemaining(user.id, user.plan);

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

    // PERF-5.2: Both FREE and PREMIUM paths now have safety caps.
    // PREMIUM: MAX_THREADS_PREMIUM (100) — same ceiling as POST creation limit.
    // FREE: HISTORY_LIMIT_FREE (10) — unchanged.
    // Also added select on included messages to avoid transferring full content
    // (only role + createdAt needed for thread list preview).
    const threadLimit = isPremium ? MAX_THREADS_PREMIUM : HISTORY_LIMIT_FREE;

    // BUG-04 FIX: Fetch real thread counts in parallel so the sidebar tab
    // badges show the actual number of conversations, not the pagination cap.
    // These are lightweight COUNT queries — no data transfer overhead.
    const [totalActiveCount, totalArchivedCount, threads] = await Promise.all([
      db.aIThread.count({ where: { userId: user.id, archived: false } }),
      db.aIThread.count({ where: { userId: user.id, archived: true } }),
      db.aIThread.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: threadLimit,
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { role: true, createdAt: true },
          },
        },
      }),
    ]);

    return NextResponse.json({
      threads,
      historyLimited: !isPremium,
      historyLimit: HISTORY_LIMIT_FREE,
      remaining: usageInfo.remaining,
      limit: usageInfo.limit,
      totalActiveCount,
      totalArchivedCount,
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

    const rl = await rateLimit(user.id, 'ai:threads:post', RATE_LIMITS['ai:threads:post']);
    if (rl.limited) return rateLimitedResponse(rl);

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

    // F7.5-12 FIX: Validate title type and length.
    if (title !== undefined && title !== null) {
      if (typeof title !== 'string') {
        return NextResponse.json({ error: 'title must be a string' }, { status: 400 });
      }
      if (title.length > 100) {
        return NextResponse.json({ error: 'title too long (max 100 chars)' }, { status: 400 });
      }
    }

    // F7.5-12 FIX: Handle race condition on concurrent thread creation.
    // Two simultaneous POSTs can both pass the count check. Wrap in try/catch
    // to handle unique constraint violations gracefully.
    let thread;
    try {
      thread = await db.aIThread.create({
        data: {
          userId: user.id,
          title: (typeof title === 'string' ? title.slice(0, 100) : '') || 'Nueva conversación',
        },
      });
    } catch (e: unknown) {
      // If it's a constraint error, re-check the count and return a clear error
      const prismaError = e as { code?: string };
      if (prismaError.code === 'P2002') {
        return NextResponse.json(
          { error: 'Rate limited — please try again', retryAfter: 5 },
          { status: 429, headers: { 'Retry-After': '5' } }
        );
      }
      throw e;
    }

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

    const rl = await rateLimit(user.id, 'ai:threads:patch', RATE_LIMITS['ai:threads:patch']);
    if (rl.limited) return rateLimitedResponse(rl);

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

    const rl = await rateLimit(user.id, 'ai:threads:delete', RATE_LIMITS['ai:threads:delete']);
    if (rl.limited) return rateLimitedResponse(rl);

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
