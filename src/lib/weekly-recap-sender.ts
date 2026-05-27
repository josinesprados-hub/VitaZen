// ═══════════════════════════════════════════
// WEEKLY RECAP SENDER
// Generates personalized weekly data for
// each eligible user and sends the email.
// Reuses existing insights + emotional engines.
// No AI. No invented data.
// ═══════════════════════════════════════════

import { db } from './db';
import { generateWeeklyInsights, gatherData } from './insights';
import { getEmotionalState } from './emotional-state';
import { weeklyRecapEmail, type WeeklyRecapEmailData } from './emails/weekly-recap';
import { resend } from './resend';

const FROM_EMAIL = 'VitaZen <hola@vitazen.cc>';
const REPLY_TO = 'hola@vitazen.cc';

// ─────────────────────────────────────────
// Eligibility: only active users with
// weeklyEmailSummary enabled and verified
// ─────────────────────────────────────────

interface EligibleUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
}

async function getEligibleUsers(): Promise<EligibleUser[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  // Users who: have weeklyEmailSummary ON, email verified,
  // and have been active in the last 7 days (at least 1 check-in or activity)
  const users = await db.user.findMany({
    where: {
      weeklyEmailSummary: true,
      emailVerified: true,
      OR: [
        { dailyCheckins: { some: { date: { gte: sevenDaysAgo } } } },
        { wellnessLogs: { some: { date: { gte: sevenDaysAgo } } } },
        { habitLogs: { some: { lastCompletedAt: { gte: sevenDaysAgo } } } },
        { meditationSessions: { some: { completedAt: { gte: sevenDaysAgo } } } },
        { journalEntries: { some: { createdAt: { gte: sevenDaysAgo } } } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
    },
  });

  return users;
}

// ─────────────────────────────────────────
// Generate personalized email data
// for a single user
// ─────────────────────────────────────────

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Muy activo';
  if (score >= 60) return 'Actividad moderada';
  if (score >= 40) return 'Semana tranquila';
  return 'Poca actividad';
}

async function generateRecapData(userId: string, plan: string): Promise<WeeklyRecapEmailData | null> {
  try {
    // PERFORMANCE: Fetch raw data ONCE and share with both engines.
    // Without this, generateWeeklyInsights + getEmotionalState each call
    // gatherData() internally — 14+14 = 28 DB queries per user.
    // With shared data: 14 queries total. Critical when processing many users.
    const data = await gatherData(userId);

    const [insightsResult, emotionalResult] = await Promise.all([
      generateWeeklyInsights(userId, plan, data),
      getEmotionalState(userId, plan, data),
    ]);

    const { summary, insights } = insightsResult;

    // Skip if no meaningful activity at all
    if (summary.totalActivities === 0 && summary.checkins.count === 0) {
      return null;
    }

    // Get top habits
    const topHabits = await db.habitLog.findMany({
      where: { userId, streak: { gt: 0 } },
      orderBy: { streak: 'desc' },
      take: 3,
      select: { name: true, streak: true },
    });

    // Main insight
    const mainInsight = insights.length > 0 ? insights[0] : null;

    // Mentor recommendation (reuse logic from weekly-recap API)
    const recommendation = generateEmailRecommendation(summary.score, emotionalResult.statusLabel, emotionalResult.metrics.energy.value, emotionalResult.metrics.consistency.value, plan);

    return {
      name: '', // Will be filled per user
      weekLabel: summary.weekLabel,
      score: summary.score,
      scoreLabel: getScoreLabel(summary.score),
      progress: {
        totalActivities: summary.totalActivities,
        checkins: summary.checkins.count,
        habitsCompleted: summary.habits.completed,
        meditationSessions: summary.meditation.sessions,
        journalEntries: summary.journal.entries,
      },
      topHabits,
      emotionalState: {
        statusLabel: emotionalResult.statusLabel,
        energy: emotionalResult.metrics.energy.value,
        consistency: emotionalResult.metrics.consistency.value,
      },
      mainInsight: mainInsight
        ? { title: mainInsight.title, description: mainInsight.description }
        : null,
      mentorRecommendation: recommendation,
      plan,
    };
  } catch (error) {
    console.error(`[WEEKLY-RECAP] Error generating data for user ${userId}:`, error);
    return null;
  }
}

function generateEmailRecommendation(
  score: number,
  statusLabel: string,
  energy: number,
  consistency: number,
  plan: string
): string {
  if (energy <= 35) {
    return 'Poca energía.';
  }

  if (consistency >= 65) {
    return 'Buen ritmo.';
  }

  if (score >= 60) {
    return 'Semana razonable.';
  }

  return 'Semana tranquila.';
}

// ─────────────────────────────────────────
// Send weekly recap to a single user
// ─────────────────────────────────────────

async function sendWeeklyRecapToUser(user: EligibleUser): Promise<{ sent: boolean; error?: string }> {
  const recapData = await generateRecapData(user.id, user.plan);

  if (!recapData) {
    return { sent: false, error: 'No meaningful activity this week' };
  }

  // Fill name
  recapData.name = user.name || user.email.split('@')[0];

  const { html, text, subject } = weeklyRecapEmail(recapData);
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://vitazen.cc';

  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: user.email,
      subject,
      html,
      text,
      replyTo: REPLY_TO,
      headers: {
        'X-Auto-Response-Suppress': 'OOF',
        'List-Unsubscribe': `<${APP_URL}/ajustes>`,
      },
    });

    if (result?.data?.id) {
      console.log(`[WEEKLY-RECAP] Sent to ${user.email}. ID: ${result.data.id}`);
      return { sent: true };
    } else if (result?.error) {
      console.error(`[WEEKLY-RECAP] Resend error for ${user.email}:`, JSON.stringify(result.error));
      return { sent: false, error: String(result.error) };
    }

    return { sent: false, error: 'Unknown Resend response' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[WEEKLY-RECAP] Exception sending to ${user.email}:`, msg);
    return { sent: false, error: msg };
  }
}

// ─────────────────────────────────────────
// Main: send to all eligible users
// Used by cron endpoint
// ─────────────────────────────────────────

export interface WeeklyRecapResult {
  totalEligible: number;
  sent: number;
  skipped: number;
  errors: number;
  duration: number;
}

export async function sendWeeklyRecaps(): Promise<WeeklyRecapResult> {
  const startTime = Date.now();
  console.log('[WEEKLY-RECAP] Starting weekly recap send...');

  const users = await getEligibleUsers();
  console.log(`[WEEKLY-RECAP] Found ${users.length} eligible users.`);

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // Process users sequentially with a small delay between each
  // to avoid rate limits and DB overload
  for (const user of users) {
    try {
      const result = await sendWeeklyRecapToUser(user);
      if (result.sent) {
        sent++;
      } else if (result.error === 'No meaningful activity this week') {
        skipped++;
      } else {
        errors++;
      }
    } catch (error) {
      errors++;
      console.error(`[WEEKLY-RECAP] Unexpected error for user ${user.id}:`, error);
    }

    // Small delay between emails (200ms) to respect Resend rate limits
    // Applied every 5 emails to stay within 10 req/s on Resend free tier
    if ((sent + errors) % 5 === 0 && (sent + errors) > 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[WEEKLY-RECAP] Done. Sent: ${sent}, Skipped: ${skipped}, Errors: ${errors}, Duration: ${duration}ms`);

  return {
    totalEligible: users.length,
    sent,
    skipped,
    errors,
    duration,
  };
}
