// ═══════════════════════════════════════════
// VITAZEN — Tips: Exhaustive Deterministic Rotation
// ═══════════════════════════════════════════
//
// Extracted from emotional-dashboard-state.ts during the reflections
// system removal. This module is independent of reflections and
// silent memories — it only depends on deterministic helpers.
//
// The position is computed from the date — NOT stored in DB state.
// This eliminates all rotation bugs caused by:
//   - Write race conditions (emotional snapshot + tips writing concurrently)
//   - Lost state (server restarts, DB errors, corrupted JSON)
//   - cycleStart drift (timezone, server clock differences)
//
// How it works (exhaustive rotation):
//   - cycleIndex = floor(daysSinceEpoch / 3) — changes every 3 days
//   - A "round" is one full sweep through the entire battery.
//   - The shuffle is generated ONCE per round (not per cycle).
//   - Within a round, tips are walked sequentially — NO repetition.
//   - When the round is exhausted, a new round begins with a fresh shuffle.
//
//   FREE:  50 tips ÷ 2 per cycle = 25 cycles per round = 75 days
//   PREMIUM: 60 tips ÷ 1 per cycle = 60 cycles per round = 180 days
//
// Same userId + same date = same tips everywhere. No state needed for position.
// Every tip is guaranteed to appear once before any tip repeats.

import {
  deterministicShuffle,
  getTodayDateKey,
} from '@/lib/deterministic';
import { startOfMadridDay } from '@/lib/dates';

const FREE_TIPS_VISIBLE = 2;

// Reference epoch: 2025-01-01 (a fixed date so cycleIndex is predictable)
const TIPS_EPOCH = new Date('2025-01-01T00:00:00Z').getTime();
const CYCLE_DAYS = 3; // Tips rotate every 3 days

export async function getDeterministicTips(
  userId: string,
  empire: string,
  allTips: { id: string; title: string; content: string; plan: string }[],
) {
  if (allTips.length === 0) return { freeTips: [], premiumTips: [] };

  const freeTipsAll = allTips.filter(t => t.plan !== 'PREMIUM');
  const premiumTipsAll = allTips.filter(t => t.plan === 'PREMIUM');
  const freeCount = freeTipsAll.length;
  const premiumCount = premiumTipsAll.length;

  // ─── Compute cycle index from date ───
  // cycleIndex increments every 3 days since epoch.
  // Same date on any device = same cycleIndex = same tips.
  // Uses getTodayDateKey() (Europe/Madrid) so the cycle boundary
  // aligns with the user's perceived midnight, not UTC midnight.
  const todayKey = getTodayDateKey();
  const todayMs = startOfMadridDay(todayKey).getTime();
  const daysSinceEpoch = Math.floor((todayMs - TIPS_EPOCH) / 86400000);
  const cycleIndex = Math.floor(daysSinceEpoch / CYCLE_DAYS);

  // ─── Exhaustive rotation: shuffle once per round ───
  // A "round" is one complete sweep through the battery.
  // The shuffle seed is based on the round number, not the cycle,
  // so the order stays stable for the entire round.
  // This guarantees: every tip appears exactly once before any repeats.

  // ─── Select FREE tips — ALWAYS exactly 2 ───
  // round = which full sweep of the battery we're in
  // positionInRound = which step within that sweep
  const selectedFree: typeof allTips = [];
  if (freeCount > 0) {
    const cyclesPerFreeRound = Math.ceil(freeCount / FREE_TIPS_VISIBLE);
    const round = Math.floor(cycleIndex / cyclesPerFreeRound);
    const positionInRound = cycleIndex % cyclesPerFreeRound;

    // Shuffle is stable for the entire round — seed includes round number
    const freeOrder = deterministicShuffle(freeCount, `${userId}:${empire}:${round}:free`);

    // Walk sequentially through the shuffled order (2 tips per step)
    const start = positionInRound * FREE_TIPS_VISIBLE;
    const remaining = freeCount - start;
    const needed = Math.min(FREE_TIPS_VISIBLE, remaining);
    for (let i = 0; i < needed; i++) {
      const idx = freeOrder[start + i];
      if (idx !== undefined && freeTipsAll[idx]) {
        selectedFree.push(freeTipsAll[idx]);
      }
    }
  }

  // ─── Select PREMIUM tip — ALWAYS exactly 1 ───
  // From the ÉLITE-only battery. Never mixed with FREE.
  // Same exhaustive logic: one full sweep, then reshuffle.
  const selectedPremium: typeof allTips = [];
  if (premiumCount > 0) {
    const cyclesPerPremiumRound = premiumCount; // 1 tip per cycle
    const round = Math.floor(cycleIndex / cyclesPerPremiumRound);
    const positionInRound = cycleIndex % cyclesPerPremiumRound;

    // Shuffle is stable for the entire round
    const premiumOrder = deterministicShuffle(premiumCount, `${userId}:${empire}:${round}:premium`);

    // Walk sequentially (1 tip per step)
    const idx = premiumOrder[positionInRound];
    if (idx !== undefined && premiumTipsAll[idx]) {
      selectedPremium.push(premiumTipsAll[idx]);
    }
  }

  return { freeTips: selectedFree, premiumTips: selectedPremium };
}
