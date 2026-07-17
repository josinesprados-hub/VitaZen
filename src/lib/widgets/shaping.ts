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
import { DAILY_QUOTES } from '@/lib/daily-quotes';
import {
  ReflectionWidgetPayload,
  MomentumWidgetPayload,
  CheckinWidgetPayload,
  DailyFocusWidgetPayload,
  CalmQuoteWidgetPayload,
  EMOTION_LABELS,
} from './types';

// ─── Helpers ────────────────────────────────

import { deterministicIndex, getTodayDateKey, getMadridDateKey, startOf7DaysAgoMadrid, startOf14DaysAgoMadrid, calcStreakFromKeys, startOfTodayMadrid } from '@/lib/dates';

// ─── Reflection Widget ──────────────────────
//
// Selects a daily quote from DAILY_QUOTES using deterministic hashing.
// Same quote shown all day, different each day.
// PREMIUM users get category info for themed rendering.

const REFLECTION_CATEGORIES = [
  'ritmo', 'claridad', 'presencia', 'atención',
  'dirección', 'movimiento', 'energía', 'silencio',
] as const;

export async function shapeReflectionPayload(
  userId: string,
  _plan: string,
): Promise<ReflectionWidgetPayload> {
  const dateKey = getTodayDateKey();
  const index = deterministicIndex(dateKey + userId, DAILY_QUOTES.length);
  const text = DAILY_QUOTES[index].text;
  const categoryIndex = deterministicIndex(dateKey, REFLECTION_CATEGORIES.length);

  const payload: ReflectionWidgetPayload = {
    text,
    label: 'Frase del día',
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
  if (score >= 61) return { level: 'fuerte', description: 'Ritmo constante.' };
  if (score >= 31) return { level: 'estable', description: 'Ritmo estable.' };
  return { level: 'bajo', description: '' };
}

export async function shapeMomentumPayload(
  userId: string,
  _plan: string,
): Promise<MomentumWidgetPayload> {
  const sevenDaysAgo = startOf7DaysAgoMadrid();
  const fourteenDaysAgo = startOf14DaysAgoMadrid();

  // Fetch 7-day activity counts
  const [
    meditationSessions,
    habitCompletions,
    journalEntries,
    checkins,
    challengesCompleted,
    wellnessEntries,
    nutritionEntries,
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
    db.wellnessLog.count({
      where: { userId, date: { gte: sevenDaysAgo } },
    }),
    db.nutritionLog.count({
      where: { userId, date: { gte: sevenDaysAgo } },
    }),
  ]);

  // Fetch previous week for trend
  // GLOBAL-7 FIX: prevHabits is always 0 because HabitLog.lastCompletedAt is
  // a single timestamp updated on every completion. A habit completed both
  // this week AND last week has lastCompletedAt in THIS week, so it's excluded
  // from the previous-week count. This systematically biases the trend toward
  // "down" for active users. Without a per-day completion log table, we cannot
  // accurately count previous-week habit completions. We exclude habits from
  // the trend calculation to avoid the systematic bias.
  const [
    prevMeditation, prevJournal, prevCheckins, prevChallenges, prevWellness, prevNutrition,
  ] = await Promise.all([
    db.meditationSession.count({
      where: { userId, completedAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
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
    db.wellnessLog.count({
      where: { userId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
    db.nutritionLog.count({
      where: { userId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
    }),
  ]);

  // Count unique active days (lightweight — only dates, not full records)
  const [medDates, habDates, jouDates, checkDates, wellDates, nutDates] = await Promise.all([
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
    db.wellnessLog.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      select: { date: true },
    }),
    db.nutritionLog.findMany({
      where: { userId, date: { gte: sevenDaysAgo } },
      select: { date: true },
    }),
  ]);

  const allRecentDates = new Set<string>();
  const addDates = (dates: Date[]) => {
    for (const d of dates) {
      allRecentDates.add(getMadridDateKey(new Date(d)));
    }
  };
  addDates(medDates.map(m => m.completedAt));
  addDates(habDates.map(h => h.lastCompletedAt!));
  addDates(jouDates.map(j => j.createdAt));
  addDates(checkDates.map(c => c.date));
  addDates(wellDates.map(w => w.date));
  addDates(nutDates.map(n => n.date));

  const activeDays = allRecentDates.size;

  // Calculate streak (simplified — look backwards from today)
  const [allMed, allHab, allJou, allCheck, allWell, allNut] = await Promise.all([
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
    db.wellnessLog.findMany({
      where: { userId },
      select: { date: true },
      orderBy: { date: 'desc' },
      take: 30,
    }),
    db.nutritionLog.findMany({
      where: { userId },
      select: { date: true },
      orderBy: { date: 'desc' },
      take: 30,
    }),
  ]);

  const uniqueDays = new Set<string>();
  for (const d of [...allMed.map(m => m.completedAt), ...allHab.map(h => h.lastCompletedAt!), ...allJou.map(j => j.createdAt), ...allCheck.map(c => c.date), ...allWell.map(w => w.date), ...allNut.map(n => n.date)]) {
    uniqueDays.add(getMadridDateKey(new Date(d)));
  }

  const streak = calcStreakFromKeys(uniqueDays);

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
  const currentWeekTotal = meditationSessions + habitCompletions + journalEntries + checkins + challengesCompleted + wellnessEntries + nutritionEntries;
  // GLOBAL-7 FIX: prevHabits removed from trend (was always 0 — see above).
  // currentWeekTotal still includes habitCompletions for the score, but the
  // trend comparison excludes it to avoid the systematic "down" bias.
  const prevWeekTotal = prevMeditation + prevJournal + prevCheckins + prevChallenges + prevWellness + prevNutrition;

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
  const today = startOfTodayMadrid();

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
  const nudgeIndex = deterministicIndex(dateKey, CHECKIN_NUDGES.length);

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
  riqueza: 'Finanzas',
  crecimiento: 'Crecimiento',
};

export async function shapeDailyFocusPayload(
  userId: string,
  _plan: string,
): Promise<DailyFocusWidgetPayload> {
  const dateKey = getTodayDateKey();
  const empireIndex = deterministicIndex(dateKey + userId, EMPIRES.length);
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
    disciplina: { title: 'Disciplina', content: 'Días que se repiten.' },
    mente: { title: 'Calma', content: 'La calma se nota cuando llega.' },
    energia: { title: 'Energía', content: 'El cuerpo sabe antes que la cabeza.' },
    riqueza: { title: 'Finanzas', content: 'El dinero refleja decisiones.' },
    crecimiento: { title: 'Crecimiento', content: 'Algunas cosas cambian sin hacer ruido.' },
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
// Uses the same DAILY_QUOTES collection but framed as a quote widget.

const QUOTE_CATEGORIES = [
  'Ritmo',
  'Claridad',
  'Calma',
  'Atención',
  'Dirección',
  'Movimiento',
  'Energía',
  'Silencio',
  'Presencia',
  'Soltar',
] as const;

export async function shapeCalmQuotePayload(
  userId: string,
  _plan: string,
): Promise<CalmQuoteWidgetPayload> {
  const dateKey = getTodayDateKey();

  // Use a different seed AND offset from the reflection index
  // to ensure the quote and reflection are different each day
  const reflectionIndex = deterministicIndex(dateKey + userId, DAILY_QUOTES.length);
  let quoteIndex = deterministicIndex(dateKey + userId + '_quote', DAILY_QUOTES.length);

  // Avoid showing the same reflection as the quote
  if (quoteIndex === reflectionIndex && DAILY_QUOTES.length > 1) {
    quoteIndex = (quoteIndex + 1) % DAILY_QUOTES.length;
  }

  const quote = DAILY_QUOTES[quoteIndex].text;
  const categoryIndex = deterministicIndex(dateKey + '_cat', QUOTE_CATEGORIES.length);

  return {
    quote,
    category: QUOTE_CATEGORIES[categoryIndex],
    dateKey,
  };
}
