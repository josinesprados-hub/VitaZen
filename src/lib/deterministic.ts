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
// Simple, fast, deterministic hash.
// Same algorithm as getDailyIndex() in widgets/shaping.ts.

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
// Given a seed and array length, return a stable index.
// Same as getDailyIndex() but reusable.

export function deterministicIndex(seed: string, arrayLength: number): number {
  return deterministicHash(seed) % arrayLength;
}

// ─── Deterministic Fisher-Yates Shuffle ─────
// Produces the same shuffled order for the same seed.
// Replaces Math.random()-based shuffling.

export function deterministicShuffle(length: number, seed: string): number[] {
  const arr = Array.from({ length }, (_, i) => i);

  // Use a simple LCG seeded by the hash for reproducible "randomness"
  let h = deterministicHash(seed);

  for (let i = length - 1; i > 0; i--) {
    // Generate next "random" number in sequence
    h = (h * 1664525 + 1013904223) & 0x7fffffff;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr;
}

// ─── Deterministic Weighted Selection ───────
// Selects an index from a weighted pool deterministically.
// Replaces Math.random()-based weighted selection.
//
// weights: array of numeric weights (e.g. [0.50, 0.35, 0.15])
// seed: string for deterministic result

export function deterministicWeightedSelect(weights: number[], seed: string): number {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const h = deterministicHash(seed);
  let random = (h % 10000) / 10000 * totalWeight; // Normalize to [0, totalWeight)

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }

  return weights.length - 1;
}

// ─── Date Key Helper ────────────────────────
// Returns today's date as YYYY-MM-DD for use in seeds.

export function getTodayDateKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
