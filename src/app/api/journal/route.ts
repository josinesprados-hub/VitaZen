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

    // ╔══════════════════════════════════════════════════╗
    // ║  TEMPORAL DEBUG — REMOVE AFTER FIXING            ║
    // ╚══════════════════════════════════════════════════╝
    const _dbg = (step: string, data?: any) => {
      console.error(JSON.stringify({ vz_dbg: true, route: 'journal', step, ...data, ts: new Date().toISOString() }));
    };
    _dbg('start');

    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) {
      _dbg('auth_failed', { reason: 'getAuthUserBasic returned null' });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    _dbg('auth_ok', { userId: user.id, plan: user.plan });

    let entries: any;
    try {
      entries = await db.journalEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      _dbg('findMany_ok', { count: entries?.length, isNull: entries === null, type: typeof entries });
    } catch (fmErr: any) {
      _dbg('findMany_FAILED', { errMsg: fmErr?.message, errName: fmErr?.constructor?.name, prismaCode: (fmErr as any)?.code, errStack: fmErr?.stack?.slice(0, 500) });
      throw fmErr;
    }

    if (!entries) {
      _dbg('findMany_null_guard');
      throw new Error('PrismaPg adapter returned null for journalEntry.findMany — userId: ' + user.id);
    }

    _dbg('success', { entryCount: entries.length });
    return NextResponse.json({ entries });
  } catch (error: any) {
    console.error('Journal GET error:', error);
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code || (error as any)?.prismaCode || 'UNKNOWN';
    const stack = error instanceof Error ? error.stack?.slice(0, 800) : undefined;
    // TEMPORAL: include debug info in response body for network tab inspection
    return NextResponse.json({ error: 'Internal server error', _dbg: { message, code, stack } }, { status: 500 });
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

    const entry = await db.journalEntry.create({
      data: { userId: user.id, title: title || '', content: content || '', mood, gratitude },
    });

    // Award XP to crecimiento empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'crecimiento' } },
      update: { xp: { increment: 20 } },
      create: { userId: user.id, empire: 'crecimiento', xp: 20 },
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

    await db.journalEntry.delete({ where: { id: entryId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Journal DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
