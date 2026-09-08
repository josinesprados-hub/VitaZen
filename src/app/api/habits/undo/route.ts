export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries, startOfMadridDay } from '@/lib/dates';
import { currentHabitStreak } from '@/lib/streaks';
import { onHabitChange } from '@/lib/widgets/triggers';
import { rateLimit, RATE_LIMITS, rateLimitedResponse } from '@/lib/rate-limit';

/**
 * POST /api/habits/undo
 * H-9 FIX: Deshacer la última completación de un hábito.
 *
 * Requisitos de la operación:
 * - El hábito debe haber sido completado en el período actual (hoy para daily,
 *   esta semana para weekly, este mes para monthly).
 * - Se decrementa la racha (streak) en 1, con floor en 0.
 * - G-08 FIX: el servidor NO acepta ninguna fecha del cliente para reconstruir
 *   el estado anterior. HabitLog no conserva historial diario de completaciones,
 *   así que la fecha previa real NO puede conocerse de forma verificable — y un
 *   dato desconocido no se inventa (ni desde el cliente, ni por cálculo sobre el
 *   streak). La única representación segura del estado anterior es null:
 *   lastCompletedAt = null. Consecuencias analizadas y aceptadas:
 *     · La presentación G-06 (currentHabitStreak) muestra 0 mientras no haya
 *       nueva completación (isAlive(null) = false) — conservador, nunca falso.
 *     · El próximo PATCH parte de newStreak = 1 (ancla null) — la racha previa
 *       ya fue decrementada por este undo, así que no se pierde nada adicional.
 *     · El streak decrementado queda como dato interno sin ancla; ningún
 *       consumidor lo muestra desnudo (todo pasa por el gate G-06).
 *   Body legado: "previousLastCompletedAt" se ACEPTA e IGNORA silenciosamente
 *   (compatibilidad con clientes antiguos); ningún valor del body influye en el
 *   resultado.
 * - G-04: se decrementa XP en 10 (floor 0) en el imperio disciplina SOLO si la
 *   completación deshecha llegó a pagar (hábito creado antes del día Madrid de
 *   la completación — espejo exacto de la condición de concesión de PATCH).
 * - Se decrementa la racha del imperio si este hábito fue el único completado hoy.
 * - Toda la operación se ejecuta dentro de una transacción con advisory lock
 *   (familia user|disciplina|día, G-04) y SELECT FOR UPDATE para evitar
 *   condiciones de carrera.
 *
 * Body: { habitId: string }  — "previousLastCompletedAt" legacy: ignorado.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const rl = await rateLimit(user.id, 'habits:undo', RATE_LIMITS['habits:undo']);
    if (rl.limited) return rateLimitedResponse(rl);

    // G-08 FIX: defensive body parsing — a malformed/non-JSON body is user
    // input, never an internal error (no 500 from request.json()).
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }
    const { habitId } = body as { habitId?: unknown };
    if (typeof habitId !== 'string' || habitId.length === 0) {
      return NextResponse.json({ error: 'habitId es requerido' }, { status: 400 });
    }
    // "previousLastCompletedAt" is deliberately NOT read: the client cannot
    // dictate the prior state (G-08). Any value in the body is ignored.

    const txResult = await db.$transaction(async (tx) => {
      // G-04 FIX: same advisory-lock family as PATCH/DELETE (CERT-1/F-4/G-03
      // pattern) so undo cannot interleave with concurrent completions or
      // deletions of the same Madrid day.
      const todayDateKey = getTodayDateKey();
      const lockSeed = user.id + '|disciplina|' + todayDateKey;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          ('x' || substring(md5(${lockSeed}), 1, 16))::bit(64)::bigint
        )`;

      // SELECT FOR UPDATE — misma protección contra carreras que PATCH
      const habits = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        name: string;
        frequency: string;
        streak: number;
        lastCompletedAt: Date | null;
        createdAt: Date;
      }>>`SELECT * FROM "HabitLog" WHERE "id" = ${habitId} AND "userId" = ${user.id} FOR UPDATE`;

      const habit = habits[0];
      if (!habit) return { status: 'not_found' as const };

      // Verificar que fue completado en el período actual
      if (!habit.lastCompletedAt) {
        return { status: 'not_completed' as const };
      }

      const todayMs = startOfMadridDay(todayDateKey).getTime();
      const lastDateKey = getMadridDateKey(habit.lastCompletedAt);
      const lastMs = startOfMadridDay(lastDateKey).getTime();
      const diffDays = Math.round((todayMs - lastMs) / 86400000);

      const streakThreshold: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
      const threshold = streakThreshold[habit.frequency] || 1;

      // Solo se puede deshacer si la completación fue dentro del período actual
      if (diffDays >= threshold) {
        return { status: 'too_old' as const };
      }

      // Calcular nueva racha: decrementar en 1, floor 0
      const newStreak = Math.max(0, habit.streak - 1);

      // G-08 FIX: the previous anchor CANNOT be reconstructed from the DB
      // (HabitLog keeps no per-day completion history) and the client is no
      // longer trusted to supply it. "Dato desconocido > dato inventado": the
      // only safe representation of the pre-undo state is null. Consequences
      // are bounded and analyzed in the endpoint doc comment: the G-06 gate
      // presents 0 until the next real completion, and the next PATCH starts
      // a fresh chain (newStreak = 1) — the previous streak was already
      // decremented here, so nothing additional is lost.
      const restoredLastCompletedAt = null;

      const updated = await tx.habitLog.update({
        where: { id: habitId },
        data: {
          streak: newStreak,
          lastCompletedAt: restoredLastCompletedAt,
        },
      });

      // Decrementar XP del imperio disciplina — solo si la completación
      // deshecha llegó a pagar (G-04), con escrituras atómicas.
      //
      // G-04 FIX: PATCH solo concede +10 cuando el hábito se creó ANTES del
      // día Madrid de la completación (regla anti-farming del hábito fresco).
      // El undo debe ser el ESPEJO EXACTO de esa condición: deshacer una
      // completación de un hábito creado hoy (que pagó +0) no puede quitar
      // XP. Además ambos reverts son UPDATE atómicos con GREATEST (sin
      // read-modify-write, inmunes a lost updates frente a PATCH/challenge).
      const completionDayStart = startOfMadridDay(
        getMadridDateKey(habit.lastCompletedAt)
      ).getTime();
      const wasPayingCompletion = habit.createdAt.getTime() < completionDayStart;

      // Verificar si este hábito fue el único completado hoy (la racha del
      // imperio es independiente del XP: se mantiene el comportamiento H-12).
      const { start: todayStart, end: todayEnd } = madridDayBoundaries(todayDateKey);
      const otherCompletedToday = await tx.habitLog.findFirst({
        where: {
          userId: user.id,
          id: { not: habitId },
          lastCompletedAt: { gte: todayStart, lt: todayEnd },
        },
        select: { id: true },
      });
      const wasOnlyCompletionToday = !otherCompletedToday;

      if (wasPayingCompletion) {
        await tx.$executeRaw`
          UPDATE "EmpireProgress"
          SET "xp" = GREATEST(0, "xp" - 10)
          WHERE "userId" = ${user.id} AND "empire" = 'disciplina'`;
      }
      if (wasOnlyCompletionToday) {
        await tx.$executeRaw`
          UPDATE "EmpireProgress"
          SET "streak" = GREATEST(0, "streak" - 1)
          WHERE "userId" = ${user.id} AND "empire" = 'disciplina'`;
      }

      return { status: 'ok' as const, habit: updated };
    });

    if (txResult.status === 'not_found') {
      return NextResponse.json({ error: 'Hábito no encontrado' }, { status: 404 });
    }
    if (txResult.status === 'not_completed') {
      return NextResponse.json({ error: 'El hábito no está completado' }, { status: 400 });
    }
    if (txResult.status === 'too_old') {
      return NextResponse.json({ error: 'No se puede deshacer una completación anterior' }, { status: 400 });
    }

    // Disparar refresco de widgets (non-blocking)
    onHabitChange(user.id, user.plan);

    // G-06 FIX: respond with the CURRENT streak. Undoing a completion
    // restores the previous lastCompletedAt; if the restored chain is no
    // longer extendable (e.g. the previous completion was 2+ days ago and
    // the frontend had no previous value), the stored count must not be
    // presented as current — same gating as GET/PATCH/PUT.
    return NextResponse.json({ habit: { ...txResult.habit, streak: currentHabitStreak(txResult.habit) } });
  } catch (error) {
    console.error('Habits UNDO error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
