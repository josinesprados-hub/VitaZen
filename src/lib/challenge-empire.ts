/**
 * Challenge category → reward empire — canonical mapping.
 *
 * N-5 (Opción B) established that each completed challenge awards +25 XP to
 * the empire of its OWN category (never unconditionally to disciplina).
 * N-6 extracts the mapping into this dependency-free module so that BOTH
 * the server reward path (src/lib/challenge-auto-complete.ts) and client
 * widgets (challenge card on the disciplina page) consume the SAME source
 * of truth — the UI must not hand-copy a mapping that can drift.
 *
 * The real challenge categories (DailyChallenge.category, seeded in
 * prisma/seed.ts) are action themes, not empire names, so this is the
 * single canonical translation. It is grounded in the code, not invented:
 *
 *   disciplina    → disciplina   (name match; completed by the habit action,
 *                               whose XP source is the disciplina empire)
 *   habitos       → disciplina   (same habit action — habits ARE the
 *                               disciplina empire's event source)
 *   mentalidad    → mente        (mind category ↔ mente empire; meditation,
 *                               mente's XP source, completes it)
 *   productividad → crecimiento  (completed by journal — the crecimiento
 *                               empire's XP source)
 *   salud         → energia      (health ↔ energia; wellness/nutrition —
 *                               energia's XP sources — complete it)
 *
 * There is no challenge category completed by a finance action, so the
 * riqueza empire never receives challenge XP. An UNKNOWN category is
 * fail-closed on both sides: the server does NOT complete the challenge and
 * grants NO XP (challenge-auto-complete.ts), and the UI renders no reward
 * badge — add the category here first if a new one is ever seeded.
 *
 * This module must stay dependency-free: it is imported by client
 * components ('use client') as well as server code.
 */

export const CHALLENGE_CATEGORY_TO_EMPIRE: Record<string, string> = {
  disciplina: 'disciplina',
  habitos: 'disciplina',
  mentalidad: 'mente',
  productividad: 'crecimiento',
  salud: 'energia',
};

/**
 * Display labels for the 5 empires (client-safe). Used by UI surfaces that
 * render a challenge's reward empire. Includes riqueza for completeness —
 * the mapping above never yields it today, but labels must cover the whole
 * empire domain so a future category can never render a raw enum value.
 */
export const EMPIRE_LABELS: Record<string, string> = {
  disciplina: 'Disciplina',
  mente: 'Mente',
  energia: 'Energía',
  riqueza: 'Finanzas',
  crecimiento: 'Crecimiento',
};
