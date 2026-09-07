"use client"

// ═══════════════════════════════════════════
// G-05 — ACHIEVEMENT UNLOCK FEEDBACK
// ═══════════════════════════════════════════
// Bridges the server-side action-time achievement evaluation
// (evaluateAchievements) to the user: every mutation endpoint now returns
// `newlyUnlocked` when the action unlocked achievements, and this helper
// turns that payload into an immediate, accessible toast.
//
// Reuses the EXISTING infrastructure — the shadcn/Radix toast that is
// already mounted globally in src/app/layout.tsx (<Toaster />). No new
// notification system, no modal, no confetti: one quiet toast, consistent
// with the product's "silent, human" tone.
//
// Notes:
// - The global toast queue has TOAST_LIMIT = 1, so when a single action
//   unlocks several achievements we show ONE combined toast instead of
//   fighting the queue (and never duplicate feedback on retries: a retry
//   response always carries newlyUnlocked: [] because the unlock already
//   happened in the first request).
// - Radix Toast is role="status" (polite live region), closes with the ✕
//   button, is swipeable/dismissible, and keyboard-reachable (Alt+T moves
//   focus to the viewport). Auto-dismisses after a few seconds so it never
//   blocks navigation.
// - Animation is disabled under prefers-reduced-motion by a CSS rule in
//   globals.css targeting the Radix toast viewport.

import { toast } from "@/hooks/use-toast"

/** Shape returned by the mutation endpoints for newlyUnlocked. */
export interface AchievementUnlockedInfo {
  key: string
  title: string
  description: string
  category: string
  icon: string
}

const ACHIEVEMENT_TOAST_DURATION_MS = 6500

/**
 * Reads `newlyUnlocked` from an API response payload and shows the
 * corresponding toast(s). Safe to call with ANY response object: if the
 * payload is missing, malformed, or empty, this is a no-op.
 *
 * @returns the number of achievements surfaced (0 when nothing to show).
 */
export function notifyAchievementUnlocks(payload: unknown): number {
  const list = (payload as { newlyUnlocked?: unknown } | null | undefined)?.newlyUnlocked
  if (!Array.isArray(list) || list.length === 0) return 0

  const unlocked = list.filter(
    (item): item is AchievementUnlockedInfo =>
      !!item && typeof item === 'object' && typeof (item as AchievementUnlockedInfo).title === 'string',
  )
  if (unlocked.length === 0) return 0

  if (unlocked.length === 1) {
    const a = unlocked[0]
    toast({
      title: `🏆 ${a.title}`,
      description: a.description,
      duration: ACHIEVEMENT_TOAST_DURATION_MS,
    })
  } else {
    // One combined toast (the global queue shows one toast at a time).
    const titles = unlocked.map(a => a.title).join(' · ')
    toast({
      title: `🏆 ${unlocked.length} logros desbloqueados`,
      description: titles,
      duration: ACHIEVEMENT_TOAST_DURATION_MS,
    })
  }

  return unlocked.length
}
