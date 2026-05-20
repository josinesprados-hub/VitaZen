// ═══════════════════════════════════════════
// WIDGET PAYLOAD SHAPING — VitaZen
// Transforms raw DB data into minimal, widget-ready payloads
// ═══════════════════════════════════════════
//
// Each shaping function:
//   1. Queries the MINIMUM data needed
//   2. Transforms into a flat, small JSON object
//   3. Returns a payload under 1KB
//
// Important: these functions are called during snapshot computation,
// NOT on every widget read. This is what makes reads O(1).

import { db } from '@/lib/db';
import { REFLECTIONS } from '@/lib/reflections';
import {
  ReflectionWidgetPayload,
  MomentumWidgetPayload,
  CheckinWidgetPayload,
  DailyFocusWidgetPayload,
  CalmQuoteWidgetPayload,
  EMOTION_LABELS,
} from './types';

// ─── Helpers ────────────────────────────────

/** Deterministic daily index from date — same selection all day */
function getDailyIndex(dateKey: string, arrayLength: number): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    const char = dateKey.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash) % arrayLength;
}

/** Get today's date key in YYYY-MM-DD format */
function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ─── Reflection Widget ──────────────────────
//
// Selects a daily reflection using deterministic hashing.
// Same reflection shown all day, different each day.
// PREMIUM users get category info for themed rendering.

const REFLECTION_CATEGORIES = [
  'disciplina', 'claridad', 'presencia', 'enfoque',
  'propósito', 'crecimiento', 'bienestar', 'mente',
] as const;

export async function shapeReflectionPayload(
  userId: string,
  _plan: string,
): Promise<ReflectionWidgetPayload> {
  const dateKey = getTodayDateKey();
  const index = getDailyIndex(dateKey + userId, REFLECTIONS.length);
  const text = REFLECTIONS[index].text;
  const categoryIndex = getDailyIndex(dateKey, REFLECTION_CATEGORIES.length);

  const payload: ReflectionWidgetPayload = {
    text,
    label: 'Reflexión del día',
    dateKey,
  };

  // PREMIUM: add category hint
  if (_plan === 'PREMIUM') {
    payload.category = REFLECTION_CATEGORIES[categoryIndex];
  }

  return payload;
}

// ─── Momentum Widget ────────────────────────
//
// Lightweight momentum score. Reuses the same logic as
// /api/dashboard/momentum but returns only the essentials.
// No breakdown, no detailed scores — just the headline.

function getMomentumLevel(score: number): { level: string; description: string } {
  if (score >= 61) return { level: 'fuerte', description: 'Consistencia notable.' };
  if (score >= 31) return { level: 'estable', description: 'Buen ritmo.' };
  return { level: 'bajo', description: '' };
}

