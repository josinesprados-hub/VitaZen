export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '90');

    const logs = await db.financeLog.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Finance GET error:', error);
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
    const { logId, date, type, category, amount, description, mood, contexto } = body;
    const log = await db.financeLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Validate required fields
    if (!type || (type !== 'income' && type !== 'expense')) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    if (!category || !category.trim()) return NextResponse.json({ error: 'La categoría es obligatoria' }, { status: 400 });
    if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) return NextResponse.json({ error: 'La cantidad debe ser mayor que 0' }, { status: 400 });

    const updated = await db.financeLog.update({
      where: { id: logId },
      data: { date: new Date(date), type, category: category.trim(), amount: Number(amount), description: description?.trim() || null, mood: mood || null, contexto: contexto?.trim() || null },
    });

    return NextResponse.json({ log: updated });
  } catch (error) {
    console.error('Finance PUT error:', error);
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
    const { logId } = body;
    const log = await db.financeLog.findUnique({ where: { id: logId } });
    if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    if (log.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.financeLog.delete({ where: { id: logId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Finance DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { date, type, category, amount, description, mood, contexto } = await request.json();

    // Validate required fields
    if (!date) return NextResponse.json({ error: 'La fecha es obligatoria' }, { status: 400 });
    if (!type || (type !== 'income' && type !== 'expense')) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 });
    if (!category || !category.trim()) return NextResponse.json({ error: 'La categoría es obligatoria' }, { status: 400 });
    if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) return NextResponse.json({ error: 'La cantidad debe ser mayor que 0' }, { status: 400 });

    const log = await db.financeLog.create({
      data: { userId: user.id, date: new Date(date), type, category: category.trim(), amount: Number(amount), description: description?.trim() || null, mood: mood || null, contexto: contexto?.trim() || null },
    });

    // Award XP to riqueza empire
    await db.empireProgress.upsert({
      where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
      update: { xp: { increment: 10 } },
      create: { userId: user.id, empire: 'riqueza', xp: 10 },
    });

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Finance POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
