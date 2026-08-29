export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { getTodayDateKey, getMadridDateKey } from '@/lib/deterministic';
import { madridDayBoundaries, startOfMadridDay } from '@/lib/dates';
import { onHabitChange } from '@/lib/widgets/triggers';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * POST /api/habits/undo
 * H-9 FIX: Deshacer la última completación de un hábito.
 *
 * Requisitos de la operación:
 * - El hábito debe haber sido completado en el período actual (hoy para daily,
 *   esta semana para weekly, este mes para monthly).
 * - Se decrementa la racha (streak) en 1, con floor en 0.
 * - Se restaura lastCompletedAt al valor anterior a la completación si existe;
 *   si no existe (era la primera completación), se pone a null.
 * - Se decrementa XP en 10 (floor 0) en el imperio disciplina.
 * - Se decrementa la racha del imperio si este hábito fue el único completado hoy.
 * - Toda la operación se ejecuta dentro de una transacción con SELECT FOR UPDATE
 *   para evitar condiciones de carrera.
 *
 * Body: { habitId: string, previousLastCompletedAt?: string | null }
 * - previousLastCompletedAt: valor previo que capturó el frontend antes de completar.
 *   Si no se envía o es null, se pone lastCompletedAt a null.
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
    if (rl.limited) return NextResponse.json({ error: 'Too many requests', retryAfter: rl.resetAt }, { status: 429 });

    const { habitId, previousLastCompletedAt } = await request.json();

    const txResult = await db.$transaction(async (tx) => {
      // SELECT FOR UPDATE — misma protección contra carreras que PATCH
      const habits = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        name: string;
        frequency: string;
        streak: number;
        lastCompletedAt: Date | null;
      }>>`SELECT * FROM "HabitLog" WHERE "id" = ${habitId} AND "userId" = ${user.id} FOR UPDATE`;

      const habit = habits[0];
      if (!habit) return { status: 'not_found' as const };

      // Verificar que fue completado en el período actual
      if (!habit.lastCompletedAt) {
        return { status: 'not_completed' as const };
      }

      const todayDateKey = getTodayDateKey();
      const lastDateKey = getMadridDateKey(habit.lastCompletedAt);
      const todayMs = startOfMadridDay(todayDateKey).getTime();
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

      // Restaurar lastCompletedAt
      const restoredLastCompletedAt = previousLastCompletedAt
        ? new Date(previousLastCompletedAt)
        : null;

      const updated = await tx.habitLog.update({
        where: { id: habitId },
        data: {
          streak: newStreak,
          lastCompletedAt: restoredLastCompletedAt,
        },
      });

      // Decrementar XP del imperio disciplina (floor 0)
      const disciplinaProgress = await tx.empireProgress.findUnique({
        where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
      });

      if (disciplinaProgress) {
        // Verificar si este hábito fue el único completado hoy
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

        await tx.empireProgress.update({
          where: { userId_empire: { userId: user.id, empire: 'disciplina' } },
          data: {
            xp: Math.max(0, disciplinaProgress.xp - 10),
            ...(wasOnlyCompletionToday
              ? { streak: Math.max(0, disciplinaProgress.streak - 1) }
              : {}),
          },
        });
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

    return NextResponse.json({ habit: txResult.habit });
  } catch (error) {
    console.error('Habits UNDO error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
