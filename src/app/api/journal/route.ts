export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onJournalChange } from '@/lib/widgets/triggers';

export async function GET(request: NextRequest) {
  const endpoint = 'api/journal';
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'noAuthHeader' }));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) {
      console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'userNotFound' }));
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'authOk', userId: user.id }));

    const t0 = Date.now();
    const entries = await db.journalEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'journalFindMany', isNull: entries === null, isArray: Array.isArray(entries), count: Array.isArray(entries) ? entries.length : 'N/A', durationMs: Date.now() - t0 }));

    // Guard: PrismaPg driver adapter can return null for findMany in edge cases.
    if (!entries) {
      throw new Error('PrismaPg adapter returned null for journalEntry.findMany — userId: ' + user.id);
    }

    console.log(JSON.stringify({ vz_debug: true, endpoint, step: 'returning200', entriesCount: entries.length }));
    return NextResponse.json({ entries });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code || (error as any)?.prismaCode || 'UNKNOWN';
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join(' | ') : undefined;
    console.error(JSON.stringify({ vz_debug: true, endpoint, step: 'CATCH', error: message, prismaCode: code, stack }));
    return NextResponse.json({ error: 'Internal server error', debug: message, prismaCode: code }, { status: 500 });
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
