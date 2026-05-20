// ═══════════════════════════════════════════
// Patrones de Vida — Human Observation Copy
// ═══════════════════════════════════════════
//
// Tone: observación calmada.
//
// Filters:
// ¿Esto parece una reflexión humana sobria
//   o una app intentando sonar inteligente?
//
// ¿Esto suena a UX writer diseñando frases
//   o a alguien que simplemente observó algo?
//
// Rules:
// - Name the specific domains (disfrute, necesidad, tranquilidad)
// - No "suele coincidir", "tiende a", "parece que"
// - No evaluative words (mejor, peor, estabilizarse)
// - No coaching
// - Not vague ("fluye de otra manera", "patrones distintos")
// - Not too perfect — human observation is slightly imperfect
// - Not too designed — natural, simple, direct
// - Short > long
// - Quiet > loud
// - Simple > clever
// - 3 variations per connection — enough variety without noise

import type { EmpireConnection } from './types';

// ─── Observation Templates ───
// 3 per connection. Direct. Specific. Not designed-sounding.

const OBSERVATION_COPY: Record<EmpireConnection, string[]> = {
  'finanzas-energia': [
    'Las semanas con menos descanso tienen más disfrute.',
    'Menos descanso, más disfrute.',
    'Cuando descansas menos, gastas más en ti.',
  ],

  'finanzas-mente': [
    'Semanas con más práctica mental, más tranquilidad.',
    'Cuando hay sesiones de mente, tranquilidad también está.',
    'Más mente, más calma en los números.',
  ],

  'finanzas-estres': [
    'Semanas con más presión, más necesidad en tus gastos.',
    'Cuando hay presión, necesidad aparece más.',
    'Estrés y necesidad van juntos.',
  ],

  'finanzas-sueno': [
    'Semanas con peor descanso, más necesidad.',
    'Menos sueño, más necesidad.',
    'No dormir bien cambia lo que necesitas.',
  ],
};

// ─── Empire Labels ───

export const EMPIRE_LABELS: Record<string, string> = {
  finanzas: 'Finanzas',
  energia: 'Energía',
  mente: 'Mente',
  estres: 'Estrés',
  sueno: 'Sueño',
};

// ─── Get Observation Text ───

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
// Short. No promises. No marketing.

export const EMPTY_STATE_MESSAGE =
  'Con el tiempo pueden aparecer conexiones.';

// ─── Section Titles ───

export const SECTION_TITLE = 'Lo que se repite';
export const SECTION_SUBTITLE = 'Con el tiempo';
