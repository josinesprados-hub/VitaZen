'use client';

import { useAuth } from '@/context/AuthContext';
import { useScreenshotMode } from '@/context/ScreenshotModeContext';

/**
 * usePrivacy — Centralized privacy state hook.
 *
 * Reads `privacyStatsVisible` from the auth context and provides
 * a single `isPrivate` boolean that determines whether sensitive
 * quantitative metrics should be visually hidden.
 *
 * When `isPrivate = true` (privacyStatsVisible = false):
 *   - Scores, streaks, counts, balances, and other personal metrics
 *     are visually masked via <PrivacyMask>
 *   - Emotional content, reflections, tips, and the core experience
 *     remain fully visible
 *
 * Screenshot mode always forces `isPrivate = false` so that editorial
 * screenshots show a premium, fully-visible state.
 *
 * This hook is the ONLY place that reads privacyStatsVisible for
 * UI rendering decisions. All components use this hook (or the
 * <PrivacyMask> wrapper which uses it internally) — never read
 * the field directly.
 */
export function usePrivacy() {
  const { user } = useAuth();
  const { isActive: screenshotMode } = useScreenshotMode();

  // Screenshot mode: always show everything (editorial state)
  if (screenshotMode) {
    return { isPrivate: false };
  }

  // privacyStatsVisible defaults to false → private by default
  // When user toggles ON → stats become visible
  const isPrivate = !(user?.privacyStatsVisible ?? false);

  return { isPrivate };
}
