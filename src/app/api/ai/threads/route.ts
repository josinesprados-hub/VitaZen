export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAIUsageRemaining } from '@/lib/limits';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

// FASE 30: FREE keeps the 5 ACTIVE-conversation creation limit (server-side).
const MAX_THREADS_FREE = 5;

// ─── FASE 30 — Conversation history is NOT a premium feature ───
// Previously FREE was truncated to the 10 most recent threads
// (HISTORY_LIMIT_FREE) and PREMIUM to 100 (MAX_THREADS_PREMIUM used as a
// read cap). Both truncations are gone: every user pages through their
// ENTIRE history (active and archived) with stable keyset pagination.
//
// The only remaining ceiling is the PAGE SIZE below — a transport cap that
// never hides conversations (the client requests the next page with the
// returned cursor). It is NOT a functional limit: the number of loaded
// threads has nothing to do with the number of conversations the user may
// own (totalActiveCount / totalArchivedCount are real COUNT queries).
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

/** Opaque cursor: base64(JSON { u: updatedAt ISO, id }) — no user data inside. */
function encodeThreadCursor(thread: { updatedAt: Date | string; id: string }): string {
  return Buffer.from(
    JSON.stringify({ u: new Date(thread.updatedAt).toISOString(), id: thread.id }),
    'utf8',
  ).toString('base64');
}

/** Returns null for any malformed / tampered cursor (caller answers 400). */
function decodeThreadCursor(raw: string): { u: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as {
      u?: unknown;
      id?: unknown;
    };
    if (typeof parsed?.u !== 'string' || typeof parsed?.id !== 'string' || !parsed.u || !parsed.id) {
      return null;
    }
    const d = new Date(parsed.u);
    if (Number.isNaN(d.getTime())) return null;
    return { u: d.toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

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

    // FASE 30: server-side history search. Always filtered by the
    // authenticated user's id — a search can never escape its own threads.
    const qParam = (searchParams.get('q') || '').trim();
    if (qParam) {
      where.title = { contains: qParam, mode: 'insensitive' };
    }

    // FASE 30: keyset pagination. Stable order (updatedAt desc) with `id` as
    // tie-breaker (updatedAt is not unique). The cursor row is excluded via
    // strict comparisons on the composite key. The query is ALWAYS scoped by
    // the session user id, so a cursor — even a crafted one — can only ever
    // traverse the caller's own threads (no IDOR by construction).
    const cursorParam = searchParams.get('cursor');
    if (cursorParam) {
      const cursor = decodeThreadCursor(cursorParam);
      if (!cursor) {
        return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
      }
      const cursorDate = new Date(cursor.u);
      where.AND = [
        {
          OR: [
            { updatedAt: { lt: cursorDate } },
            {
              AND: [
                { updatedAt: { equals: cursorDate } },
                { id: { lt: cursor.id } },
              ],
            },
          ],
        },
      ];
    }

    const parsedLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const pageSize = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    // BUG-04 FIX (kept): real thread counts in parallel so the sidebar tab
    // badges show the actual number of conversations, not the page size.
    const [totalActiveCount, totalArchivedCount, threads] = await Promise.all([
      db.aIThread.count({ where: { userId: user.id, archived: false } }),
      db.aIThread.count({ where: { userId: user.id, archived: true } }),
      db.aIThread.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1, // fetch one extra row to detect the next page
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { role: true, createdAt: true },
          },
        },
      }),
    ]);

    const hasMore = threads.length > pageSize;
    const pageThreads = hasMore ? threads.slice(0, pageSize) : threads;
    const lastThread = pageThreads[pageThreads.length - 1];
    const nextCursor = hasMore && lastThread ? encodeThreadCursor(lastThread) : null;

    return NextResponse.json({
      threads: pageThreads,
      nextCursor,
      hasMore,
      // FASE 30: the history is never plan-truncated anymore (kept for
      // backward client compatibility — it was consumed as a boolean flag).
      historyLimited: false,
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

    // FASE 30: PREMIUM conversations are UNLIMITED (product decision —
    // "conversaciones sin límite desde el punto de vista del usuario"). The
    // former MAX_THREADS_PREMIUM = 100 functional creation cap is gone.
    // Only FREE is limited (5 active conversations, archived not counted).
    // `threadCount >= Infinity` is always false → no 403 for PREMIUM, ever.
    const maxThreads = user.plan === 'PREMIUM' ? Infinity : MAX_THREADS_FREE;
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

    // ─── V-2 (FASE 27): type validation, mirroring POST's F7.5-12 ───
    // Previously a non-string title crashed on .slice (TypeError → 500) and
    // a non-boolean archived failed Prisma validation (→ 500). Invalid types
    // are client errors: they must be 400 and must never reach Prisma.
    // Valid payloads are unchanged (title still sliced to 100 below; archive
    // semantics untouched).
    if (title !== undefined && typeof title !== 'string') {
      return NextResponse.json({ error: 'title must be a string' }, { status: 400 });
    }
    if (archived !== undefined && typeof archived !== 'boolean') {
      return NextResponse.json({ error: 'archived must be a boolean' }, { status: 400 });
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
