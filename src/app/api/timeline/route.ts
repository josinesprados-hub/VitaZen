import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getAuthUser(authHeader.split('Bearer ')[1]);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category'); // meditation | journal | wellness | habits | nutrition | finance
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  interface TimelineItem {
    id: string;
    type: string;
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
          const typeLabel = s.type === 'guided' ? 'Guiada' : s.type === 'breathing' ? 'Respiración' : s.type === 'body_scan' ? 'Body Scan' : 'Mindfulness';
          items.push({
            id: s.id,
            type: 'meditation',
            title: `Meditación ${typeLabel}`,
            description: `${s.duration} minutos de práctica consciente`,
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
      }).then((entries) => {
        for (const e of entries) {
          items.push({
            id: e.id,
            type: 'journal',
            title: e.title || 'Entrada de diario',
            description: e.content.length > 120 ? e.content.substring(0, 120) + '...' : e.content,
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
          const avgScore = Math.round((l.mood + l.energy + l.sleep + l.stress) / 4);
          items.push({
            id: l.id,
            type: 'wellness',
            title: 'Registro de bienestar',
            description: `Ánimo: ${l.mood}/5 · Energía: ${l.energy}/5 · Sueño: ${l.sleep}/5 · Estrés: ${l.stress}/5`,
            date: l.date,
            meta: { mood: l.mood, energy: l.energy, sleep: l.sleep, stress: l.stress, notes: l.notes, avgScore },
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
            title: h.name,
            description: h.description || `Racha de ${h.streak} días consecutivos`,
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
          if (l.calories) parts.push(`${l.calories} kcal`);
          items.push({
            id: l.id,
            type: 'nutrition',
            title: 'Registro nutricional',
            description: parts.length > 0 ? parts.join(' · ') : 'Registro alimenticio del día',
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
            title: `${isIncome ? 'Ingreso' : 'Gasto'} · ${l.category}`,
            description: `${isIncome ? '+' : '-'}${l.amount.toFixed(2)}€${l.description ? ' · ' + l.description : ''}`,
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
