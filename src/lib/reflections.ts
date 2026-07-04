// ═══════════════════════════════════════════
// VITAZEN — Curated Reflections
// ═══════════════════════════════════════════
//
// Curated, not generated.
//
// Each phrase was chosen, not produced.
// The criteria: does it sound like someone
// quietly noticed something — or like an app
// trying to sound profound?
//
// If it could exist in any wellness app,
// it doesn't belong here.
//
// Filters applied to EVERY piece:
//  - NOT advice. NOT coaching. NOT tips.
//  - NOT "frase bonita" or fake depth.
//  - NOT productivity language.
//  - NOT wellness startup tone.
//  - NOT constant positivity.
//  - YES: human, sober, observational, precise.
//  - YES: states, rhythms, silences, tiredness,
//    clarity, pause, presence, lightness.
//
// Emotional weight system:
// - 'light': common, everyday observations. Shown frequently.
// - 'relevant': contextual, connects to how life feels. Moderate frequency.
// - 'deep': rare, memorable, stays longer. These define VitaZen's soul.
//
// Deep reflections appear ~15% of the time.
// When one appears, it stays for 2 visits instead of 1.
//
// 100 reflections. Every one earned its place.

export type ReflectionWeight = 'light' | 'relevant' | 'deep';

export interface CuratedReflection {
  text: string;
  weight: ReflectionWeight;
}

// ─── Weight distribution ───
// light:    ~45%  (~45 pieces) — everyday, passing observations
// relevant: ~35%  (~35 pieces) — connects to how life feels right now
// deep:     ~20%  (~20 pieces) — rare, stays with you

