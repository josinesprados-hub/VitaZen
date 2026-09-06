export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { startOfMadridDaysAgo, startOfMadridDay, getTodayDateKey, getMadridDateKey, madridDayBoundaries } from '@/lib/dates';
import { onFinanceChange } from '@/lib/widgets/triggers';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

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
      take: 2000,
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

    const rl = await rateLimit(user.id, 'finance:post', RATE_LIMITS['finance:post']);
    if (rl.limited) return rateLimitedResponse(rl);

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

    // Parse date using Madrid-aware utility
    const dateObj = startOfMadridDay(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: 'Fecha inválida.' }, { status: 400 });
    }

    // Dedup: reject if an identical record exists in the last 10 seconds
    const roundedAmount = Math.round(amount * 100) / 100;
    const dedupCutoff = new Date(Date.now() - 10_000);
    const existing = await db.financeLog.findFirst({
      where: {
        userId: user.id,
        date: dateObj,
        type,
        category: category.trim().slice(0, 100),
        amount: roundedAmount,
        createdAt: { gte: dedupCutoff },
      },
    });
    if (existing) {
      return NextResponse.json({ log: serializeFinanceLog(existing as unknown as Record<string, unknown>), duplicated: true });
    }

    // F-4: XP (+10) and streak (first finance log of the Madrid day)
    // Mirrors the meditation/energia pattern: advisory lock → create → check
    // first-of-day → upsert EmpireProgress with XP + conditional streak.
    //
    // G-03 FIX: XP is now a once-per-Madrid-day reward, gated by the SAME
    // isFirstLogToday flag that drives the streak (computed inside the
    // advisory-locked transaction on (userId, today), so two concurrent POSTs
    // can never both see themselves as "first"). The first valid log of the
    // day awards +10 XP; every later log of the same day still creates
    // normally (history, stats, balances, achievements) but awards +0 XP.
    // Note: "day" comes from createdAt (server clock) via the unified
    // Europe/Madrid utilities — never from the user-supplied `date` field.
    const todayDateKey = getTodayDateKey();
    const { start: todayStart, end: todayEnd } = madridDayBoundaries(todayDateKey);

    const log = await db.$transaction(async (tx) => {
      // Advisory lock on (userId, today) — prevents concurrent POSTs from both
      // seeing isFirstLogToday=true and double-incrementing the streak.
      const lockSeed = user.id + '|riqueza|' + todayDateKey;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${lockSeed}), 1, 16))::bit(64)::bigint
        )`;

      const created = await tx.financeLog.create({
        data: {
          userId: user.id,
          date: dateObj,
          type,
          category: category.trim().slice(0, 100),
          amount: roundedAmount,
          description: description?.trim()?.slice(0, 500) || null,
          mood: mood?.trim()?.slice(0, 50) || null,
          contexto: contexto?.trim()?.slice(0, 1000) || null,
        },
      });

      // Check if any OTHER finance log was already created today (Madrid).
      // Uses createdAt (server timestamp) to determine the user's active day,
      // not the user-assigned `date` field which can be backdated.
      const otherLogToday = await tx.financeLog.findFirst({
        where: {
          userId: user.id,
          id: { not: created.id },
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        select: { id: true },
      });
      const isFirstLogToday = !otherLogToday;

      await tx.empireProgress.upsert({
        where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
        update: {
          // G-03 FIX: repeat logs of the same Madrid day award +0 XP.
          xp: { increment: isFirstLogToday ? 10 : 0 },
          ...(isFirstLogToday ? { streak: { increment: 1 } } : {}),
        },
        // Defensive create path: the row is normally created at signup; if it
        // is ever missing, only a genuinely first-of-day log may seed it with
        // the daily reward.
        create: {
          userId: user.id,
          empire: 'riqueza',
          xp: isFirstLogToday ? 10 : 0,
          streak: isFirstLogToday ? 1 : 0,
        },
      });

      return created;
    });

    // F-12: trigger widget refresh (non-blocking)
    onFinanceChange(user.id, user.plan);

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

    const rl = await rateLimit(user.id, 'finance:put', RATE_LIMITS['finance:put']);
    if (rl.limited) return rateLimitedResponse(rl);

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
      const dateObj = startOfMadridDay(date);
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

    // F-12: trigger widget refresh (non-blocking)
    onFinanceChange(user.id, user.plan);

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

    const rl = await rateLimit(user.id, 'finance:delete', RATE_LIMITS['finance:delete']);
    if (rl.limited) return rateLimitedResponse(rl);

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

    // F-4: Revert XP and streak inside a transaction.
    // Mirrors the meditation DELETE pattern: delete → check if deleted log was
    // the sole trigger for today's streak → conditionally decrement.
    //
    // G-03 FIX: XP is a once-per-Madrid-day reward, so the revert must be
    // day-based too. Previously EVERY deleted log removed 10 XP, which under
    // G-03 would let users lose XP by deleting a repeat log that never awarded
    // any. Now the day's +10 is reverted only when this delete leaves the
    // log's Madrid day (by createdAt — the same day definition the award uses)
    // with NO other finance log. The streak keeps its existing semantics
    // (decrement only when today's sole log is deleted). The advisory lock
    // (same family as POST, keyed to the log's Madrid day) serializes this
    // decision against concurrent POSTs/DELETEs for the same day.
    const todayDateKey = getTodayDateKey();
    const logDateKey = getMadridDateKey(existing.createdAt);
    const { start: dayStart, end: dayEnd } = madridDayBoundaries(logDateKey);
    await db.$transaction(async (tx) => {
      const lockSeed = user.id + '|riqueza|' + logDateKey;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${lockSeed}), 1, 16))::bit(64)::bigint
        )`;

      await tx.financeLog.delete({ where: { id: logId } });

      const riquezaProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
      });
      if (!riquezaProgress) return;

      // Does any OTHER finance log of the same Madrid day remain?
      const otherLogSameDay = await tx.financeLog.findFirst({
        where: {
          userId: user.id,
          id: { not: logId },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      });
      const dayNowEmpty = !otherLogSameDay;

      const revertXp = dayNowEmpty;
      const decrementStreak = dayNowEmpty && logDateKey === todayDateKey;

      await tx.empireProgress.update({
        where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
        data: {
          xp: Math.max(0, riquezaProgress.xp - (revertXp ? 10 : 0)),
          ...(decrementStreak ? { streak: Math.max(0, riquezaProgress.streak - 1) } : {}),
        },
      });
    });

    // F-12: trigger widget refresh (non-blocking)
    onFinanceChange(user.id, user.plan);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Finance DELETE error:', error);
    return NextResponse.json({ error: 'Error al eliminar el registro.' }, { status: 500 });
  }
}
