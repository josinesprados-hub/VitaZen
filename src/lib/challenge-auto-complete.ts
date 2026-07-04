/**
 * Challenge Auto-Completion System
 *
 * Ensures daily challenges can ONLY be completed by performing the actual action.
 * No manual "mark as complete" — integrity is enforced server-side.
 *
 * Challenge categories map to actions:
 *   disciplina  → habit (create or complete a habit)
 *   habitos     → habit (create or complete a habit)
 *   mentalidad  → meditation OR journal
 *   productividad → journal OR habit (exact title match)
 *   salud       → checkin OR meditation OR wellness OR nutrition
 *
 * For habit actions, if the category doesn't match, an additional check is
 * performed: if the habit name exactly matches the challenge title
 * (after trim + toLowerCase), the challenge is also auto-completed.
 * This allows challenges like "Limpia tu espacio de trabajo" (productividad)
 * to be completed when a habit with the same name is performed.
 */

import { db } from '@/lib/db';
import { getTodayDateKey } from '@/lib/deterministic';

// Which challenge categories can be auto-completed by each action
const ACTION_CATEGORIES: Record<string, string[]> = {
  checkin: ['salud'],
  habit: ['disciplina', 'habitos'],
  meditation: ['mentalidad', 'salud'],
  journal: ['mentalidad', 'productividad'],
  wellness: ['salud'],
  nutrition: ['salud'],
};

/**
 * Try to auto-complete today's challenge if its category matches the performed action.
 * Called from each action API route (checkin, habits, meditation, journal).
 * Safe to call multiple times — idempotent, only completes if not already done.
 */
export async function tryAutoCompleteChallenge(
  userId: string,
  action: keyof typeof ACTION_CATEGORIES,
  habitName?: string
): Promise<void> {
  try {
    const today = new Date(getTodayDateKey() + 'T00:00:00');
    const categories = ACTION_CATEGORIES[action];
    if (!categories || categories.length === 0) return;

    // Find today's uncompleted challenge
    const userChallenge = await db.userChallenge.findFirst({
      where: {
        userId,
        date: today,
        completed: false,
      },
      include: { challenge: true },
    });

    if (!userChallenge) return;

    // Check if the challenge category matches the action
    const challengeCategory = userChallenge.challenge.category.toLowerCase();
    const categoryMatch = categories.includes(challengeCategory);

    // For habit actions: if category doesn't match, also check exact title match
    // (normalized: trim + toLowerCase). This allows a habit named exactly
    // like the challenge title to auto-complete it regardless of category.
    let titleMatch = false;
    if (!categoryMatch && action === 'habit' && habitName) {
      const normalizedHabitName = habitName.trim().toLowerCase();
      const normalizedChallengeTitle = userChallenge.challenge.title.trim().toLowerCase();
      titleMatch = normalizedHabitName === normalizedChallengeTitle;
    }

    if (!categoryMatch && !titleMatch) return;

    // Auto-complete the challenge
    await db.userChallenge.update({
      where: { id: userChallenge.id },
      data: { completed: true, completedAt: new Date() },
    });

    // Award XP to disciplina empire (same as manual completion did)
    await db.empireProgress.upsert({
      where: { userId_empire: { userId, empire: 'disciplina' } },
      update: { xp: { increment: 25 } },
      create: { userId, empire: 'disciplina', xp: 25 },
    });

    const matchReason = categoryMatch ? 'category' : 'title';
    console.log(`[Challenge] Auto-completed "${userChallenge.challenge.title}" via action: ${action} (match: ${matchReason})`);
  } catch (error) {
    // Never fail the parent action if auto-completion fails
    console.error('[Challenge] Auto-complete error (non-blocking):', error);
  }
}