export const REFLECTIONS: readonly CuratedReflection[] = [
  // ─── LIGERAS ───
  // Things a quiet person might notice.
  // Not wisdom. Not advice. Just observation.
  // Sensory. Specific. About rhythm, pace, feeling.

  { text: 'Hoy todo fue más lento.', weight: 'light' },
  { text: 'Hay más ritmo últimamente.', weight: 'light' },
  { text: 'Las cosas se sienten más claras.', weight: 'light' },
  { text: 'Días más tranquilos.', weight: 'light' },
  { text: 'Esta semana pasó rápido.', weight: 'light' },
  { text: 'Menos ruido esta vez.', weight: 'light' },
  { text: 'Parece que el ritmo se asentó.', weight: 'light' },
  { text: 'Hoy costó menos empezar.', weight: 'light' },
  { text: 'Más energía que ayer.', weight: 'light' },
  { text: 'La semana encontró su ritmo.', weight: 'light' },
  { text: 'Desperté con algo de claridad.', weight: 'light' },
  { text: 'No pasó nada grande. Y está bien.', weight: 'light' },
  { text: 'La semana terminó con calma.', weight: 'light' },
  { text: 'Hoy me di cuenta de que estaba tranquilo.', weight: 'light' },
  { text: 'Poco a poco, sin darse cuenta.', weight: 'light' },
  { text: 'Días más largos, pero sin peso.', weight: 'light' },
  { text: 'Hoy no hizo falta esforzarse.', weight: 'light' },
  { text: 'El cuerpo dice que va mejor.', weight: 'light' },
  { text: 'Cerré el teléfono antes de lo normal.', weight: 'light' },
  { text: 'Menos interrupciones hoy.', weight: 'light' },
  { text: 'La tarde se sintió distinta.', weight: 'light' },
  { text: 'Caminé sin prisa.', weight: 'light' },
  { text: 'El café supo mejor hoy.', weight: 'light' },
  { text: 'No miré tanto el reloj.', weight: 'light' },
  { text: 'Un rato de silencio y ya.', weight: 'light' },
  { text: 'Nada urgente. Por una vez.', weight: 'light' },
  { text: 'Todo en su sitio hoy.', weight: 'light' },
  { text: 'La mañana fue más suave.', weight: 'light' },
  { text: 'Un día que no pidió explicaciones.', weight: 'light' },
  { text: 'El ruido quedó fuera hoy.', weight: 'light' },
  { text: 'Hacía tiempo que no respiraba así.', weight: 'light' },
  { text: 'Menos decisiones hoy. Las justas.', weight: 'light' },
  { text: 'El día tuvo su propio ritmo.', weight: 'light' },
  { text: 'Se nota cuando el cuerpo descansa.', weight: 'light' },
  { text: 'Una conversación que dejó algo.', weight: 'light' },
  { text: 'Menos pantalla. Más ventana.', weight: 'light' },
  { text: 'Hoy no pasó nada. Y fue suficiente.', weight: 'light' },
  { text: 'El silencio de la mañana pesa menos.', weight: 'light' },
  { text: 'Algo se aflojó esta semana.', weight: 'light' },
  { text: 'Los días tienen distinto peso.', weight: 'light' },
  { text: 'Un rato sin pensar en nada.', weight: 'light' },
  { text: 'La luz era distinta hoy.', weight: 'light' },
  { text: 'Algunas cosas se resuelven solas.', weight: 'light' },
  { text: 'Día sin decisiones difíciles.', weight: 'light' },
  { text: 'Un día que no pidió nada extra.', weight: 'light' },

  // ─── RELEVANTES ───
  // Connects to how life feels. Contextual.
  // Not advice. Not coaching. Just recognition.
  // States, rhythms, tiredness, clarity, weight.

  { text: 'Hay semanas que pesan más.', weight: 'relevant' },
  { text: 'El cansancio tiene su lógica.', weight: 'relevant' },
  { text: 'Algunos días empiezan antes de estar listo.', weight: 'relevant' },
  { text: 'No todo necesita explicación.', weight: 'relevant' },
  { text: 'Cuesta menos cuando no piensas tanto.', weight: 'relevant' },
  { text: 'Algo cambió esta semana.', weight: 'relevant' },
  { text: 'El cuerpo pide lo que la cabeza ignora.', weight: 'relevant' },
  { text: 'Menos estrés, otra textura.', weight: 'relevant' },
  { text: 'Con calma se ve distinto.', weight: 'relevant' },
  { text: 'Hay ritmos que no se fuerzan.', weight: 'relevant' },
  { text: 'Algunas semanas pesan más de lo que muestran.', weight: 'relevant' },
  { text: 'Las cosas van a su ritmo.', weight: 'relevant' },
  { text: 'Algo cambió. No sabes qué.', weight: 'relevant' },
  { text: 'Hacía tiempo que no te sentías así.', weight: 'relevant' },
  { text: 'Un buen día no necesita razones.', weight: 'relevant' },
  { text: 'Hay semanas que piden menos.', weight: 'relevant' },
  { text: 'El ritmo es otro estos días.', weight: 'relevant' },
  { text: 'Parece que algo se alineó.', weight: 'relevant' },
  { text: 'Las mejoras no siempre se notan.', weight: 'relevant' },
  { text: 'Las decisiones pequeñas suman.', weight: 'relevant' },
  { text: 'Hay más orden del que parece.', weight: 'relevant' },
  { text: 'El estrés ya no pesa igual.', weight: 'relevant' },
  { text: 'La semana tuvo otro tono.', weight: 'relevant' },
  { text: 'Se nota cuando algo deja de costar.', weight: 'relevant' },
  { text: 'Lo que importa no hace ruido.', weight: 'relevant' },
  { text: 'Hay una calma que llega sola.', weight: 'relevant' },
  { text: 'El ritmo de ahora no es el de antes.', weight: 'relevant' },
  { text: 'Días con más peso.', weight: 'relevant' },
  { text: 'El cuerpo sabe antes.', weight: 'relevant' },
  { text: 'Hay semanas que cambian sin avisar.', weight: 'relevant' },
  { text: 'Lo que antes costaba, ya no tanto.', weight: 'relevant' },
  { text: 'Una quietud que no es parálisis.', weight: 'relevant' },
  { text: 'Estos días se sienten distintos.', weight: 'relevant' },
  { text: 'No hace falta entender todo hoy.', weight: 'relevant' },
  { text: 'Hay algo en esta semana que no estaba antes.', weight: 'relevant' },

  // ─── PROFUNDAS ───
  // Rare. Memorable. These define VitaZen's soul.
  // They appear ~15% of the time and stay for 2 visits.
  // Not philosophy. Not "frase bonita". Real depth.
  // Quiet. Sometimes uncomfortable. Always honest.

  { text: 'Hay cosas que vuelven hasta que las miras.', weight: 'deep' },
  { text: 'Lo que tienes ahora una vez fue lo que esperabas.', weight: 'deep' },
  { text: 'El silencio no está vacío. Tiene peso.', weight: 'deep' },
  { text: 'A veces solo se ve un paso. Y es suficiente.', weight: 'deep' },
  { text: 'Lo que más pesa es lo que no se nombra.', weight: 'deep' },
  { text: 'Hay cosas que solo se entienden mirando atrás.', weight: 'deep' },
  { text: 'No se trata de mejorar. De entenderse.', weight: 'deep' },
  { text: 'Lo que no se dice se acumula.', weight: 'deep' },
  { text: 'El tiempo pasa distinto cuando estás presente.', weight: 'deep' },
  { text: 'No siempre se sabe cuándo algo termina.', weight: 'deep' },
  { text: 'Hay una diferencia entre estar quieto y estar parado.', weight: 'deep' },
  { text: 'Lo que parece estancamiento a veces es pausa.', weight: 'deep' },
  { text: 'Hay dolores que no duelen hasta que los nombras.', weight: 'deep' },
  { text: 'Lo que importa no se busca. Aparece.', weight: 'deep' },
  { text: 'Algunas verdades solo se dicen en voz baja.', weight: 'deep' },
  { text: 'No siempre es posible saber si algo está cambiando.', weight: 'deep' },
  { text: 'Lo que más importa casi nunca hace ruido.', weight: 'deep' },
  { text: 'Hay preguntas que no necesitan respuesta.', weight: 'deep' },
  { text: 'Lo que temes perder ya lo tuviste.', weight: 'deep' },
  { text: 'Hay etapas que solo se reconocen cuando ya pasaron.', weight: 'deep' },
] as const;

