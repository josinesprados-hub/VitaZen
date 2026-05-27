export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// TEMPORAL: Diagnostic endpoint to verify database connectivity.
// Will be removed after debugging is complete.
export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
    hasDbUrl: !!process.env.DATABASE_URL,
    dbUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 25) + '...' : 'MISSING',
  };

  try {
    const t0 = Date.now();
    // Simple query: count users
    const userCount = await db.user.count();
    results.userCount = userCount;
    results.userCountDurationMs = Date.now() - t0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code;
    results.userCountError = message;
    results.userCountCode = code;
  }

  try {
    const t1 = Date.now();
    // Test journalEntry model
    const journalCount = await db.journalEntry.count();
    results.journalCount = journalCount;
    results.journalCountDurationMs = Date.now() - t1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code;
    results.journalCountError = message;
    results.journalCountCode = code;
  }

  try {
    const t2 = Date.now();
    // Test achievement model
    const achievementCount = await db.achievement.count();
    results.achievementCount = achievementCount;
    results.achievementCountDurationMs = Date.now() - t2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code;
    results.achievementCountError = message;
    results.achievementCountCode = code;
  }

  try {
    const t3 = Date.now();
    // Test findUnique on user (similar to getAuthUserBasic)
    const firstUser = await db.user.findFirst();
    results.findFirstUser = firstUser ? { id: firstUser.id, firebaseUid: firstUser.firebaseUid, plan: firstUser.plan } : null;
    results.findFirstUserDurationMs = Date.now() - t3;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as any)?.code;
    results.findFirstUserError = message;
    results.findFirstUserCode = code;
  }

  return NextResponse.json(results, { status: 200 });
}
