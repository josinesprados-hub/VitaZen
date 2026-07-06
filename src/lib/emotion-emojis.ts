// ═══════════════════════════════════════════
// VITAZEN — Emotion Emojis (single source of truth)
// ═══════════════════════════════════════════
//
// DASH-1 FIX: The dashboard and the CheckInModal previously used different
// emoji thresholds for the same emotion value. This module is the single
// source of truth — both the dashboard (page.tsx) and the modal
// (CheckInModal.tsx) import from here.
//
// Emotion scale: 1 (Muy bajo) → 5 (Excelente)

export const EMOTION_EMOJIS: Record<number, string> = {
  1: '😞',
  2: '😔',
  3: '😐',
  4: '🙂',
  5: '😊',
};

/** Get the emoji for a 1-5 emotion value, with a safe fallback. */
export function getEmotionEmoji(emotion: number): string {
  return EMOTION_EMOJIS[emotion] || '😐';
}
