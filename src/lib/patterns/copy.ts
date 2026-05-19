// ═══════════════════════════════════════════
// Patrones de Vida — Human Observation Copy
// ═══════════════════════════════════════════
//
// Every word here must pass the three filters:
// 1. ¿Esto añade consciencia o ruido?
// 2. ¿Esto muestra o juzga?
// 3. ¿Esto podría existir en cualquier app financiera?
//
// If it feels like fintech, analytics, productivity, coaching,
// or fake AI — ELIMINATE IT.
//
// Tone: observación calmada. Humana. Sobria. Silenciosa. Útil. Íntima.
// ═══════════════════════════════════════════

import type { EmpireConnection } from './types';

// ─── Observation Templates ───
// Each connection type has multiple observation templates
// so we can vary the language and avoid repetition

const OBSERVATION_COPY: Record<EmpireConnection, string[]> = {
  'finanzas-energia': [
    'Tus semanas con menos descanso coinciden con más gastos impulsivos.',
    'Cuando tu energía física baja, tu dinero tiende a fluir de otra manera.',
    'Los días con menos vitalidad suelen acompañarse de movimientos financieros diferentes.',
    'Tu cuerpo y tu dinero parecen ir de la mano: cuando uno cambia, el otro también.',
  ],

  'finanzas-mente': [
    'Cuando mantienes tus hábitos mentales, tu energía financiera suele estabilizarse.',
    'Las semanas con más práctica mental coinciden con más claridad en tus decisiones.',
    'Tu mente y tu dinero se influyen: cuando una se calma, el otro se ordena.',
    'Los periodos de más respiración consciente suelen acompañar decisiones más pausadas.',
  ],

  'finanzas-habitos': [
    'Tus días más ordenados coinciden con menos dispersión financiera.',
    'Cuando mantienes tus rutinas, tu dinero tiende a fluir con más foco.',
    'La consistencia en tus hábitos parece acompañar una relación más clara con el dinero.',
    'Las semanas con más hábitos cumplidos suelen ser semanas con más intención financiera.',
  ],

  'finanzas-estres': [
    'En tus semanas de más estrés, tu relación con el dinero cambia.',
    'Cuando la presión sube, tu dinero fluye de manera diferente.',
    'El estrés y tus movimientos financieros parecen conectarse de forma sutil.',
    'Las semanas más tensas coinciden con patrones financieros distintos.',
  ],

  'finanzas-sueno': [
    'Las noches con menos descanso suelen preceder días de más gasto.',
    'Tu sueño y tus decisiones financieras parecen ir de la mano.',
    'Cuando descansas mejor, tus movimientos financieros reflejan más calma.',
    'La calidad de tu descanso parece influir en cómo fluye tu dinero.',
  ],

  'finanzas-social': [
    'Los momentos sociales suelen acompañarse de más movimiento financiero.',
    'Tu vida social y tu dinero fluyen juntos en ciertos momentos.',
    'Las semanas con más contexto social tienden a coincidir con más actividad financiera.',
  ],
};

// ─── Empire Labels ───
// For subtle empire indicators in the UI

export const EMPIRE_LABELS: Record<string, string> = {
  finanzas: 'Finanzas',
  energia: 'Energía',
  mente: 'Mente',
  habitos: 'Hábitos',
  estres: 'Estrés',
  sueno: 'Sueño',
  social: 'Social',
};

// ─── Get Observation Text ───
// Returns a varied observation for the given connection type
// Uses the signal index to avoid showing the same text every time

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
// When there's not enough data to show anything

export const EMPTY_STATE_MESSAGE =
  'Con el tiempo, VitaZen empezará a mostrar conexiones entre partes de tu vida.';

// ─── Section Titles ───

export const SECTION_TITLE = 'Patrones de Vida';
export const SECTION_SUBTITLE = 'Conexiones entre partes de tu vida';
