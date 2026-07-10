// ═══════════════════════════════════════════
// VITAZEN — Deterministic Random Utilities
// ═══════════════════════════════════════════
//
// Replaces Math.random() with deterministic,
// seed-based selection. Same seed = same result
// on every device, every request.
//
// This is the core of cross-device consistency:
// the "randomness" feels organic, but it's
// actually deterministic from (userId + dateKey).
//
// No AI. No external services. Just math.

// ─── Hash Function ──────────────────────────

export function deterministicHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// ─── Deterministic Index Selection ──────────

export function deterministicIndex(seed: string, arrayLength: number): number {
  return deterministicHash(seed) % arrayLength;
}

// ─── Deterministic Fisher-Yates Shuffle ─────

export function deterministicShuffle(length: number, seed: string): number[] {
  const arr = Array.from({ length }, (_, i) => i);

  let h = deterministicHash(seed);

  for (let i = length - 1; i > 0; i--) {
    h = (h * 1664525 + 1013904223) & 0x7fffffff;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

// ─── Deterministic Weighted Selection ───────

export function deterministicWeightedSelect(weights: number[], seed: string): number {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const h = deterministicHash(seed);
  let random = (h % 10000) / 10000 * totalWeight;

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }

  return weights.length - 1;
}

// ─── Date Key Helpers ────────────────────────
// Re-exported from the unified dates module.
// All date/time logic now lives in dates.ts.

export {
  getMadridDateKey,
  getTodayDateKey,
} from './dates';