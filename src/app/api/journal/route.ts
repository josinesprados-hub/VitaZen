export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onJournalChange } from '@/lib/widgets/triggers';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const entries = await db.journalEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
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

    const { title, content, mood, gratitude } = await request.json();

    // At least one field must have content
    if (!title?.trim() && !content?.trim() && !gratitude?.trim()) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
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
        data: { userId: user.id, title: title || '', content: content || '', mood, gratitude },
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

    const body = await request.json();
    const { entryId, title, content, mood, gratitude } = body;
    const entry = await db.journalEntry.findUnique({ where: { id: entryId } });
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (entry.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // At least one field must have content
    if (!title?.trim() && !content?.trim() && !gratitude?.trim()) {
      return NextResponse.json({ error: 'At least one field is required' }, { status: 400 });
    }

    const updated = await db.journalEntry.update({
      where: { id: entryId },
      data: { title: title || '', content: content || '', mood, gratitude },
    });

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
