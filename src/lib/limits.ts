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

/**
 * Read-only check of AI usage remaining count.
 * Does NOT increment or modify the counter.
 * Use this for display purposes (e.g. thread list UI).
 * For sending messages, use checkAILimit() which atomically checks + increments.
 */
export async function getAIUsageRemaining(userId: string, plan: string): Promise<{ remaining: number; limit: number }> {
  if (plan === 'PREMIUM') {
    return { remaining: Infinity, limit: Infinity };
  }

  const usage = await db.aIUsage.findUnique({ where: { userId } });
  const now = new Date();

  if (!usage || now > usage.resetAt) {
    return { remaining: FREE_DAILY_LIMIT, limit: FREE_DAILY_LIMIT };
  }

  return {
    remaining: Math.max(0, FREE_DAILY_LIMIT - usage.count),
    limit: FREE_DAILY_LIMIT,
  };
}

/**
 * Atomically check the daily AI limit and reserve one message slot.
 *
 * Uses a single conditional UPDATE to eliminate the race condition
 * that existed when check + increment were separate operations.
 *
 * Flow:
 * 1. PREMIUM users → always allowed, no DB write.
 * 2. No usage record yet → create one (count=1), allowed.
 * 3. Usage expired (past resetAt) → reset and count=1, allowed.
 * 4. Under limit → atomic count+1 via conditional UPDATE, allowed.
 * 5. At/over limit → UPDATE matches 0 rows, denied.
 *
 * The conditional UPDATE (`WHERE count < LIMIT`) guarantees that
 * two concurrent requests cannot both pass the check: PostgreSQL
 * row-level locking ensures only one can increment past the limit.
 */
export async function checkAILimit(userId: string, plan: string): Promise<{ allowed: boolean; remaining: number }> {
  if (plan === 'PREMIUM') {
    return { allowed: true, remaining: Infinity };
  }

  const now = new Date();
  const resetAt = getMadridStartOfNextDay();

  // C-1 FIX: Wrap the entire check+increment cycle in a transaction with
  // pg_advisory_xact_lock keyed on the userId. This eliminates the race
  // condition that existed in the upsert path (findUnique → upsert with
  // count: 1 instead of count + 1). Concurrent requests for the same user
  // are now serialized — the second request blocks until the first commits,
  // then sees the updated count and is correctly denied if the limit is
  // reached.
  //
  // The lock is transaction-scoped: it auto-releases on commit/rollback,
  // so it never blocks future legitimate requests.
  return db.$transaction(async (tx) => {
    // Acquire transaction-scoped advisory lock on this user.
    const lockSeed = 'ai_limit|' + userId;
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ('x' || substring(md5(${lockSeed}), 1, 16))::bit(64)::bigint
      )`;

    const usage = await tx.aIUsage.findUnique({ where: { userId } });

    // Case 1: No record or expired → create/reset with count=1
    if (!usage || now > usage.resetAt) {
      await tx.aIUsage.upsert({
        where: { userId },
        update: { count: 1, resetAt },
        create: { userId, count: 1, resetAt },
      });
      return { allowed: true, remaining: FREE_DAILY_LIMIT - 1 };
    }

    // Case 2: Record exists and is current — check limit before incrementing
    if (usage.count >= FREE_DAILY_LIMIT) {
      return { allowed: false, remaining: 0 };
    }

    // Atomic increment — safe because we hold the advisory lock
    await tx.aIUsage.update({
      where: { userId },
      data: { count: { increment: 1 } },
    });

    return { allowed: true, remaining: FREE_DAILY_LIMIT - (usage.count + 1) };
  });
}

/**
 * @deprecated Increment is now handled atomically inside checkAILimit().
 * This function is kept as a no-op for API compatibility.
 */
export async function incrementAIUsage(userId: string): Promise<void> {
  // No-op: the increment is now atomic within checkAILimit()
}

/**
 * Rollback one AI usage credit after a failed Groq call.
 *
 * T-2 FIX: checkAILimit() atomically increments the counter BEFORE the Groq
 * API is called. If Groq fails (network timeout, 5xx, malformed response),
 * the catch block in /api/ai/chat returned 500 but never decremented the
 * counter — the user permanently lost a message credit. After 15 failed
 * retries, a FREE user was locked out for the rest of the day without ever
 * receiving a response.
 *
 * This function decrements the counter (clamped to 0) so the credit is
 * returned. It is a no-op for PREMIUM users (no limit, no counter to touch).
 */
export async function rollbackAILimit(userId: string, plan: string): Promise<void> {
  if (plan === 'PREMIUM') return;

  await db.$executeRaw`
    UPDATE "AIUsage"
    SET count = GREATEST(0, count - 1), "updatedAt" = NOW()
    WHERE "userId" = ${userId}
  `;
}
