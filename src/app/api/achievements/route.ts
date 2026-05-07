import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { db } from '@/lib/db';

// ═══════════════════════════════════════════
// ACHIEVEMENT DEFINITIONS
// ═══════════════════════════════════════════

interface AchievementDef {
  key: string;
  title: string;
  description: string;
  category: string; // meditation | journal | wellness | habits | nutrition | finance | general
  icon: string;     // lucide icon name for frontend
  target: number;
}

const ACHIEVEMENTS: AchievementDef[] = [
  // Meditación
  { key: 'meditation_first', title: 'Primer Respirar', description: 'Completa tu primera sesión de meditación', category: 'meditation', icon: 'Wind', target: 1 },
  { key: 'meditation_7', title: 'Mente Calma', description: 'Medita durante 7 días', category: 'meditation', icon: 'Wind', target: 7 },
  { key: 'meditation_14', title: 'Disciplina Interior', description: 'Medita durante 14 días', category: 'meditation', icon: 'Wind', target: 14 },
  { key: 'meditation_30', title: 'Maestro del Silencio', description: 'Medita durante 30 días', category: 'meditation', icon: 'Wind', target: 30 },
  { key: 'meditation_50', title: 'Consciencia Total', description: 'Completa 50 sesiones de meditación', category: 'meditation', icon: 'Wind', target: 50 },

  // Diario
  { key: 'journal_first', title: 'Primera Reflexión', description: 'Escribe tu primera entrada en el diario', category: 'journal', icon: 'BookOpen', target: 1 },
  { key: 'journal_7', title: 'Escritor Constante', description: 'Escribe en tu diario durante 7 días', category: 'journal', icon: 'BookOpen', target: 7 },
  { key: 'journal_30', title: 'Crónico de Vida', description: 'Escribe en tu diario durante 30 días', category: 'journal', icon: 'BookOpen', target: 30 },
  { key: 'journal_50', title: 'Voz Interior', description: 'Completa 50 entradas en el diario', category: 'journal', icon: 'BookOpen', target: 50 },

  // Bienestar
  { key: 'wellness_first', title: 'Autoconocimiento', description: 'Registra tu primer estado de bienestar', category: 'wellness', icon: 'Heart', target: 1 },
  { key: 'wellness_7', title: 'Escucha Interior', description: 'Registra tu bienestar durante 7 días', category: 'wellness', icon: 'Heart', target: 7 },
  { key: 'wellness_30', title: 'Equilibrio Pleno', description: 'Registra tu bienestar durante 30 días', category: 'wellness', icon: 'Heart', target: 30 },

  // Hábitos
  { key: 'habits_first', title: 'Primer Paso', description: 'Crea tu primer hábito', category: 'habits', icon: 'CheckCircle', target: 1 },
  { key: 'habits_5', title: 'Constructor', description: 'Completa 5 hábitos', category: 'habits', icon: 'CheckCircle', target: 5 },
  { key: 'habits_10', title: 'Consistencia', description: 'Completa 10 hábitos', category: 'habits', icon: 'CheckCircle', target: 10 },
  { key: 'habits_streak_7', title: 'Racha de Fuego', description: 'Mantén una racha de 7 días en un hábito', category: 'habits', icon: 'Flame', target: 7 },

  // Nutrición
  { key: 'nutrition_first', title: 'Consciencia Nutritiva', description: 'Registra tu primera alimentación', category: 'nutrition', icon: 'Utensils', target: 1 },
  { key: 'nutrition_7', title: 'Alimentación Consciente', description: 'Registra tu nutrición durante 7 días', category: 'nutrition', icon: 'Utensils', target: 7 },
  { key: 'nutrition_30', title: 'Nutrición Elite', description: 'Registra tu nutrición durante 30 días', category: 'nutrition', icon: 'Utensils', target: 30 },

  // Finanzas
  { key: 'finance_first', title: 'Primer Registro', description: 'Registra tu primer movimiento financiero', category: 'finance', icon: 'Wallet', target: 1 },
  { key: 'finance_savings_first', title: 'Primer Ahorro', description: 'Registra tu primer ingreso', category: 'finance', icon: 'PiggyBank', target: 1 },
  { key: 'finance_10', title: 'Control Financiero', description: 'Registra 10 movimientos financieros', category: 'finance', icon: 'Wallet', target: 10 },
  { key: 'finance_30', title: 'Gestor Elite', description: 'Registra 30 movimientos financieros', category: 'finance', icon: 'Wallet', target: 30 },

  // General
  { key: 'general_30_days', title: 'Guerrero 30 Días', description: '30 días de actividad en VitaZen', category: 'general', icon: 'Crown', target: 30 },
];

