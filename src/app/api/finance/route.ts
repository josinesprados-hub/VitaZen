export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfMadridDaysAgo } from '@/lib/dates';

// ═══════════════════════════════════════════
// Serialización manual — evita problemas con Date/BigInt de Prisma
// ═══════════════════════════════════════════

function serializeFinanceLog(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(row.id ?? ''),
    date: row.date instanceof Date ? row.date.toISOString() : String(row.date ?? ''),
    type: String(row.type ?? ''),
    category: String(row.category ?? ''),
    amount: typeof row.amount === 'number' ? row.amount : 0,
    description: row.description != null ? String(row.description) : null,
    mood: row.mood != null ? String(row.mood) : null,
    contexto: row.contexto != null ? String(row.contexto) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : (row.createdAt != null ? String(row.createdAt) : new Date().toISOString()),
  };
}

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
      where: { userId: user.id, date: { gte: startOfMadridDaysAgo(days) } },
      orderBy: { date: 'desc' },
    });

    const serialized = logs.map(l => serializeFinanceLog(l as unknown as Record<string, unknown>));
    return NextResponse.json({ logs: serialized });
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
        amount: Math.round(amount * 100) / 100,
        description: description?.trim()?.slice(0, 500) || null,
        mood: mood?.trim()?.slice(0, 50) || null,
        contexto: contexto?.trim()?.slice(0, 1000) || null,
      },
    });

    return NextResponse.json({ log: serializeFinanceLog(log as unknown as Record<string, unknown>) });
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
    });

    return NextResponse.json({ log: serializeFinanceLog(log as unknown as Record<string, unknown>) });
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