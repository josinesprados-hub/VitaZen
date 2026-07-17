export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { madridDaysAgo } from '@/lib/dates';

// ═══════════════════════════════════════════
// GET — Fetch finance logs
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    let days = 90;
    const daysParam = searchParams.get('days');
    if (daysParam) {
      const parsed = parseInt(daysParam);
      if (!isNaN(parsed)) days = Math.min(Math.max(parsed, 10), 365);
    }
    days = Math.max(0, days);

    const logs = await db.financeLog.findMany({
      where: { userId: user.id, date: { gte: madridDaysAgo(days) } },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        type: true,
        category: true,
        amount: true,
        description: true,
        mood: true,
        contexto: true,
      },
    });

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Finance GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════
// POST — Create a new finance log
// ═══════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { date, type, category, amount, description, mood, contexto } = body;

    // ── Validation ──
    if (!type || !['income', 'expense'].includes(type)) {
      return NextResponse.json({ error: 'Tipo inválido. Debe ser "income" o "expense".' }, { status: 400 });
    }
    if (!category || typeof category !== 'string' || !category.trim()) {
      return NextResponse.json({ error: 'La categoría es obligatoria.' }, { status: 400 });
    }
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'La cantidad debe ser mayor que 0.' }, { status: 400 });
    }
    if (!date || typeof date !== 'string') {
      return NextResponse.json({ error: 'La fecha es obligatoria.' }, { status: 400 });
    }

    // Parse date and set to start of day in Madrid timezone
    const dateObj = new Date(date + 'T00:00:00+01:00');
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: 'Fecha inválida.' }, { status: 400 });
    }

    const log = await db.financeLog.create({
      data: {
        userId: user.id,
        date: dateObj,
        type,
        category: category.trim().slice(0, 100),
        amount: Math.round(amount * 100) / 100, // Prevent floating point issues
        description: description?.trim()?.slice(0, 500) || null,
        mood: mood?.trim()?.slice(0, 50) || null,
        contexto: contexto?.trim()?.slice(0, 1000) || null,
      },
      select: {
        id: true,
        date: true,
        type: true,
        category: true,
        amount: true,
        description: true,
        mood: true,
        contexto: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Finance POST error:', error);
    return NextResponse.json({ error: 'Error al crear el registro.' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════
// PUT — Update an existing finance log
// ═══════════════════════════════════════════

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { logId, date, type, category, amount, description, mood, contexto } = body;

    if (!logId || typeof logId !== 'string') {
      return NextResponse.json({ error: 'ID de registro no proporcionado.' }, { status: 400 });
    }

    // Verify ownership
    const existing = await db.financeLog.findUnique({
      where: { id: logId },
      select: { userId: true },
    });

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Registro no encontrado.' }, { status: 404 });
    }

    // Build update data (only include provided fields)
    const updateData: Record<string, unknown> = {};
    if (type !== undefined) {
      if (!['income', 'expense'].includes(type)) {
        return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 });
      }
      updateData.type = type;
    }
    if (category !== undefined) {
      if (!category.trim()) {
        return NextResponse.json({ error: 'La categoría es obligatoria.' }, { status: 400 });
      }
      updateData.category = category.trim().slice(0, 100);
    }
    if (amount !== undefined) {
      if (typeof amount !== 'number' || amount <= 0) {
        return NextResponse.json({ error: 'La cantidad debe ser mayor que 0.' }, { status: 400 });
      }
      updateData.amount = Math.round(amount * 100) / 100;
    }
    if (date !== undefined) {
      const dateObj = new Date(date + 'T00:00:00+01:00');
      if (isNaN(dateObj.getTime())) {
        return NextResponse.json({ error: 'Fecha inválida.' }, { status: 400 });
      }
      updateData.date = dateObj;
    }
    if (description !== undefined) {
      updateData.description = description?.trim()?.slice(0, 500) || null;
    }
    if (mood !== undefined) {
      updateData.mood = mood?.trim()?.slice(0, 50) || null;
    }
    if (contexto !== undefined) {
      updateData.contexto = contexto?.trim()?.slice(0, 1000) || null;
    }

    const log = await db.financeLog.update({
      where: { id: logId },
      data: updateData,
      select: {
        id: true,
        date: true,
        type: true,
        category: true,
        amount: true,
        description: true,
        mood: true,
        contexto: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Finance PUT error:', error);
    return NextResponse.json({ error: 'Error al actualizar el registro.' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════
// DELETE — Remove a finance log
// ═══════════════════════════════════════════

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { logId } = body;

    if (!logId || typeof logId !== 'string') {
      return NextResponse.json({ error: 'ID de registro no proporcionado.' }, { status: 400 });
    }

    // Verify ownership before deleting
    const existing = await db.financeLog.findUnique({
      where: { id: logId },
      select: { userId: true },
    });

    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Registro no encontrado.' }, { status: 404 });
    }

    await db.financeLog.delete({
      where: { id: logId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Finance DELETE error:', error);
    return NextResponse.json({ error: 'Error al eliminar el registro.' }, { status: 500 });
  }
}