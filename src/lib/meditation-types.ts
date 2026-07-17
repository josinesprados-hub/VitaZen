// F7.5-03 FIX: Single source of truth for valid meditation types.
// Previously, POST used ['diaphragmatic','coherence','mindfulness','nadi_shodhana','box']
// while PUT used a legacy Spanish set ['respiracion','cuerpo','mindfulness','visualizacion','gratitud','otro'].
// This caused PUT to reject all real meditation types and accept phantom types.

export const VALID_MEDITATION_TYPES = [
  'diaphragmatic',
  'coherence',
  'mindfulness',
  'nadi_shodhana',
  'box',
] as const;

export type MeditationType = (typeof VALID_MEDITATION_TYPES)[number];