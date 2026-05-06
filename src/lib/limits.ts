import { db } from './db';
import { startOfDay, addDays } from 'date-fns';

const FREE_DAILY_LIMIT = 15;

/**
 * Get the daily message limit for a given plan.
 */
export function getDailyLimit(plan: string): number {
  return plan === 'PREMIUM' ? Infinity : FREE_DAILY_LIMIT;
}

export async function checkAILimit(userId: string, plan: string): Promise<{ allowed: boolean; remaining: number }> {
  if (plan === 'PREMIUM') {
    return { allowed: true, remaining: Infinity };
  }

  const usage = await db.aIUsage.findUnique({
    where: { userId },
  });

  const now = new Date();

  if (!usage || now > usage.resetAt) {
    // Reset or create usage record
    await db.aIUsage.upsert({
      where: { userId },
      update: {
        count: 0,
        resetAt: startOfDay(addDays(now, 1)),
      },
      create: {
        userId,
        count: 0,
        resetAt: startOfDay(addDays(now, 1)),
      },
    });
    return { allowed: true, remaining: FREE_DAILY_LIMIT };
  }

  if (usage.count >= FREE_DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: FREE_DAILY_LIMIT - usage.count };
}

export async function incrementAIUsage(userId: string): Promise<void> {
  const usage = await db.aIUsage.findUnique({ where: { userId } });
  if (!usage) return;

  await db.aIUsage.update({
    where: { userId },
    data: { count: { increment: 1 } },
  });
}