// ─── Helpers ───

/** Get just the text strings (for backward compat) */
export const REFLECTION_TEXTS: readonly string[] = REFLECTIONS.map(r => r.text);

/** Get reflections filtered by weight */
export function getReflectionsByWeight(weight: ReflectionWeight): readonly string[] {
  return REFLECTIONS.filter(r => r.weight === weight).map(r => r.text);
}

/** Weighted random selection — DEPRECATED, kept only for reference.
 * Do NOT use in production — uses Math.random() which breaks
 * cross-device consistency. Use selectDeterministicReflection()
 * from emotional-dashboard-state.ts instead.
 * @deprecated Use server-side deterministic selection instead.
 */
export function selectWeightedReflection(excludeIndices: number[] = []): number {
  // Legacy implementation — DO NOT CALL from new code.
  // This function uses Math.random() which produces different
  // results on different devices/requests, breaking the core
  // principle that emotional content must be deterministic.
  const weights: Record<ReflectionWeight, number> = {
    light: 0.50,
    relevant: 0.35,
    deep: 0.15,
  };

  const pool: { index: number; weight: number }[] = [];
  const excludeSet = new Set(excludeIndices);

  REFLECTIONS.forEach((r, i) => {
    if (!excludeSet.has(i)) {
      pool.push({ index: i, weight: weights[r.weight] });
    }
  });

  if (pool.length === 0) {
    // Deterministic fallback instead of Math.random()
    return 0;
  }

  const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of pool) {
    random -= item.weight;
    if (random <= 0) return item.index;
  }

  return pool[pool.length - 1].index;
}

/** Check if a reflection is "deep" (stays longer) */
export function isDeepReflection(index: number): boolean {
  return index >= 0 && index < REFLECTIONS.length && REFLECTIONS[index].weight === 'deep';
}
