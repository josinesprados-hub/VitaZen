export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries, startOfMadridDay, madridDaysAgo } from '@/lib/dates';

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
        date: { gte: startOfMadridDay(madridDaysAgo(days)) },
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
    // R-8 FIX: validate date (POST already validates it, PUT did not)
    if (!date) return NextResponse.json({ error: 'La fecha es obligatoria' }, { status: 400 });

    // R-1 FIX: PUT changes the `date` field but previously never touched
    // EmpireProgress. If a user moved a log FROM today TO yesterday, today
    // lost its only log but the streak stayed incremented (inflated). If they
    // moved a log FROM yesterday TO today, yesterday lost its log (streak
    // should decrement) and today gained one (streak should increment) — but
    // nothing happened, silently corrupting the streak.
    //
    // Fix: detect if the Madrid date key changed. If so, reconcile BOTH the
    // old day (as if the log was deleted from it) and the new day (as if the
    // log was created on it). The reconciliation reuses the same logic as
    // DELETE (hasRemainingToday check) and POST (isFirstLogToday check).
    //
    // Everything runs inside a transaction with an advisory lock on BOTH the
    // old and new Madrid date keys, so concurrent PUTs/POSTs/DELETEs on either
    // day are serialized. This also closes the POST/DELETE race (R-2/R-3).
    const oldDateKey = getMadridDateKey(log.date);
    const newDateKey = getMadridDateKey(new Date(date));
    const dateChanged = oldDateKey !== newDateKey;

    const updated = await db.$transaction(async (tx) => {
      // Acquire advisory locks on both days (if date changed) to serialize
      // against concurrent POST/DELETE/PUT on either day. The keys are
      // namespaced with '|riqueza|' to avoid collisions with the checkin
      // advisory lock ('|') and the energia advisory lock ('|energia|').
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|riqueza|' || ${oldDateKey}), 1, 16))::bit(64)::bigint
        )`;
      if (dateChanged) {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            ('x' || substring(md5(${user.id} || '|riqueza|' || ${newDateKey}), 1, 16))::bit(64)::bigint
          )`;
      }

      const result = await tx.financeLog.update({
        where: { id: logId },
        data: { date: new Date(date), type, category: category.trim(), amount: Number(amount), description: description?.trim() || null, mood: mood || null, contexto: contexto?.trim() || null },
      });

      if (dateChanged) {
        const riquezaProgress = await tx.empireProgress.findUnique({
          where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
        });
        if (riquezaProgress) {
          // ── Reconcile OLD day (as if the log was deleted from it) ──
          // After the update, the log is no longer on oldDateKey. Check if
          // any OTHER log remains for oldDateKey.
          const { start: oldStart, end: oldEnd } = madridDayBoundaries(oldDateKey);
          const remainingOldDay = await tx.financeLog.findFirst({
            where: {
              userId: user.id,
              id: { not: logId },
              date: { gte: oldStart, lt: oldEnd },
            },
            select: { id: true },
          });
          // If no other log remains on the old day, the old day lost its only
          // log — decrement the streak (mirrors DELETE).
          const decrementStreak = !remainingOldDay;

          // ── Reconcile NEW day (as if the log was created on it) ──
          // The log is now on newDateKey. Check if any OTHER log (excluding
          // this one) already exists for newDateKey — i.e., was the new day
          // already an active day before this move?
          const { start: newStart, end: newEnd } = madridDayBoundaries(newDateKey);
          const existingNewDay = await tx.financeLog.findFirst({
            where: {
              userId: user.id,
              id: { not: logId },
              date: { gte: newStart, lt: newEnd },
            },
            select: { id: true },
          });
          // If the new day had no other log, this move makes it an active
          // day — increment the streak (mirrors POST).
          const incrementStreak = !existingNewDay;

          // Apply net streak change. If both decrement and increment (moved
          // from a day that lost its only log to a day that had no log), net
          // is 0 — but we still must ensure the XP is not double-counted.
          // XP is NOT changed by PUT (the log already had its +10 XP from
          // the original POST, and PUT doesn't add new XP).
          const streakDelta = (incrementStreak ? 1 : 0) - (decrementStreak ? 1 : 0);
          if (streakDelta !== 0) {
            await tx.empireProgress.update({
              where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
              data: { streak: Math.max(0, riquezaProgress.streak + streakDelta) },
            });
          }
        }
      }

      return result;
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

    // R-2/R-3 FIX: Wrap the delete + XP/streak revert in a transaction with an
    // advisory lock keyed on (userId, 'riqueza', deletedDateKey). This
    // serializes concurrent DELETEs and POST↔DELETE races for the same Madrid
    // day, so the "hasRemainingToday" check is consistent.
    //
    // Without the lock, two concurrent DELETEs of DIFFERENT logs from the same
    // Madrid day could both see hasRemainingToday=false (because both deletes
    // committed before either check ran) and both decrement the streak —
    // double-decrementing for a single day loss.
    //
    // Without the transaction, if the empireProgress update failed after the
    // financeLog delete succeeded, the log was gone but the XP/streak stayed
    // inflated — silent permanent drift.
    await db.$transaction(async (tx) => {
      // Acquire advisory lock on the Madrid day of the log being deleted.
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|riqueza|' || ${deletedDateKey}), 1, 16))::bit(64)::bigint
        )`;

      await tx.financeLog.delete({ where: { id: logId } });

      // Check if any FinanceLog remains for the same Madrid day (after the
      // delete, inside the transaction, so the result is consistent).
      const { start, end } = madridDayBoundaries(deletedDateKey);
      const remainingSameDay = await tx.financeLog.findFirst({
        where: {
          userId: user.id,
          date: { gte: start, lt: end },
        },
        select: { id: true },
      });
      const hasRemainingToday = !!remainingSameDay;

      // Revert XP for riqueza empire (never below 0, don't create if missing)
      const riquezaProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
      });
      if (riquezaProgress) {
        if (hasRemainingToday) {
          // Other logs remain for this Madrid day — only revert XP
          await tx.empireProgress.update({
            where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
            data: { xp: Math.max(0, riquezaProgress.xp - 10) },
          });
        } else {
          // This was the last log for this Madrid day — revert XP and streak
          await tx.empireProgress.update({
            where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
            data: { xp: Math.max(0, riquezaProgress.xp - 10), streak: Math.max(0, riquezaProgress.streak - 1) },
          });
        }
      }
    });

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

    // R-3 FIX (race condition): The original code did `findMany → create →
    // upsert` as three separate operations with no transaction. Two concurrent
    // POSTs (mobile + desktop, or double-tap) could both see
    // isFirstLogToday=true (both see no existing log for the day), both create
    // a log, and BOTH award +1 streak — double-incrementing the riqueza
    // streak for a single Madrid day. Same race class as M-3 (checkin),
    // E-3 (wellness/nutrition), and H-3 (habits).
    //
    // Fix: acquire a transaction-scoped advisory lock keyed on
    // (userId, 'riqueza', dateKey) BEFORE reading or writing. The lock
    // serializes concurrent POSTs (and concurrent PUT/DELETEs) for the same
    // Madrid day. The whole operation (create + empireProgress upsert) runs
    // inside the transaction so partial failures cannot leave inconsistent
    // state (R-3).
    //
    // The advisory lock key is namespaced with '|riqueza|' so it does not
    // collide with the checkin advisory lock ('|') or the energia advisory
    // lock ('|energia|').
    const logDateKey = getMadridDateKey(new Date(date));

    const log = await db.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock on (userId, 'riqueza', today).
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${user.id} || '|riqueza|' || ${logDateKey}), 1, 16))::bit(64)::bigint
        )`;

      // Check if user already has a FinanceLog for this Madrid day (inside
      // the transaction, so the result is consistent with the create below).
      const { start, end } = madridDayBoundaries(logDateKey);
      const existingSameDay = await tx.financeLog.findFirst({
        where: {
          userId: user.id,
          date: { gte: start, lt: end },
        },
        select: { id: true },
      });
      const isFirstLogToday = !existingSameDay;

      const created = await tx.financeLog.create({
        data: { userId: user.id, date: new Date(date), type, category: category.trim(), amount: Number(amount), description: description?.trim() || null, mood: mood || null, contexto: contexto?.trim() || null },
      });

      // Award XP to riqueza empire; streak only on first log of the day
      if (isFirstLogToday) {
        await tx.empireProgress.upsert({
          where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
          update: { xp: { increment: 10 }, streak: { increment: 1 } },
          create: { userId: user.id, empire: 'riqueza', xp: 10, streak: 1 },
        });
      } else {
        await tx.empireProgress.upsert({
          where: { userId_empire: { userId: user.id, empire: 'riqueza' } },
          update: { xp: { increment: 10 } },
          create: { userId: user.id, empire: 'riqueza', xp: 10 },
        });
      }

      return created;
    });

    return NextResponse.json({ log });
  } catch (error) {
    console.error('Finance POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