export async function shapeMomentumPayload(
  userId: string,
  _plan: string,
): Promise<MomentumWidgetPayload> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Fetch 7-day activity counts
  const [
    meditationSessions,
    habitCompletions,
    journalEntries,
    checkins,
    challengesCompleted,
  ] = await Promise.all([
    db.meditationSession.count({
      where: { userId, completedAt: { gte: sevenDaysAgo } },
    }),
    db.habitLog.count({
      where: { userId, lastCompletedAt: { gte: sevenDaysAgo, not: null } },
    }),
    db.journalEntry.count({
      where: { userId, createdAt: { gte: sevenDaysAgo } },
    }),
    db.dailyCheckin.count({
      where: { userId, date: { gte: sevenDaysAgo } },
    }),
    db.userChallenge.count({
      where: { userId, completed: true, completedAt: { gte: sevenDaysAgo } },
    }),
  ]);

  // Fetch previous week for trend
  const [
    prevMeditation, prevHabits, prevJournal, prevCheckins, prevChallenges,
  ] = await Promise.all([
    db.meditationSession.count({
      where: { userId, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    db.habitLog.count({
      where: { userId, lastCompletedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo, not: null } },
    }),
    db.journalEntry.count({
      where: { userId, createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    db.dailyCheckin.count({
      where: { userId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    db.userChallenge.count({
      where: { userId, completed: true, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
  ]);

  // Count unique active days (lightweight — only dates, not full records)
  const [medDates, habDates, jouDates, checkDates] = await Promise.all([
    db.meditationSession.findMany({
      where: { userId, completedAt: { gte: sevenDaysAgo } },
      select: { completedAt: true },
    }),
    db.habitLog.findMany({
      where: { userId, lastCompletedAt: { gte: sevenDaysAgo, not: null } },
      select: { lastCompletedAt: true },
    }),
    db.journalEntry.findMany({
      where: { userId, createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),
    db.dailyCheckin.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      select: { date: true },
    }),
  ]);

  const allRecentDates = new Set<string>();
  const addDates = (dates: Date[]) => {
    for (const d of dates) {
      const day = new Date(d);
      allRecentDates.add(`${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`);
    }
  };
  addDates(medDates.map(m => m.completedAt));
  addDates(habDates.map(h => h.lastCompletedAt!));
  addDates(jouDates.map(j => j.createdAt));
  addDates(checkDates.map(c => c.date));

  const activeDays = allRecentDates.size;

  // Calculate streak (simplified — look backwards from today)
  const [allMed, allHab, allJou, allCheck] = await Promise.all([
    db.meditationSession.findMany({
      where: { userId },
      select: { completedAt: true },
      orderBy: { completedAt: 'desc' },
      take: 30,
    }),
    db.habitLog.findMany({
      where: { userId, lastCompletedAt: { not: null } },
      select: { lastCompletedAt: true },
      orderBy: { lastCompletedAt: 'desc' },
      take: 30,
    }),
    db.journalEntry.findMany({
      where: { userId },
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    db.dailyCheckin.findMany({
      where: { userId },
      select: { date: true },
      orderBy: { date: 'desc' },
      take: 30,
    }),
  ]);

  const uniqueDays = new Set<string>();
  for (const d of [...allMed.map(m => m.completedAt), ...allHab.map(h => h.lastCompletedAt!), ...allJou.map(j => j.createdAt), ...allCheck.map(c => c.date)]) {
    const day = new Date(d);
    uniqueDays.add(`${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`);
  }

  let checkDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;
  if (!uniqueDays.has(todayStr)) {
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
  }

  let streak = 0;
  while (true) {
    const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`;
    if (uniqueDays.has(dateStr)) {
      streak++;
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    } else {
      break;
    }
  }

  // ─── Calculate Score (same algorithm as /api/dashboard/momentum) ───
  const activityScore = Math.min(25, Math.round((activeDays / 7) * 25));
  const habitScore = Math.min(20, Math.round((habitCompletions / 7) * 20));
  const checkinScore = Math.min(15, Math.round((checkins / 7) * 15));
  const meditationScore = Math.min(15, Math.round((meditationSessions / 5) * 15));
  const journalScore = Math.min(10, Math.round((journalEntries / 3) * 10));
  const challengeScore = Math.min(10, Math.round((challengesCompleted / 3) * 10));
  const streakBonus = Math.min(5, Math.round((streak / 7) * 5));

  const score = Math.min(100, activityScore + habitScore + checkinScore + meditationScore + journalScore + challengeScore + streakBonus);

  // ─── Calculate Trend ───
  const currentWeekTotal = meditationSessions + habitCompletions + journalEntries + checkins + challengesCompleted;
  const prevWeekTotal = prevMeditation + prevHabits + prevJournal + prevCheckins + prevChallenges;

  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (currentWeekTotal > prevWeekTotal + 2) trend = 'up';
  else if (currentWeekTotal < prevWeekTotal - 2) trend = 'down';

  const momentumLevel = getMomentumLevel(score);

  return {
    score,
    level: momentumLevel.level,
    trend: currentWeekTotal > 0 ? trend : 'stable',
    streak,
    description: momentumLevel.description,
  };
}

// ─── Checkin Widget ─────────────────────────
//
// Shows today's check-in status. If checked in, show emotion/energy.
// If not checked in, show a calm nudge — never guilt.

const CHECKIN_NUDGES = [
  'Un momento para ti',
  'Tu espacio',
  'Respira',
  'Cuando quieras',
  'Sin prisa',
] as const;

export async function shapeCheckinPayload(
  userId: string,
  _plan: string,
): Promise<CheckinWidgetPayload> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkin = await db.dailyCheckin.findUnique({
    where: { userId_date: { userId, date: today } },
    select: { emotion: true, energy: true, intention: true },
  });

  if (checkin) {
    return {
      checkedIn: true,
      emotion: checkin.emotion,
      energy: checkin.energy,
      intention: checkin.intention,
      nudge: null,
    };
  }

  // Not checked in — pick a calm nudge (deterministic per day)
  const dateKey = getTodayDateKey();
  const nudgeIndex = getDailyIndex(dateKey, CHECKIN_NUDGES.length);

  return {
    checkedIn: false,
    emotion: null,
    energy: null,
    intention: null,
    nudge: CHECKIN_NUDGES[nudgeIndex],
  };
}

// ─── Daily Focus Widget ─────────────────────
//
// Shows today's focus area with a calm tip.
// Rotates through the 5 empires daily.

const EMPIRES = ['disciplina', 'mente', 'energia', 'riqueza', 'crecimiento'] as const;

const EMPIRE_LABELS: Record<string, string> = {
  disciplina: 'Disciplina',
  mente: 'Mente',
  energia: 'Energía',
  riqueza: 'Riqueza',
  crecimiento: 'Crecimiento',
};

export async function shapeDailyFocusPayload(
  userId: string,
  _plan: string,
): Promise<DailyFocusWidgetPayload> {
  const dateKey = getTodayDateKey();
  const empireIndex = getDailyIndex(dateKey + userId, EMPIRES.length);
  const empire = EMPIRES[empireIndex];

  // Fetch a tip for this empire
  const tip = await db.empireTip.findFirst({
    where: { empire, plan: 'FREE' }, // Always show FREE tips in widget
    select: { title: true, content: true },
  });

  // Fallback if no tip exists
  const focusArea = EMPIRE_LABELS[empire] || empire;

  if (tip) {
    return {
      focusArea,
      empire,
      tip: tip.content,
      tipTitle: tip.title,
    };
  }

  // Calm fallback tips per empire (no DB dependency)
  const FALLBACK_TIPS: Record<string, { title: string; content: string }> = {
    disciplina: { title: 'Disciplina', content: 'La disciplina no grita. Simplemente aparece cada día.' },
    mente: { title: 'Claridad', content: 'La claridad llega eliminando lo innecesario.' },
    energia: { title: 'Energía', content: 'La energía se gestiona, no se busca.' },
    riqueza: { title: 'Finanzas', content: 'El dinero no es la meta. La tranquilidad sí.' },
    crecimiento: { title: 'Crecimiento', content: 'Creces eligiendo lo difícil con amabilidad.' },
  };

  const fallback = FALLBACK_TIPS[empire] || FALLBACK_TIPS.mente;

  return {
    focusArea,
    empire,
    tip: fallback.content,
    tipTitle: fallback.title,
  };
}

// ─── Calm Quote Widget ──────────────────────
//
// Shows a daily premium calm quote. Same quote all day.
// Uses the same REFLECTIONS collection but framed as a quote widget.

const QUOTE_CATEGORIES = [
  'Disciplina silenciosa',
  'Claridad mental',
  'Presencia y calma',
  'Enfoque',
  'Propósito',
  'Crecimiento personal',
  'Bienestar y energía',
  'Mente y meditación',
  'Gratitud',
  'Soltar y simplicidad',
] as const;

export async function shapeCalmQuotePayload(
  userId: string,
  _plan: string,
): Promise<CalmQuoteWidgetPayload> {
  const dateKey = getTodayDateKey();

  // Use a different seed AND offset from the reflection index
  // to ensure the quote and reflection are different each day
  const reflectionIndex = getDailyIndex(dateKey + userId, REFLECTIONS.length);
  let quoteIndex = getDailyIndex(dateKey + userId + '_quote', REFLECTIONS.length);

  // Avoid showing the same reflection as the quote
  if (quoteIndex === reflectionIndex && REFLECTIONS.length > 1) {
    quoteIndex = (quoteIndex + 1) % REFLECTIONS.length;
  }

  const quote = REFLECTIONS[quoteIndex].text;
  const categoryIndex = getDailyIndex(dateKey + '_cat', QUOTE_CATEGORIES.length);

  return {
    quote,
    category: QUOTE_CATEGORIES[categoryIndex],
    dateKey,
  };
}
