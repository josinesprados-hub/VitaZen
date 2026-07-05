// ═══════════════════════════════════════════
// Cierre Mensual — Digest
// ═══════════════════════════════════════════
//
// Computes the monthly summary from existing real data.
// NO external APIs. NO AI. NO scores.
// Only intelligent, sober observation logic.
//
// If insufficient data: silence.
// The silence IS the design.
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { getTodayDateKey } from '@/lib/deterministic';
import {
  formatMonthLabel,
  INTENTION_BALANCE_EMPTY,
  INTENTION_BALANCE_TITLE,
  EVOLUTION_NO_PREVIOUS,
  EVOLUTION_SAME,
  EVOLUTION_QUIETER,
  EVOLUTION_MORE_ACTIVE,
  FINANCIAL_NO_DATA,
  RHYTHM_QUIET,
  RHYTHM_ACTIVE,
  RHYTHM_VARIABLE,
  RHYTHM_STEADY,
  NO_DATA_TITLE,
  NO_DATA_SUBTITLE,
} from './copy';

// ─── Types ───

export interface IntentionBalance {
  tranquility: number;
  growth: number;
  necessity: number;
  enjoyment: number;
  total: number;
}

export interface FinancialSummary {
  income: number;
  expenses: number;
  balance: number;
  transactionCount: number;
  topCategories: { category: string; amount: number; intention?: string }[];
}

export interface RhythmData {
  checkinDays: number;
  journalEntries: number;
  habitCompletions: number;
  meditationSessions: number;
  wellnessLogs: number;
  nutritionLogs: number;
  financeLogs: number;
  totalActivity: number;
  rhythmLabel: string;
}

export interface MemoryItem {
  text: string;
  date: string;
  empire: string;
}

export interface EvolutionData {
  hasPrevious: boolean;
  direction: 'quieter' | 'same' | 'more_active' | 'first';
  label: string;
}

export interface MonthlyDigest {
  month: string;
  monthLabel: string;
  hasData: boolean;
  intentionBalance: IntentionBalance | null;
  financial: FinancialSummary | null;
  rhythm: RhythmData | null;
  memories: MemoryItem[];
  evolution: EvolutionData | null;
  noDataMessage: { title: string; subtitle: string } | null;
}

// ─── Helper: date range for a month ───

function getMonthRange(yyyyMM: string) {
  const [year, month] = yyyyMM.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // first day of next month
  return { start, end };
}

function getPreviousMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// ─── Intention Balance ───

async function computeIntentionBalance(
  userId: string,
  yyyyMM: string
): Promise<IntentionBalance | null> {
  const { start, end } = getMonthRange(yyyyMM);

  const logs = await db.financeLog.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      mood: { not: null },
    },
    select: { mood: true },
  });

  if (logs.length === 0) return null;

  const balance: IntentionBalance = {
    tranquility: 0,
    growth: 0,
    necessity: 0,
    enjoyment: 0,
    total: logs.length,
  };

  for (const log of logs) {
    const m = log.mood?.toLowerCase();
    if (m === 'tranquility' || m === 'calm') balance.tranquility++;
    else if (m === 'growth' || m === 'conscious') balance.growth++;
    else if (m === 'necessity' || m === 'necessary') balance.necessity++;
    else if (m === 'enjoyment' || m === 'impulse') balance.enjoyment++;
  }

  return balance;
}

// ─── Financial Summary ───

async function computeFinancialSummary(
  userId: string,
  yyyyMM: string
): Promise<FinancialSummary | null> {
  const { start, end } = getMonthRange(yyyyMM);

  const logs = await db.financeLog.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
    },
    select: { type: true, amount: true, category: true, mood: true },
    orderBy: { date: 'desc' },
  });

  if (logs.length === 0) return null;

  let income = 0;
  let expenses = 0;
  const categoryMap = new Map<string, { amount: number; intention?: string }>();

  for (const log of logs) {
    if (log.type === 'income') {
      income += log.amount;
    } else {
      expenses += log.amount;
      const key = log.category;
      const existing = categoryMap.get(key) || { amount: 0 };
      existing.amount += log.amount;
      if (log.mood && !existing.intention) existing.intention = log.mood;
      categoryMap.set(key, existing);
    }
  }

  const topCategories = Array.from(categoryMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    income,
    expenses,
    balance: income - expenses,
    transactionCount: logs.length,
    topCategories,
  };
}

// ─── Rhythm ───

