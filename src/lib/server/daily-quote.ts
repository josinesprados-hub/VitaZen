// ═══════════════════════════════════════════
// VITAZEN — Daily Quotes Engine: Server Layer
// ═══════════════════════════════════════════
//
// The server-side engine that manages daily quote rotation.
// One quote per user per day. Never repeats until full
// collection shown. Automatic cycle reshuffling.
//
// ─── DESIGN PRINCIPLES ────────────────────
//
// 1. DETERMINISTIC: Same user + same cycle = same shuffle order.
//    Uses deterministicShuffle() from deterministic.ts — no Math.random().
//    Cross-device consistency guaranteed.
//
// 2. LAZY ROTATION: No cron. No scheduled jobs.
//    The quote advances on the first request of each new day.
//    If the user doesn't open the app, nothing happens.
//
// 3. LIGHTWEIGHT PERSISTENCE: Stores only 4 numbers/strings per user.
//    The shuffle order is computed from a deterministic seed,
//    never persisted — always reproducible from (userId + cycleNumber).
//
// 4. ADDITIVE: New quotes can be added to DAILY_QUOTES at any time.
//    The engine stores collectionLength at cycle start.
//    New quotes only appear in the NEXT cycle — never disrupt the current one.
//
// 5. NO REPETITION GUARANTEE: Within a cycle, every quote appears
//    exactly once before any repeats. When a cycle completes,
//    a new shuffle is generated with a different seed (next cycleNumber),
//    producing a completely different order.
//
// ─── STATE LIFECYCLE ──────────────────────
//
// First visit ever:
//   → Create state: cycleNumber=0, currentIndex=0,
//     lastDateKey=today, collectionLength=DAILY_QUOTES.length
//   → Compute shuffle from seed "userId:0"
//   → Return quote at shuffleOrder[0]
//
// Same day (todayKey === lastDateKey):
//   → Return current quote (no change, no DB write)
//
// New day (todayKey > lastDateKey):
//   → Advance: currentIndex++
//   → If currentIndex >= collectionLength:
//       → Cycle complete: cycleNumber++, currentIndex=0,
//         collectionLength=DAILY_QUOTES.length (picks up new quotes)
//       → New shuffle seed = "userId:cycleNumber" → different order
//   → Update lastDateKey = todayKey
//   → Persist and return new quote
//
// This module MUST NEVER be imported from client code.
// It accesses the database directly.

import { db } from '@/lib/db';
import { DAILY_QUOTES, type DailyQuoteState } from '@/lib/daily-quotes';
import {
  deterministicShuffle,
  getTodayDateKey,
} from '@/lib/deterministic';

// ─── Concurrency guard ──────────────────────
// Prevents race conditions when two concurrent requests
// (e.g., mobile + desktop) both call getDailyQuote
// for the same user on a new day.

const inFlightQuotes = new Map<string, Promise<{ text: string }>>();

// ─── Default state ──────────────────────────

const DEFAULT_STATE: DailyQuoteState = {
  currentIndex: 0,
  cycleNumber: 0,
  lastDateKey: '',
  collectionLength: DAILY_QUOTES.length,
};

// ─── Pure: Compute which quote to show ──────
// Separated from I/O for testability.

export function computeDailyQuote(
  state: DailyQuoteState,
  todayKey: string,
  userId: string,
  totalQuotes: number,
): { quote: string; updatedState: DailyQuoteState } {
  // ── Same day → return current quote, no state change ──
  if (state.lastDateKey === todayKey && state.lastDateKey !== '') {
    const shuffleOrder = deterministicShuffle(
      state.collectionLength,
      `${userId}:${state.cycleNumber}`,
    );
    const quoteIndex = shuffleOrder[state.currentIndex] ?? 0;
    return {
      quote: DAILY_QUOTES[quoteIndex]?.text ?? '',
      updatedState: state,
    };
  }

  // ── New day or first visit → advance ──
  let newState: DailyQuoteState;

  if (state.lastDateKey === '') {
    // First visit ever — start at index 0 of cycle 0
    newState = {
      currentIndex: 0,
      cycleNumber: 0,
      lastDateKey: todayKey,
      collectionLength: totalQuotes,
    };
  } else {
    // Advance to next quote
    let nextIndex = state.currentIndex + 1;
    let nextCycle = state.cycleNumber;
    let nextLength = state.collectionLength;

    if (nextIndex >= state.collectionLength) {
      // ── Cycle complete ──
      // New cycle: different seed → different shuffle order.
      // Also pick up any new quotes that were added.
      nextIndex = 0;
      nextCycle++;
      nextLength = totalQuotes;
    }

    newState = {
      currentIndex: nextIndex,
      cycleNumber: nextCycle,
      lastDateKey: todayKey,
      collectionLength: nextLength,
    };
  }

  // Compute quote from deterministic shuffle
  const shuffleOrder = deterministicShuffle(
    newState.collectionLength,
    `${userId}:${newState.cycleNumber}`,
  );
  const quoteIndex = shuffleOrder[newState.currentIndex] ?? 0;
  const quote = DAILY_QUOTES[quoteIndex]?.text ?? '';

  return {
    quote,
    updatedState: newState,
  };
}

// ─── Main: Get Daily Quote ──────────────────

export async function getDailyQuote(
  userId: string,
): Promise<{ text: string }> {
  // ─── Concurrency guard ───────────────────
  const existing = inFlightQuotes.get(userId);
  if (existing) return existing;

  const promise = computeDailyQuoteWithPersistence(userId).finally(() => {
    inFlightQuotes.delete(userId);
  });
  inFlightQuotes.set(userId, promise);
  return promise;
}

async function computeDailyQuoteWithPersistence(
  userId: string,
): Promise<{ text: string }> {
  const todayKey = getTodayDateKey();
  const totalQuotes = DAILY_QUOTES.length;

  // ── Edge case: no quotes in collection ──
  if (totalQuotes === 0) {
    return { text: '' };
  }

  // ── Read current state from DB ──
  const dashboardState = await db.emotionalDashboardState.findUnique({
    where: { userId },
    select: { quoteState: true },
  });

  let currentState: DailyQuoteState;
  try {
    if (dashboardState?.quoteState) {
      const parsed = JSON.parse(dashboardState.quoteState);
      // Validate structure
      if (
        typeof parsed.currentIndex === 'number' &&
        typeof parsed.cycleNumber === 'number' &&
        typeof parsed.lastDateKey === 'string' &&
        typeof parsed.collectionLength === 'number'
      ) {
        currentState = parsed as DailyQuoteState;
      } else {
        currentState = { ...DEFAULT_STATE };
      }
    } else {
      currentState = { ...DEFAULT_STATE };
    }
  } catch {
    currentState = { ...DEFAULT_STATE };
  }

  // ── Safety: clamp currentIndex if it somehow exceeds collection ──
  if (currentState.currentIndex >= currentState.collectionLength) {
    currentState.currentIndex = 0;
    currentState.cycleNumber++;
    currentState.collectionLength = totalQuotes;
  }

  // ── Compute ──
  const { quote, updatedState } = computeDailyQuote(
    currentState,
    todayKey,
    userId,
    totalQuotes,
  );

  // ── Persist only if state changed ──
  if (updatedState !== currentState) {
    await db.emotionalDashboardState.upsert({
      where: { userId },
      update: {
        quoteState: JSON.stringify(updatedState),
      },
      create: {
        userId,
        quoteState: JSON.stringify(updatedState),
        reflectionState: '{}',
        tipsState: '{}',
        memoryState: '{}',
        lastVisitAt: new Date(),
        dateKey: todayKey,
      },
    });
  }

  return { text: quote };
}
