export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { sessionId, duration, type } = body;
    console.log('[CRUD DEBUG] Meditation PUT - sessionId:', sessionId, 'userId:', user.id);

    // Verify the session belongs to the user before updating
    const session = await db.meditationSession.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const updated = await db.meditationSession.update({
      where: { id: sessionId },
      data: { duration, type },
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error('Meditation PUT error:', error);
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
    const { sessionId } = body;
    console.log('[CRUD DEBUG] Meditation DELETE - sessionId:', sessionId, 'userId:', user.id);

    // Verify the session belongs to the user before deleting
    const session = await db.meditationSession.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if (session.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.meditationSession.delete({ where: { id: sessionId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Meditation DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const sessions = await db.meditationSession.findMany({
      where: { userId: user.id },
      orderBy: { completedAt: 'desc' },
      take: 30,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Meditation GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { duration, type } = await request.json();

    const session = await db.meditationSession.create({
      data: { userId: user.id, duration, type },
    });

    // Award XP to mente empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'mente' } },
      update: { xp: { increment: 15 } },
      create: { userId: user.id, empire: 'mente', xp: 15 },
    });

    return NextResponse.json({ session });
  } catch (error) {
    console.error('Meditation POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
