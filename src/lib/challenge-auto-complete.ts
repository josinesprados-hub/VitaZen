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
import { startOfTodayMadrid } from '@/lib/dates';

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
    const today = startOfTodayMadrid();
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

    // D-1 FIX: Race condition during challenge auto-completion.
    // The original code used `db.userChallenge.update({ where: { id } })` without
    // `completed: false` in the WHERE clause, then unconditionally incremented XP.
    // Two concurrent calls (e.g. completing a habit + a meditation in rapid
    // succession, or two habits at once) could both pass the `findFirst` check
    // (both see `completed: false`), both succeed on the `update` (the second is
    // a silent no-op overwrite), and BOTH execute `xp: { increment: 25 }` —
    // granting +50 XP for a single challenge.
    //
    // Fix: use a conditional `updateMany` with `completed: false` in the WHERE
    // clause. Only the call that actually flips `completed` (count === 1) awards
    // XP. Both operations run inside a transaction so the challenge completion
    // and the XP grant are atomic — no partial state on failure.
    const awarded = await db.$transaction(async (tx) => {
      const result = await tx.userChallenge.updateMany({
        where: { id: userChallenge.id, completed: false },
        data: { completed: true, completedAt: new Date() },
      });
      if (result.count === 0) return false; // Already completed by a concurrent call

      // Award XP to disciplina empire (same as manual completion did)
      await tx.empireProgress.upsert({
        where: { userId_empire: { userId, empire: 'disciplina' } },
        update: { xp: { increment: 25 } },
        create: { userId, empire: 'disciplina', xp: 25 },
      });
      return true;
    });

    if (awarded) {
      const matchReason = categoryMatch ? 'category' : 'title';
      console.log(`[Challenge] Auto-completed "${userChallenge.challenge.title}" via action: ${action} (match: ${matchReason})`);
    }
  } catch (error) {
    // Never fail the parent action if auto-completion fails
    console.error('[Challenge] Auto-complete error (non-blocking):', error);
  }
}
