// ═══════════════════════════════════════════
// VITAZEN — Silent Memories: Server Layer
// ═══════════════════════════════════════════
//
// Server-only data access for silent memories.
// All Prisma/db queries live here.
// This module MUST NEVER be imported from a client component.
//
// Returns raw serializable data — no observations,
// no state management, no localStorage.
// The client handles observation selection and rarity.
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import type { SilentMemoryData } from '@/lib/silent-memories/shared';

// ─── Helper ───

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ─── Main function ───

/**
 * Fetch raw data for silent memory computation.
 * Called ONLY from API routes or server components.
 * Returns serializable data — the client decides what to show.
 */
export async function getSilentMemoryData(userId: string): Promise<SilentMemoryData> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  // Run all queries in parallel for maximum performance
  const [
    firstActivity,
    recentActivity,
    thisWeekCheckins,
    prevWeekCheckins,
    monthAgoCheckins,
  ] = await Promise.all([
    // 1. First activity date (temporal observation)
    db.dailyCheckin.findFirst({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true },
    }),

    // 2. Recent activity for consecutive days (presence observation)
    Promise.all([
      db.dailyCheckin.findMany({
        where: { userId, date: { gte: thirtyDaysAgo } },
        select: { date: true },
      }),
      db.habitLog.findMany({
        where: { userId, lastCompletedAt: { gte: thirtyDaysAgo, not: null } },
        select: { lastCompletedAt: true },
      }),
      db.wellnessLog.findMany({
        where: { userId, date: { gte: thirtyDaysAgo } },
        select: { date: true },
      }),
    ]),

    // 3. This week checkins (shift + recurrence observation)
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: new Date(Date.now() - 7 * 86400000) } },
      select: { energy: true, stress: true },
    }),

    // 4. Previous week checkins (shift observation)
    db.dailyCheckin.findMany({
      where: {
        userId,
        date: {
          gte: new Date(Date.now() - 14 * 86400000),
          lt: new Date(Date.now() - 7 * 86400000),
        },
      },
      select: { energy: true, stress: true },
    }),

    // 5. Month ago checkins (recurrence observation)
    db.dailyCheckin.findMany({
      where: {
        userId,
        date: {
          gte: new Date(Date.now() - 35 * 86400000),
          lt: new Date(Date.now() - 28 * 86400000),
        },
      },
      select: { energy: true, stress: true },
    }),
  ]);

  // ─── Compute consecutive days ───
  const [checkins, habits, wellness] = recentActivity;
  const recentDays = new Set<string>();

  const addDay = (d: Date) => {
    const day = new Date(d);
    recentDays.add(
      `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    );
  };

  checkins.forEach((c) => addDay(c.date));
  habits.forEach((h) => {
    if (h.lastCompletedAt) addDay(h.lastCompletedAt);
  });
  wellness.forEach((w) => addDay(w.date));

  // Count consecutive days backwards from today
  let consecutiveDays = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const checkDate = new Date(today.getTime() - i * 86400000);
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    if (recentDays.has(dateStr)) {
      consecutiveDays++;
    } else {
      break;
    }
  }

  // ─── Compute weekly averages ───
  const thisWeek =
    thisWeekCheckins.length >= 3
      ? {
          avgEnergy: avg(thisWeekCheckins.map((c) => c.energy)),
          avgStress: avg(thisWeekCheckins.map((c) => c.stress)),
          count: thisWeekCheckins.length,
        }
      : null;

  const prevWeek =
    prevWeekCheckins.length >= 3
      ? {
          avgEnergy: avg(prevWeekCheckins.map((c) => c.energy)),
          avgStress: avg(prevWeekCheckins.map((c) => c.stress)),
          count: prevWeekCheckins.length,
        }
      : null;

  // Recurrence uses the same this-week data as shift
  const thisWeekRecurrence =
    thisWeekCheckins.length >= 3
      ? {
          avgEnergy: avg(thisWeekCheckins.map((c) => c.energy)),
          avgStress: avg(thisWeekCheckins.map((c) => c.stress)),
          count: thisWeekCheckins.length,
        }
      : null;

  const monthAgo =
    monthAgoCheckins.length >= 3
      ? {
          avgEnergy: avg(monthAgoCheckins.map((c) => c.energy)),
          avgStress: avg(monthAgoCheckins.map((c) => c.stress)),
          count: monthAgoCheckins.length,
        }
      : null;

  return {
    firstActivityDate: firstActivity ? firstActivity.date.toISOString() : null,
    consecutiveDays,
    thisWeek,
    prevWeek,
    thisWeekForRecurrence: thisWeekRecurrence,
    monthAgo,
  };
}
