// ═══════════════════════════════════════════
// Etapas — Copy
// ═══════════════════════════════════════════
//
// All user-facing text for the Etapas feature.
// Separated from logic so copy can be reviewed
// and tuned independently.
//
// Tone: observación calmada.
// Not coaching. Not therapy. Not analytics.
// ═══════════════════════════════════════════

// ─── Page ───

export const PAGE_TITLE = 'Etapas';
export const PAGE_SUBTITLE = 'Cómo ha ido cambiando tu vida';

// ─── Section titles ───

export const STAGES_TITLE = 'Periodos';
export const STAGES_SUBTITLE = 'El ritmo de tu vida';

export const MEMORIES_TITLE = 'Momentos';
export const MEMORIES_SUBTITLE = 'Fragmentos de tu vida';

export const TRANSITIONS_TITLE = 'Transiciones';
export const TRANSITIONS_SUBTITLE = 'Cambios entre etapas';

export const PATTERNS_TITLE = 'Conexiones';
export const PATTERNS_SUBTITLE = 'Relaciones entre partes de tu vida';

// ─── Empty states ───

export const NO_DATA_TITLE = 'Se revela con el tiempo';
export const NO_DATA_SUBTITLE = 'Cada día suma.';

export const LITTLE_DATA_TITLE = 'Tu vida está tomando forma';
export const LITTLE_DATA_SUBTITLE = 'Poco a poco.';

// ─── FREE vs Profundidad ───

export const ELITE_STAGES = 'Etapas de vida';
export const ELITE_TRANSITIONS = 'Transiciones personales';
export const ELITE_CONNECTIONS = 'Conexiones históricas';
export const ELITE_EVOLUTION = 'Evolución personal';
export const ELITE_BADGE = 'Élite';

export const FREE_LIMIT_MESSAGE = 'Las etapas de vida se revelan con el tiempo';

// ─── Time labels ───

export function getTimeRangeLabel(oldest: string | null, newest: string | null): string {
  if (!oldest || !newest) return '';

  const [y1, m1] = oldest.split('-').map(Number);
  const [y2, m2] = newest.split('-').map(Number);

  const MONTH_NAMES: Record<number, string> = {
    1: 'ene', 2: 'feb', 3: 'mar', 4: 'abr', 5: 'may', 6: 'jun',
    7: 'jul', 8: 'ago', 9: 'sep', 10: 'oct', 11: 'nov', 12: 'dic',
  };

  if (y1 === y2) {
    return `${MONTH_NAMES[m1]} — ${MONTH_NAMES[m2]} ${y1}`;
  }
  return `${MONTH_NAMES[m1]} ${y1} — ${MONTH_NAMES[m2]} ${y2}`;
}
