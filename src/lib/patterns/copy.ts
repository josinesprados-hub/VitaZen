// ═══════════════════════════════════════════
// Patrones de Vida — Human Observation Copy
// ═══════════════════════════════════════════
//
// Every word here must pass the three filters:
// 1. ¿Esto añade consciencia o ruido?
// 2. ¿Esto muestra o juzga?
// 3. ¿Esto podría existir en cualquier app financiera?
//
// Plus the fourth filter:
// ¿Esto parece una reflexión humana sobria
//   o una app intentando sonar inteligente?
//
// Tone: observación calmada.
// Not: coaching, therapy, analytics, AI, fortune cookie.
//
// Rules for every observation:
// - Name the specific domains (descanso, estrés, disfrute, necesidad...)
// - No "suele coincidir", "tiende a", "parece que"
// - No evaluative words (mejor, peor, más claro, estabilizarse)
// - No coaching (deberías, prueba, te conviene)
// - Not obvious (spending more when you go out)
// - Not vague ("fluye de otra manera", "patrones distintos")
// - Short is better than long
// - Quiet is better than loud
// - If the observation could be said by a human friend
//   who actually looked at your data: keep it.
//   If it sounds like an algorithm trying to sound deep: cut it.
// ═══════════════════════════════════════════

import type { EmpireConnection } from './types';

// ─── Observation Templates ───
// 2 templates per connection type. No more.
// Each names the specific variables involved.
// No wrapping in vague formulas.

const OBSERVATION_COPY: Record<EmpireConnection, string[]> = {
  'finanzas-energia': [
    'Tus semanas de menos energía tienen más peso en disfrute.',
    'Cuando el descanso baja, disfrute sube en tus registros.',
  ],

  'finanzas-mente': [
    'Las semanas con más práctica mental registran más tranquilidad.',
    'En semanas con sesiones de mente, necesidad pierde peso en tus movimientos.',
  ],

  'finanzas-estres': [
    'En las semanas de más presión, necesidad gana peso en tus gastos.',
    'Cuando el estrés sube, la intención de tus gastos cambia.',
  ],

  'finanzas-sueno': [
    'Las semanas con peor descanso tienen más gastos por necesidad.',
    'Menos sueño, más necesidad en tus registros.',
  ],
};

// ─── Empire Labels ───
// For subtle empire indicators in the UI

export const EMPIRE_LABELS: Record<string, string> = {
  finanzas: 'Finanzas',
  energia: 'Energía',
  mente: 'Mente',
  estres: 'Estrés',
  sueno: 'Sueño',
};

// ─── Get Observation Text ───
// Returns a varied observation for the given connection type.
// Uses the signal index to avoid showing the same text every time.

export function getObservationText(
  connection: EmpireConnection,
  variationIndex: number = 0
): string {
  const templates = OBSERVATION_COPY[connection];
  if (!templates || templates.length === 0) return '';
  const index = variationIndex % templates.length;
  return templates[index];
}

// ─── Empty State Message ───
// When there's not enough data to show anything.
// Short. Silent. No promises.

export const EMPTY_STATE_MESSAGE =
  'Con el tiempo, pueden aparecer conexiones.';

// ─── Section Titles ───

export const SECTION_TITLE = 'Patrones de Vida';
export const SECTION_SUBTITLE = 'Conexiones que emergen con el tiempo';
