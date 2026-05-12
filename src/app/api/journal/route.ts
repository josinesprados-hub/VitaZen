export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { tryAutoCompleteChallenge } from '@/lib/challenge-auto-complete';
import { onJournalChange } from '@/lib/widgets/triggers';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const entries = await db.journalEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

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
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
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
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
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
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
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
