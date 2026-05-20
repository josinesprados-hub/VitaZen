// ═══════════════════════════════════════════
// Cierre Mensual — Copy
// ═══════════════════════════════════════════
//
// All user-facing text for the Monthly Closure.
// Separated from logic and rendering so copy
// can be reviewed, tuned, and evolved independently.
//
// Tone: observación calmada.
// Not coaching. Not therapy. Not analytics.
// ═══════════════════════════════════════════

// ─── Month names ───

const MONTH_NAMES: Record<number, string> = {
  1: 'Enero',
  2: 'Febrero',
  3: 'Marzo',
  4: 'Abril',
  5: 'Mayo',
  6: 'Junio',
  7: 'Julio',
  8: 'Agosto',
  9: 'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

export function getMonthName(month: number): string {
  return MONTH_NAMES[month] || '';
}

export function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  return `${getMonthName(parseInt(month))} ${year}`;
}

// ─── Entry prompt (dashboard) ───

export function getEntryPrompt(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-');
  const name = getMonthName(parseInt(month));
  return `${name}. Cuando quieras, hay un momento esperándote.`;
}

// ─── Reflection screen ───

export const REFLECTION_TITLE = '¿Tu forma de vivir este mes reflejó quién quieres ser?';
export const REFLECTION_PRIVACY_NOTE = 'Solo para ti.';

// ─── Skip reflection ───

export const SKIP_REFLECTION = 'Continuar sin escribir';

// ─── Save reflection ───

export const SAVE_REFLECTION = 'Guardar y ver mi mes';

// ─── Summary sections ───

export const SUMMARY_TITLE_FACTORY = (monthLabel: string) =>
  `Cómo viviste ${monthLabel}`;

export const INTENTION_BALANCE_TITLE = 'Tus intenciones';
export const INTENTION_BALANCE_EMPTY = 'Sin registros de intenciones este mes';

export const EVOLUTION_TITLE = 'Evolución suave';
export const EVOLUTION_NO_PREVIOUS = 'Es tu primer mes con datos';
export const EVOLUTION_SAME = 'Tu mes fue parecido al anterior';
export const EVOLUTION_QUIETER = 'Más tranquilo';
export const EVOLUTION_MORE_ACTIVE = 'Más movimiento';

export const PATTERNS_TITLE = 'Conexiones';
export const PATTERNS_NONE = '';

export const MEMORIES_TITLE = 'Momentos';

export const FINANCIAL_BALANCE_TITLE = 'Tu mes financiero';
export const FINANCIAL_NO_DATA = 'Sin movimientos registrados este mes';

export const RHYTHM_TITLE = 'Ritmo del mes';
export const RHYTHM_QUIET = 'Pausa y calma';
export const RHYTHM_ACTIVE = 'Bastante actividad';
export const RHYTHM_VARIABLE = 'Días muy distintos';
export const RHYTHM_STEADY = 'Ritmo constante';

// ─── Empty states ───

export const NO_DATA_TITLE = 'Aún no hay datos de este mes';
export const NO_DATA_SUBTITLE = 'No hay prisa.';

// ─── FREE vs Profundidad ───

export const ELITE_DEEPER = 'Las conexiones entre tus imperios se revelan con el tiempo';
export const ELITE_EVOLUTION = 'Evolución acumulativa';
export const ELITE_MEMORIES = 'Memoria mensual';
