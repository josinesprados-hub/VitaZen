import { db } from './db';

const FREE_DAILY_LIMIT = 15;

/**
 * Get the daily message limit for a given plan.
 */
export function getDailyLimit(plan: string): number {
  return plan === 'PREMIUM' ? Infinity : FREE_DAILY_LIMIT;
}

/**
 * Calculate the start of the next day in Europe/Madrid timezone as a UTC Date.
 * Uses the same timezone strategy as getMadridDateKey() in deterministic.ts
 * (toLocaleString with timeZone: 'Europe/Madrid') to ensure the daily limit
 * resets at 00:00 Madrid time, not 00:00 UTC.
 */
function getMadridStartOfNextDay(): Date {
  const now = new Date();

  // Get current date in Madrid (same technique as deterministic.ts)
  const madridStr = now.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  const dateKey = madridStr.split(' ')[0]; // YYYY-MM-DD
  const [y, m, d] = dateKey.split('-').map(Number);

  // Tomorrow in Madrid calendar
  const tomorrow = new Date(y, m - 1, d + 1);

  // Calculate the Madrid-UTC offset at noon tomorrow (avoids DST edge cases at midnight)
  const noonUTCTomorrow = new Date(
    Date.UTC(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 12, 0, 0)
  );
  const madridAtNoonUTC = noonUTCTomorrow.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  const offsetMs = new Date(madridAtNoonUTC.replace(' ', 'T')).getTime() - noonUTCTomorrow.getTime();

  // Midnight tomorrow in Madrid = midnight UTC tomorrow minus the Madrid offset
  const midnightUTCTomorrow = Date.UTC(
    tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 0, 0, 0
  );
  return new Date(midnightUTCTomorrow - offsetMs);
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
    const resetAt = getMadridStartOfNextDay();
    await db.aIUsage.upsert({
      where: { userId },
      update: {
        count: 0,
        resetAt,
      },
      create: {
        userId,
        count: 0,
        resetAt,
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
