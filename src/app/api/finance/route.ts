export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMadridDateKey } from '@/lib/deterministic';

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

    // Save the Madrid date key before deletion for same-day check
    const deletedDateKey = getMadridDateKey(log.date);

    await db.financeLog.delete({ where: { id: logId } });

    // Check if any FinanceLog remains for the same Madrid day
    const dWindowStart = new Date(log.date);
    dWindowStart.setDate(dWindowStart.getDate() - 1);
    const dWindowEnd = new Date(log.date);
    dWindowEnd.setDate(dWindowEnd.getDate() + 2);

    const remainingSameDay = await db.financeLog.findMany({
      where: {
        userId: user.id,
        date: { gte: dWindowStart, lt: dWindowEnd },
      },
      select: { date: true },
    });

    const hasRemainingToday = remainingSameDay.some(l => getMadridDateKey(l.date) === deletedDateKey);

    // Revert XP for riqueza empire (never below 0, don't create if missing)
    const riquezaProgress = await db.empireProgress.findUnique({
      where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
    });
    if (riquezaProgress) {
      if (hasRemainingToday) {
        // Other logs remain for this Madrid day — only revert XP
        await db.empireProgress.update({
          where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
          data: { xp: Math.max(0, riquezaProgress.xp - 10) },
        });
      } else {
        // This was the last log for this Madrid day — revert XP and streak
        await db.empireProgress.update({
          where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
          data: { xp: Math.max(0, riquezaProgress.xp - 10), streak: Math.max(0, riquezaProgress.streak - 1) },
        });
      }
    }

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

    // Check if user already has a FinanceLog for this Madrid day (before creating)
    const logDateKey = getMadridDateKey(new Date(date));
    const pWindowStart = new Date(date);
    pWindowStart.setDate(pWindowStart.getDate() - 1);
    const pWindowEnd = new Date(date);
    pWindowEnd.setDate(pWindowEnd.getDate() + 2);

    const existingSameDay = await db.financeLog.findMany({
      where: {
        userId: user.id,
        date: { gte: pWindowStart, lt: pWindowEnd },
      },
      select: { date: true },
    });

    const isFirstLogToday = !existingSameDay.some(l => getMadridDateKey(l.date) === logDateKey);

    const log = await db.financeLog.create({
      data: { userId: user.id, date: new Date(date), type, category: category.trim(), amount: Number(amount), description: description?.trim() || null, mood: mood || null, contexto: contexto?.trim() || null },
    });

    // Award XP to riqueza empire; streak only on first log of the day
    if (isFirstLogToday) {
      await db.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
        update: { xp: { increment: 10 }, streak: { increment: 1 } },
        create: { userId: user.id, empire: 'riqueza', xp: 10, streak: 1 },
      });
    } else {
      await db.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
        update: { xp: { increment: 10 } },
        create: { userId: user.id, empire: 'riqueza', xp: 10 },
      });
    }

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Finance POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
