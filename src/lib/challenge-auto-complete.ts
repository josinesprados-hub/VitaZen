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
 *   productividad → journal
 *   salud       → checkin OR meditation
 */

import { db } from '@/lib/db';
import { startOfDay } from 'date-fns';

// Which challenge categories can be auto-completed by each action
const ACTION_CATEGORIES: Record<string, string[]> = {
  checkin: ['salud'],
  habit: ['disciplina', 'habitos'],
  meditation: ['mentalidad', 'salud'],
  journal: ['mentalidad', 'productividad'],
};

/**
 * Try to auto-complete today's challenge if its category matches the performed action.
 * Called from each action API route (checkin, habits, meditation, journal).
 * Safe to call multiple times — idempotent, only completes if not already done.
 */
export async function tryAutoCompleteChallenge(
  userId: string,
  action: keyof typeof ACTION_CATEGORIES
): Promise<void> {
  try {
    const today = startOfDay(new Date());
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
    if (!categories.includes(challengeCategory)) return;

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

    console.log(`[Challenge] Auto-completed "${userChallenge.challenge.title}" via action: ${action}`);
  } catch (error) {
    // Never fail the parent action if auto-completion fails
    console.error('[Challenge] Auto-complete error (non-blocking):', error);
  }
}
