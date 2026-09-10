export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { evaluateAchievements } from '@/lib/achievements';
import { onJournalChange } from '@/lib/widgets/triggers';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries } from '@/lib/dates';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

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
    if (rl.limited) return rateLimitedResponse(rl);

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

    // H-05 FIX: Rate limit journal creation to 5 per day to prevent XP farming.
    // F-3 FIX: the quota window now uses the canonical Europe/Madrid natural
    // day — madridDayBoundaries(todayKey).end — instead of `start + 24h`.
    // A Madrid calendar day is NOT always 24 hours: on the autumn DST
    // transition (25-hour day, e.g. 2026-10-25) `start + 24h` ended at
    // 23:00 Madrid, so entries written during the final hour of that day
    // escaped the 5/day quota and each still paid +20 XP. On normal days the
    // canonical end equals start+24h, and on the spring transition (23-hour
    // day, e.g. 2026-03-29) it correctly stops at the real next midnight.
    const todayKey = getTodayDateKey();
    const { start: todayStart, end: todayEnd } = madridDayBoundaries(todayKey);

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
    //
    // F-7 FIX (closes N-1 TOCTOU from the Fase 14 final audit): the
    // daily-quota COUNT used to run BEFORE this transaction. A burst of N
    // concurrent POSTs could all observe count < 5, then serialize
    // one-by-one on the advisory lock and each still create an entry and pay
    // +20 XP (up to +200 XP observed vs the intended +100/day cap). The
    // quota decision now runs under the SAME serialization as the write:
    //     BEGIN → advisory lock → COUNT → quota check → CREATE/XP → COMMIT
    // The window above is computed from the canonical Madrid natural day
    // (F-3 intact); the count that DECIDES the quota is the one executed
    // after the lock, inside the same transaction that creates the entry, so
    // no concurrent POST can slip between the check and the write.
    const result = await db.$transaction(async (tx) => {
      // C-1 FIX: advisory lock serializes concurrent journal POSTs and DELETEs
      // for the same user, preventing interleave that could cause XP drift.
      // F-7: acquired FIRST — before the quota count.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|crecimiento'), 1, 16))::bit(64)::bigint
        )`;

      // F-7: quota recount INSIDE the transaction, AFTER the advisory lock.
      const entriesToday = await tx.journalEntry.count({
        where: {
          userId: user.id,
          createdAt: { gte: todayStart, lt: todayEnd },
        },
      });
      if (entriesToday >= 5) {
        // Quota exhausted under serialization: no entry, no XP, and no
        // achievements/side effects (the 429 is built outside the tx).
        return { quotaExceeded: true as const };
      }

      const created = await tx.journalEntry.create({
        data: { userId: user.id, title: safeTitle, content: safeContent, mood, gratitude: safeGratitude },
      });

      // Award XP to crecimiento empire
      await tx.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'crecimiento' } },
        update: { xp: { increment: 20 } },
        create: { userId: user.id, empire: 'crecimiento', xp: 20 },
      });

      return { quotaExceeded: false as const, entry: created };
    });

    if (result.quotaExceeded) {
      // Calculate seconds until midnight Madrid for Retry-After
      const { end: dayEnd } = madridDayBoundaries(getTodayDateKey());
      const retrySec = Math.max(1, Math.ceil((dayEnd.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Has alcanzado el límite de entradas de diario por hoy (5)', retryAfter: Date.now() + retrySec * 1000 },
        { status: 429, headers: { 'Retry-After': String(retrySec) } }
      );
    }

    const entry = result.entry;

    // Auto-complete today's challenge if it matches (non-blocking)
    tryAutoCompleteChallenge(user.id, 'journal', undefined, user.plan).catch(() => {});

    // Trigger widget snapshot refresh (non-blocking)
    onJournalChange(user.id, user.plan);

    // G-05 FIX: evaluate the achievements this action can affect right after
    // the write commits (journal entries + empire_all, since POST grants XP
    // to crecimiento). Best-effort and non-fatal.
    const newlyUnlocked = await evaluateAchievements(user.id, ['journal', 'empire']);

    return NextResponse.json({ entry, newlyUnlocked });
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
    if (rl.limited) return rateLimitedResponse(rl);

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

    // G-05 FIX: the PUT can add/change `gratitude` after creation, which can
    // complete hidden_gratitude_10. Evaluate the journal domain only (no XP
    // changes here, so the empire domain cannot be affected). Best-effort.
    const newlyUnlocked = await evaluateAchievements(user.id, ['journal']);

    return NextResponse.json({ entry: updated, newlyUnlocked });
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
    if (rl.limited) return rateLimitedResponse(rl);

    const body = await request.json();
    const { entryId } = body;
    const entry = await db.journalEntry.findUnique({ where: { id: entryId } });
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // C-1 FIX: Wrap journalEntry.delete + empireProgress revert in a
    // transaction with an advisory lock. Previously, these were two separate
    // non-atomic writes. If the empireProgress revert failed after the
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

      // N-2 FIX: the revert is now a SINGLE atomic clamped UPDATE (the exact
      // F-5B architecture of the meditation/finance DELETE reverts). The
      // previous code was a read-modify-write: it read EmpireProgress.xp and
      // wrote the computed ABSOLUTE total back. An absolute write only
      // serializes with writers holding the SAME advisory lock, but the
      // one-time onboarding bonus (G-01 CAS) awards its +25 to this very row
      // via an atomic increment WITHOUT this lock family. Race (audited as
      // N-2): DELETE reads xp=20 → onboarding commits xp=45 → DELETE writes
      // max(0, 20-20)=0 → the +25 is silently destroyed. A single row-locked
      // statement re-reads the LATEST committed value inside the UPDATE
      // itself and COMMUTES with any atomic increment, so the only XP ever
      // removed is exactly this entry's +20 — never another source's
      // (invariant: after DELETE, xp >= XP legitimately granted elsewhere).
      // 0 rows affected if the row is missing (same as the old null guard:
      // no row is created).
      await tx.$executeRaw`
        UPDATE "EmpireProgress"
        SET "xp" = GREATEST(0, "xp" - 20)
        WHERE "userId" = ${user.id} AND "empire" = 'crecimiento'`;
    });

    // Trigger widget snapshot refresh (non-blocking)
    onJournalChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Journal DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
