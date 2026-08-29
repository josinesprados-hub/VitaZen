export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onJournalChange } from '@/lib/widgets/triggers';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { startOfMadridDay } from '@/lib/dates';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // PERF-5.2: Safety cap — list view never needs >100 entries.
    // Individual entry content is fetched on demand (PUT/GET by id).
    const entries = await db.journalEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Guard: PrismaPg driver adapter can return null for findMany in edge cases.
    if (!entries) {
      throw new Error('PrismaPg adapter returned null for journalEntry.findMany — userId: ' + user.id);
    }

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Journal GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const rl = await rateLimit(user.id, 'journal:post', RATE_LIMITS['journal:post']);
    if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

    const { title, content, mood, gratitude } = await request.json();

    // H-06 FIX: Validate field types and lengths before DB write.
    // Previously these fields were passed raw from request.json() to Prisma
    // with zero validation — an attacker could send multi-megabyte strings,
    // non-string types, or deeply nested objects directly into the database.
    if (title !== undefined && title !== null) {
      if (typeof title !== 'string') return NextResponse.json({ error: 'title must be a string' }, { status: 400 });
      if (title.length > 500) return NextResponse.json({ error: 'title too long (max 500 chars)' }, { status: 400 });
    }
    if (content !== undefined && content !== null) {
      if (typeof content !== 'string') return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
      if (content.length > 50000) return NextResponse.json({ error: 'content too long (max 50,000 chars)' }, { status: 400 });
    }
    if (gratitude !== undefined && gratitude !== null) {
      if (typeof gratitude !== 'string') return NextResponse.json({ error: 'gratitude must be a string' }, { status: 400 });
      if (gratitude.length > 5000) return NextResponse.json({ error: 'gratitude too long (max 5,000 chars)' }, { status: 400 });
    }
    if (mood !== undefined && mood !== null) {
      if (typeof mood !== 'number' || !Number.isInteger(mood) || mood < 1 || mood > 5) {
        return NextResponse.json({ error: 'mood must be an integer 1-5' }, { status: 400 });
      }
    }

    // At least one field must have content
    const safeTitle = typeof title === 'string' ? title : '';
    const safeContent = typeof content === 'string' ? content : '';
    const safeGratitude = typeof gratitude === 'string' ? gratitude : '';
    if (!safeTitle.trim() && !safeContent.trim() && !safeGratitude.trim()) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
    }

    // H-05 FIX: Rate limit journal creation to 5 per day to prevent XP farming
    const todayKey = getTodayDateKey();
    const todayStart = startOfMadridDay(todayKey);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const entriesToday = await db.journalEntry.count({
      where: {
        userId: user.id,
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });
    if (entriesToday >= 5) {
      return NextResponse.json(
        { error: 'Has alcanzado el límite de entradas de diario por hoy (5)' },
        { status: 429 }
      );
    }

    // C-1 FIX: Wrap journalEntry.create + empireProgress.upsert in a
    // transaction with an advisory lock. Previously, these were two separate
    // non-atomic writes. If the empireProgress upsert failed after the
    // journalEntry create succeeded (transient DB error, Neon cold-start
    // timeout, PrismaPg adapter hiccup), the user saw the journal entry but
    // their crecimiento XP was never awarded — permanently lost XP. Same bug
    // class as R-3 (finance), M-5 (checkin), E-2 (wellness/nutrition).
    //
    // The advisory lock serializes concurrent POSTs and DELETEs for the same
    // user, preventing interleave that could cause XP drift. The key is
    // namespaced with '|crecimiento' (no dateKey — JournalEntry has no
    // per-day uniqueness, so there is no "first log of the day" concept).
    // This avoids collisions with checkin ('|'), energia ('|energia|'), and
    // riqueza ('|riqueza|') advisory locks.
    const entry = await db.$transaction(async (tx) => {
      // C-1 FIX: advisory lock serializes concurrent journal POSTs and DELETEs
      // for the same user, preventing interleave that could cause XP drift.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|crecimiento'), 1, 16))::bit(64)::bigint
        )`;

      const created = await tx.journalEntry.create({
        data: { userId: user.id, title: safeTitle, content: safeContent, mood, gratitude: safeGratitude },
      });

      // Award XP to crecimiento empire
      await tx.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'crecimiento' } },
        update: { xp: { increment: 20 } },
        create: { userId: user.id, empire: 'crecimiento', xp: 20 },
      });

      return created;
    });

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'journal').catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onJournalChange(user.id, user.plan);

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Journal POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const rl = await rateLimit(user.id, 'journal:put', RATE_LIMITS['journal:put']);
    if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

    const body = await request.json();
    const { entryId, title, content, mood, gratitude } = body;
    const entry = await db.journalEntry.findUnique({ where: { id: entryId } });
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // H-06 FIX: Same type/length validation as POST
    if (title !== undefined && title !== null) {
      if (typeof title !== 'string') return NextResponse.json({ error: 'title must be a string' }, { status: 400 });
      if (title.length > 500) return NextResponse.json({ error: 'title too long (max 500 chars)' }, { status: 400 });
    }
    if (content !== undefined && content !== null) {
      if (typeof content !== 'string') return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
      if (content.length > 50000) return NextResponse.json({ error: 'content too long (max 50,000 chars)' }, { status: 400 });
    }
    if (gratitude !== undefined && gratitude !== null) {
      if (typeof gratitude !== 'string') return NextResponse.json({ error: 'gratitude must be a string' }, { status: 400 });
      if (gratitude.length > 5000) return NextResponse.json({ error: 'gratitude too long (max 5,000 chars)' }, { status: 400 });
    }
    if (mood !== undefined && mood !== null) {
      if (typeof mood !== 'number' || !Number.isInteger(mood) || mood < 1 || mood > 5) {
        return NextResponse.json({ error: 'mood must be an integer 1-5' }, { status: 400 });
      }
    }

    const safeTitle = typeof title === 'string' ? title : '';
    const safeContent = typeof content === 'string' ? content : '';
    const safeGratitude = typeof gratitude === 'string' ? gratitude : '';
    if (!safeTitle.trim() && !safeContent.trim() && !safeGratitude.trim()) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
    }

    const updated = await db.journalEntry.update({
      where: { id: entryId },
      data: { title: safeTitle, content: safeContent, mood, gratitude: safeGratitude },
    });

    // Trigger widget snapshot refresh (non-blocking)
    onJournalChange(user.id, user.plan);

    return NextResponse.json({ entry: updated });
  } catch (error) {
    console.error('Journal PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const rl = await rateLimit(user.id, 'journal:delete', RATE_LIMITS['journal:delete']);
    if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

    const body = await request.json();
    const { entryId } = body;
    const entry = await db.journalEntry.findUnique({ where: { id: entryId } });
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // C-1 FIX: Wrap journalEntry.delete + empireProgress.update in a
    // transaction with an advisory lock. Previously, these were two separate
    // non-atomic writes. If the empireProgress update failed after the
    // journalEntry delete succeeded, the entry was gone but the +20 XP stayed
    // — permanently inflated XP. Same bug class as R-3 (finance DELETE),
    // M-5 (checkin DELETE), E-2 (wellness/nutrition DELETE).
    await db.$transaction(async (tx) => {
      // C-1 FIX: advisory lock (same key as POST) serializes concurrent
      // mutations to the crecimiento empire progress.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|crecimiento'), 1, 16))::bit(64)::bigint
        )`;

      await tx.journalEntry.delete({ where: { id: entryId } });

      // Revert XP for crecimiento empire (never below 0, don't create if missing)
      const crecimientoProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'crecimiento' } },
      });
      if (crecimientoProgress) {
        await tx.empireProgress.update({
          where: { userId_empire: { userId: user.id, empire: 'crecimiento' } },
          data: { xp: Math.max(0, crecimientoProgress.xp - 20) },
        });
      }
    });

    // Trigger widget snapshot refresh (non-blocking)
    onJournalChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Journal DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