// ═══════════════════════════════════════════
// PROGRESS CALCULATION
// All DB queries run in parallel via Promise.all
// ═══════════════════════════════════════════

async function calculateProgress(userId: string): Promise<Record<string, number>> {
  // Run all count queries in parallel — one round-trip instead of 8+
  const [
    meditationCount,
    journalCount,
    wellnessCount,
    habitsCount,
    maxStreakResult,
    nutritionCount,
    financeCount,
    incomeCount,
    userData,
  ] = await Promise.all([
    db.meditationSession.count({ where: { userId } }),
    db.journalEntry.count({ where: { userId } }),
    db.wellnessLog.count({ where: { userId } }),
    db.habitLog.count({ where: { userId } }),
    db.habitLog.findMany({
      where: { userId },
      select: { streak: true },
      orderBy: { streak: 'desc' },
      take: 1,
    }),
    db.nutritionLog.count({ where: { userId } }),
    db.financeLog.count({ where: { userId } }),
    db.financeLog.count({ where: { userId, type: 'income' } }),
    db.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
  ]);

  const progress: Record<string, number> = {};
  const maxStreak = maxStreakResult[0]?.streak || 0;

  // Meditación
  progress['meditation_first'] = Math.min(meditationCount, 1);
  progress['meditation_7'] = Math.min(meditationCount, 7);
  progress['meditation_14'] = Math.min(meditationCount, 14);
  progress['meditation_30'] = Math.min(meditationCount, 30);
  progress['meditation_50'] = Math.min(meditationCount, 50);

  // Diario
  progress['journal_first'] = Math.min(journalCount, 1);
  progress['journal_7'] = Math.min(journalCount, 7);
  progress['journal_30'] = Math.min(journalCount, 30);
  progress['journal_50'] = Math.min(journalCount, 50);

  // Bienestar
  progress['wellness_first'] = Math.min(wellnessCount, 1);
  progress['wellness_7'] = Math.min(wellnessCount, 7);
  progress['wellness_30'] = Math.min(wellnessCount, 30);

  // Hábitos
  progress['habits_first'] = Math.min(habitsCount, 1);
  progress['habits_5'] = Math.min(habitsCount, 5);
  progress['habits_10'] = Math.min(habitsCount, 10);
  progress['habits_streak_7'] = Math.min(maxStreak, 7);

  // Nutrición
  progress['nutrition_first'] = Math.min(nutritionCount, 1);
  progress['nutrition_7'] = Math.min(nutritionCount, 7);
  progress['nutrition_30'] = Math.min(nutritionCount, 30);

  // Finanzas
  progress['finance_first'] = Math.min(financeCount, 1);
  progress['finance_savings_first'] = Math.min(incomeCount, 1);
  progress['finance_10'] = Math.min(financeCount, 10);
  progress['finance_30'] = Math.min(financeCount, 30);

  // General
  if (userData) {
    const daysSince = Math.floor((Date.now() - userData.createdAt.getTime()) / 86400000);
    progress['general_30_days'] = Math.min(daysSince, 30);
  }

  return progress;
}

// ═══════════════════════════════════════════
// GET — List achievements with progress
// ═══════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getAuthUser(authHeader.split('Bearer ')[1]);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch unlocked achievements + progress data in parallel
    const [unlocked, progressData] = await Promise.all([
      db.achievement.findMany({ where: { userId: user.id } }),
      calculateProgress(user.id),
    ]);

    const unlockedKeys = new Set(unlocked.map((a) => a.key));
    const unlockedMap = new Map(unlocked.map((a) => [a.key, a.unlockedAt.toISOString()]));

    // Build response
    const achievements = ACHIEVEMENTS.map((def) => {
      const current = progressData[def.key] || 0;
      const isUnlocked = unlockedKeys.has(def.key);
      const percent = Math.min(Math.round((current / def.target) * 100), 100);

      return {
        key: def.key,
        title: def.title,
        description: def.description,
        category: def.category,
        icon: def.icon,
        target: def.target,
        current,
        percent,
        unlocked: isUnlocked,
        unlockedAt: isUnlocked ? unlockedMap.get(def.key) || null : null,
      };
    });

    const totalUnlocked = achievements.filter((a) => a.unlocked).length;
    const totalAchievements = achievements.length;

    return NextResponse.json({
      achievements,
      stats: {
        total: totalAchievements,
        unlocked: totalUnlocked,
        percent: Math.round((totalUnlocked / totalAchievements) * 100),
      },
    });
  } catch (error) {
    console.error('Achievements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
