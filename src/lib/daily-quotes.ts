// ═══════════════════════════════════════════
// VITAZEN — Daily Quotes Engine: Data Layer
// ═══════════════════════════════════════════
//
// Pure data + types. No DB. No server. No client.
// Just the quote collection and its type definitions.
//
// The final collection will have 300-500 original quotes.
// Currently contains seed quotes to validate the engine.
//
// ─── ARCHITECTURE CONTRACT ────────────────
// To add new quotes in the future:
//   1. Add entries to the DAILY_QUOTES array below
//   2. That's it. No logic changes. No migration.
//
// The engine uses DAILY_QUOTES.length dynamically.
// New quotes join the next rotation cycle automatically.
// Ongoing cycles are never disrupted — the engine stores
// the collection length at cycle start and only uses
// that length until the cycle completes.
// ═══════════════════════════════════════════

// ─── Types ───

export interface DailyQuote {
  /** The quote text — original, never a real citation */
  text: string;
}

export interface DailyQuoteState {
  /** Current position in the shuffled cycle (0-based) */
  currentIndex: number;
  /** Which cycle we're on (0, 1, 2, ...) — used as deterministic shuffle seed */
  cycleNumber: number;
  /** Date key (YYYY-MM-DD) of the last quote change */
  lastDateKey: string;
  /** Length of DAILY_QUOTES when this cycle started.
   *  Prevents adding new quotes from disrupting an ongoing cycle. */
  collectionLength: number;
}

// ─── Seed Quotes ──────────────────────────
// Placeholder quotes to validate the engine.
// Will be replaced by the definitive 300-500 collection.
//
// Style criteria (per VitaZen editorial guidelines):
//   - Completely original. Not real quotes.
//   - No paraphrasing known phrases.
//   - Inspired by: personal development, leadership,
//     healthy habits, discipline, growth,
//     evidence-based psychology, practical philosophy.
//   - Elegant. Simple. Deep. Natural. Human. Timeless.
//   - No empty phrases. No toxic positivity.
//   - No exaggerated spirituality. No marketing. No clichés.

export const DAILY_QUOTES: readonly DailyQuote[] = [
  { text: 'No necesitas motivación. Necesitas claridad.' },
  { text: 'La disciplina no es rigidez. Es coherencia con lo que importa.' },
  { text: 'Lo que practicas se fortalece. Lo que evitas te persigue.' },
  { text: 'El cambio real no empieza con un plan. Empieza con una decisión pequeña.' },
  { text: 'No esperes sentirte listo. La acción crea la preparación.' },
] as const;
