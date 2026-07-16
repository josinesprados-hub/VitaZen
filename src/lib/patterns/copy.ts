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
    'El descanso y el gasto personal van de la mano.',
  ],

  'finanzas-mente': [
    'Semanas con más práctica mental, más tranquilidad.',
    'Con más práctica mental, también hay más tranquilidad.',
    'Más mente, más calma en los números.',
    'La práctica mental se nota en las decisiones.',
  ],

  'finanzas-estres': [
    'Semanas con más presión, más necesidad en tus gastos.',
    'En las semanas con más presión, tus gastos reflejan más necesidad.',
    'Estrés y necesidad van juntos.',
    'La presión cambia lo que necesitas.',
  ],

  'finanzas-sueno': [
    'Semanas con peor descanso, más necesidad.',
    'Menos sueño, más necesidad.',
    'No dormir bien cambia lo que necesitas.',
    'El descanso afecta tus prioridades.',
  ],

  'energia-mente': [
    'Las semanas con más energía tienen más práctica mental.',
    'Con más energía, también hay más práctica mental.',
    'La energía y la práctica mental van juntas.',
    'Más práctica mental en las semanas de más energía.',
  ],

  'checkin-mente': [
    'Las semanas con más enfoque tienen más práctica mental.',
    'Con más atención diaria, también hay más práctica mental.',
    'El enfoque y la práctica mental van juntos.',
    'Más práctica mental en las semanas con más atención.',
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
  'Las conexiones necesitan tiempo.';

// ─── Section Titles ───

export const SECTION_TITLE = 'Lo que se repite';
export const SECTION_SUBTITLE = 'Con el tiempo';