async function computeRhythm(
  userId: string,
  yyyyMM: string
): Promise<RhythmData | null> {
  const { start, end } = getMonthRange(yyyyMM);

  const [checkins, journals, habits, meditations, wellness, nutrition, finances] =
    await Promise.all([
      db.dailyCheckin.count({
        where: { userId, date: { gte: start, lt: end } },
      }),
      db.journalEntry.count({
        where: {
          userId,
          createdAt: { gte: start, lt: end },
        },
      }),
      db.habitLog.count({
        where: {
          userId,
          lastCompletedAt: { gte: start, lt: end },
        },
      }),
      db.meditationSession.count({
        where: {
          userId,
          completedAt: { gte: start, lt: end },
        },
      }),
      db.wellnessLog.count({
        where: { userId, date: { gte: start, lt: end } },
      }),
      db.nutritionLog.count({
        where: { userId, date: { gte: start, lt: end } },
      }),
      db.financeLog.count({
        where: { userId, date: { gte: start, lt: end } },
      }),
    ]);

  const totalActivity =
    checkins + journals + habits + meditations + wellness + nutrition + finances;

  if (totalActivity === 0) return null;

  let rhythmLabel: string;
  if (totalActivity < 10) rhythmLabel = RHYTHM_QUIET;
  else if (totalActivity > 50) rhythmLabel = RHYTHM_ACTIVE;
  else if (totalActivity > 25) rhythmLabel = RHYTHM_VARIABLE;
  else rhythmLabel = RHYTHM_STEADY;

  return {
    checkinDays: checkins,
    journalEntries: journals,
    habitCompletions: habits,
    meditationSessions: meditations,
    wellnessLogs: wellness,
    nutritionLogs: nutrition,
    financeLogs: finances,
    totalActivity,
    rhythmLabel,
  };
}

// ─── Memories ───

async function computeMemories(
  userId: string,
  yyyyMM: string
): Promise<MemoryItem[]> {
  const { start, end } = getMonthRange(yyyyMM);
  const memories: MemoryItem[] = [];

  // Finance memories with contexto
  const financeWithCtx = await db.financeLog.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      contexto: { not: null },
    },
    select: { contexto: true, date: true, category: true },
    orderBy: { date: 'desc' },
    take: 5,
  });

  for (const f of financeWithCtx) {
    if (f.contexto && f.contexto.trim().length > 0) {
      memories.push({
        text: f.contexto,
        date: f.date.toISOString(),
        empire: 'Finanzas',
      });
    }
  }

  // Journal entries
  const journals = await db.journalEntry.findMany({
    where: {
      userId,
      createdAt: { gte: start, lt: end },
    },
    select: { title: true, content: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  for (const j of journals) {
    memories.push({
      text: j.content
        ? j.content.slice(0, 120) + (j.content.length > 120 ? '...' : '')
        : j.title,
      date: j.createdAt.toISOString(),
      empire: 'Mente',
    });
  }

  // Checkin notes
  const checkinNotes = await db.dailyCheckin.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      note: { not: null },
    },
    select: { note: true, date: true },
    orderBy: { date: 'desc' },
    take: 3,
  });

  for (const c of checkinNotes) {
    if (c.note && c.note.trim().length > 0) {
      memories.push({
        text: c.note,
        date: c.date.toISOString(),
        empire: 'General',
      });
    }
  }

  // Sort by date, most recent first
  memories.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return memories.slice(0, 8);
}

// ─── Evolution ───

async function computeEvolution(
  userId: string,
  yyyyMM: string
): Promise<EvolutionData | null> {
  const currentRhythm = await computeRhythm(userId, yyyyMM);
  if (!currentRhythm) return null;

  const prevMonth = getPreviousMonth(yyyyMM);
  const prevRhythm = await computeRhythm(userId, prevMonth);

  if (!prevRhythm) {
    return {
      hasPrevious: false,
      direction: 'first',
      label: EVOLUTION_NO_PREVIOUS,
    };
  }

  const diff = currentRhythm.totalActivity - prevRhythm.totalActivity;
  let direction: 'quieter' | 'same' | 'more_active';
  let label: string;

  if (Math.abs(diff) <= 5) {
    direction = 'same';
    label = EVOLUTION_SAME;
  } else if (diff < 0) {
    direction = 'quieter';
    label = EVOLUTION_QUIETER;
  } else {
    direction = 'more_active';
    label = EVOLUTION_MORE_ACTIVE;
  }

  return { hasPrevious: true, direction, label };
}

// ─── Main Digest ───

export async function generateMonthlyDigest(
  userId: string,
  yyyyMM: string
): Promise<MonthlyDigest> {
  const monthLabel = formatMonthLabel(yyyyMM);

  const [intentionBalance, financial, rhythm, memories, evolution] =
    await Promise.all([
      computeIntentionBalance(userId, yyyyMM),
      computeFinancialSummary(userId, yyyyMM),
      computeRhythm(userId, yyyyMM),
      computeMemories(userId, yyyyMM),
      computeEvolution(userId, yyyyMM),
    ]);

  const hasData =
    intentionBalance !== null ||
    financial !== null ||
    rhythm !== null ||
    memories.length > 0;

  return {
    month: yyyyMM,
    monthLabel,
    hasData,
    intentionBalance,
    financial,
    rhythm,
    memories,
    evolution,
    noDataMessage: !hasData
      ? { title: NO_DATA_TITLE, subtitle: NO_DATA_SUBTITLE }
      : null,
  };
}

// ─── Check if previous month needs closure ───

export function getPreviousMonthForClosure(): string {
  // Use Madrid calendar — avoids UTC drift near midnight on Vercel
  const todayKey = getTodayDateKey(); // YYYY-MM-DD
  const [yearStr, monthStr] = todayKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  // Previous month: if January, wrap to December of prior year
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function isClosurePeriod(): boolean {
  // Use Madrid calendar — avoids UTC drift near midnight on Vercel
  const todayKey = getTodayDateKey(); // YYYY-MM-DD
  const dayOfMonth = parseInt(todayKey.split('-')[2], 10);
  // First 7 days of the month — gentle window for closure
  return dayOfMonth <= 7;
}
