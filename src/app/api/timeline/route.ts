export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';

// Imperio mapping — each activity belongs to a vital dimension
const TYPE_IMPERIO: Record<string, string> = {
  meditation: 'mente',
  journal: 'mente',
  wellness: 'energia',
  nutrition: 'energia',
  habits: 'disciplina',
  finance: 'riqueza',
};

// Imperio labels — calm, human, not technical
const IMPERIO_LABEL: Record<string, string> = {
  mente: 'Mente',
  energia: 'Energía',
  disciplina: 'Disciplina',
  riqueza: 'Riqueza',
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getAuthUserBasic(authHeader.split('Bearer ')[1]);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  interface TimelineItem {
    id: string;
    type: string;
    imperio: string;
    title: string;
    description: string;
    date: Date;
    meta: Record<string, any>;
  }

  const items: TimelineItem[] = [];

  const fetchMeditation = !category || category === 'meditation';
  const fetchJournal = !category || category === 'journal';
  const fetchWellness = !category || category === 'wellness';
  const fetchHabits = !category || category === 'habits';
  const fetchNutrition = !category || category === 'nutrition';
  const fetchFinance = !category || category === 'finance';

  const queries: Promise<void>[] = [];

  if (fetchMeditation) {
    queries.push(
      db.meditationSession.findMany({
        where: { userId: user.id },
        orderBy: { completedAt: 'desc' },
        take: limit,
      }).then((sessions) => {
        for (const s of sessions) {
          const typeLabel = s.type === 'guided' ? 'guiada' : s.type === 'breathing' ? 'respiración' : s.type === 'body_scan' ? 'body scan' : 'mindfulness';
          items.push({
            id: s.id,
            type: 'meditation',
            imperio: 'mente',
            title: `Meditación ${typeLabel}`,
            description: `${s.duration} minutos`,
            date: s.completedAt,
            meta: { duration: s.duration, meditationType: s.type },
          });
        }
      })
    );
  }

  if (fetchJournal) {
    queries.push(
      db.journalEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, title: true, content: true, mood: true, gratitude: true, createdAt: true },
      }).then((entries) => {
        for (const e of entries) {
          items.push({
            id: e.id,
            type: 'journal',
            imperio: 'mente',
            title: e.title || 'Reflexión',
            description: e.content.length > 100 ? e.content.substring(0, 100) + '…' : e.content,
            date: e.createdAt,
            meta: { mood: e.mood, gratitude: e.gratitude },
          });
        }
      })
    );
  }

  if (fetchWellness) {
    queries.push(
      db.wellnessLog.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: limit,
      }).then((logs) => {
        for (const l of logs) {
          items.push({
            id: l.id,
            type: 'wellness',
            imperio: 'energia',
            title: l.notes || 'Estado del día',
            description: `Ánimo ${l.mood}/5 · Energía ${l.energy}/5`,
            date: l.date,
            meta: { mood: l.mood, energy: l.energy, sleep: l.sleep, stress: l.stress, notes: l.notes },
          });
        }
      })
    );
  }

  if (fetchHabits) {
    queries.push(
      db.habitLog.findMany({
        where: { userId: user.id },
        orderBy: { lastCompletedAt: 'desc' },
        take: limit,
      }).then((habits) => {
        for (const h of habits) {
          items.push({
            id: h.id,
            type: 'habits',
            imperio: 'disciplina',
            title: h.name,
            description: h.description || (h.streak > 0 ? `${h.streak} días` : undefined),
            date: h.lastCompletedAt || h.createdAt,
            meta: { streak: h.streak, frequency: h.frequency },
          });
        }
      })
    );
  }

  if (fetchNutrition) {
    queries.push(
      db.nutritionLog.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: limit,
      }).then((logs) => {
        for (const l of logs) {
          const parts: string[] = [];
          if (l.water > 0) parts.push(`${l.water} vasos de agua`);
          items.push({
            id: l.id,
            type: 'nutrition',
            imperio: 'energia',
            title: 'Nutrición',
            description: parts.length > 0 ? parts.join(' · ') : (l.notes || undefined),
            date: l.date,
            meta: { water: l.water, calories: l.calories, notes: l.notes },
          });
        }
      })
    );
  }

  if (fetchFinance) {
    queries.push(
      db.financeLog.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: limit,
      }).then((logs) => {
        for (const l of logs) {
          const isIncome = l.type === 'income';
          items.push({
            id: l.id,
            type: 'finance',
            imperio: 'riqueza',
            title: l.category,
            description: l.description || `${isIncome ? '+' : '-'}${formatCurrency(l.amount)}`,
            date: l.date,
            meta: { amount: l.amount, financeType: l.type, category: l.category },
          });
        }
      })
    );
  }

  await Promise.all(queries);

  // Sort all items by date descending
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Apply global limit
  const result = items.slice(0, limit).map((item) => ({
    ...item,
    date: item.date.toISOString(),
  }));

  return NextResponse.json({ items: result, total: result.length });
}
