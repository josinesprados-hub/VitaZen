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
// Emotional weight system:
// - 'light': common, everyday observations. Shown frequently.
// - 'relevant': contextual, connects to how life feels. Moderate frequency.
// - 'deep': rare, memorable, stays longer. These define VitaZen's soul.
//
// Deep reflections appear ~15% of the time.
// When one appears, it stays for 2 visits instead of 1.
//
// ~95 reflections. Every one earned its place.

export type ReflectionWeight = 'light' | 'relevant' | 'deep';

export interface CuratedReflection {
  text: string;
  weight: ReflectionWeight;
}

// ─── Weight distribution targets ───
// light:   ~45%  (~43 pieces) — everyday, passing observations
// relevant: ~35% (~33 pieces) — connects to how life feels right now
// deep:    ~20%  (~19 pieces) — rare, stays with you

export const REFLECTIONS: readonly CuratedReflection[] = [
  // ─── LIGERAS ───
  // Things a quiet person might notice.
  // Not wisdom. Not advice. Just observation.

  { text: 'Hoy todo fue más lento.', weight: 'light' },
  { text: 'Hay más ritmo últimamente.', weight: 'light' },
  { text: 'Las cosas se sienten más claras.', weight: 'light' },
  { text: 'Días más tranquilos.', weight: 'light' },
  { text: 'Esta semana pasó rápido.', weight: 'light' },
  { text: 'Menos ruido esta vez.', weight: 'light' },
  { text: 'Un día normal. Eso también cuenta.', weight: 'light' },
  { text: 'Parece que el ritmo se asentó.', weight: 'light' },
  { text: 'Hoy costó menos empezar.', weight: 'light' },
  { text: 'Sin prisa. Sin pausa. Así.', weight: 'light' },
  { text: 'Más energía que ayer.', weight: 'light' },
  { text: 'Días así se agradecen.', weight: 'light' },
  { text: 'La semana encontró su ritmo.', weight: 'light' },
  { text: 'Menos dispersión últimamente.', weight: 'light' },
  { text: 'Todo un poco más fácil hoy.', weight: 'light' },
  { text: 'Desperté con algo de claridad.', weight: 'light' },
  { text: 'Estos días son más parecidos.', weight: 'light' },
  { text: 'No pasó nada grande. Y está bien.', weight: 'light' },
  { text: 'Un día sin estrés ya es algo.', weight: 'light' },
  { text: 'La semana terminó con calma.', weight: 'light' },
  { text: 'Hoy me di cuenta de que estaba tranquilo.', weight: 'light' },
  { text: 'Poco a poco, sin darse cuenta.', weight: 'light' },
  { text: 'Esta semana tuvo ritmo propio.', weight: 'light' },
  { text: 'La calma llegó sola.', weight: 'light' },
  { text: 'Días más largos, pero sin peso.', weight: 'light' },
  { text: 'Simplicidad. Eso fue hoy.', weight: 'light' },
  { text: 'Hoy no hizo falta esforzarse.', weight: 'light' },
  { text: 'El cuerpo dice que va mejor.', weight: 'light' },
  { text: 'Pocas decisiones. Las necesarias.', weight: 'light' },
  { text: 'Un día que no pidió nada extra.', weight: 'light' },
  { text: 'Cerré el teléfono antes de lo normal.', weight: 'light' },
  { text: 'Menos interrupciones hoy.', weight: 'light' },
  { text: 'La tarde se sintió distinta.', weight: 'light' },
  { text: 'Caminé sin prisa.', weight: 'light' },
  { text: 'El café supo mejor hoy.', weight: 'light' },
  { text: 'No miré tanto el reloj.', weight: 'light' },
  { text: 'Un rato de silencio y ya.', weight: 'light' },
  { text: 'El día se sintió completo.', weight: 'light' },
  { text: 'Nada urgente. Por una vez.', weight: 'light' },
  { text: 'Día sin decisiones difíciles.', weight: 'light' },
  { text: 'Todo en su sitio hoy.', weight: 'light' },
  { text: 'La mañana fue más suave.', weight: 'light' },
  { text: 'Un día que no pidió explicaciones.', weight: 'light' },

  // ─── RELEVANTES ───
  // Connects to how life feels. Contextual.
  // Not advice. Just recognition.

  { text: 'No confundas movimiento con progreso.', weight: 'relevant' },
  { text: 'La disciplina no grita. Simplemente aparece cada día.', weight: 'relevant' },
  { text: 'La consistencia no es espectacular. Pero transforma.', weight: 'relevant' },
  { text: 'El progreso real es silencioso.', weight: 'relevant' },
  { text: 'La claridad no llega pensando más. Llega eliminando lo innecesario.', weight: 'relevant' },
  { text: 'Si no sabes qué hacer, haz una cosa sola.', weight: 'relevant' },
  { text: 'La calma no es ausencia de problemas. Es presencia ante ellos.', weight: 'relevant' },
  { text: 'El enfoque no es hacer más. Es decidir qué no hacer.', weight: 'relevant' },
  { text: 'Cada sí a lo irrelevante es un no a lo esencial.', weight: 'relevant' },
  { text: 'El propósito no es un destino. Es una brújula.', weight: 'relevant' },
  { text: 'No creces castigándote. Creces eligiendo lo difícil con amabilidad.', weight: 'relevant' },
  { text: 'Descansar no es rendirse. Es parte de la estrategia.', weight: 'relevant' },
  { text: 'Aceptarte no es conformarte. Es empezar desde la verdad.', weight: 'relevant' },
  { text: 'La energía se gestiona, no se busca.', weight: 'relevant' },
  { text: 'El agotamiento no es medalla. Es señal.', weight: 'relevant' },
  { text: 'No necesitas vaciar la mente. Necesitas dejar de luchar contra ella.', weight: 'relevant' },
  { text: 'El dinero no es la meta. La tranquilidad sí.', weight: 'relevant' },
  { text: 'La riqueza real es no necesitar impresionar a nadie.', weight: 'relevant' },
  { text: 'Un paso imperfecto vale más que mil planes perfectos.', weight: 'relevant' },
  { text: 'Soltar no es rendirse. Es hacer espacio.', weight: 'relevant' },
  { text: 'Menos ruido. Más señal.', weight: 'relevant' },
  { text: 'El tiempo no se gestiona. Se elige.', weight: 'relevant' },
  { text: 'La adversidad no te define. Te revela.', weight: 'relevant' },
  { text: 'Observar sin juzgar es la habilidad más subestimada.', weight: 'relevant' },
  { text: 'Aprender a detenerte antes de reaccionar cambia todo.', weight: 'relevant' },
  { text: 'La integridad es lo que haces cuando nadie observa.', weight: 'relevant' },
  { text: 'Las promesas pequeñas mantenidas construyen una vida grande.', weight: 'relevant' },
  { text: 'No necesitas un propósito grandioso. Necesitas una dirección honesta.', weight: 'relevant' },
  { text: 'Cuidar tu energía no es egoísmo.', weight: 'relevant' },
  { text: 'La mente calmada ve lo que la agitada no puede.', weight: 'relevant' },
  { text: 'Ahorra no para tener más, sino para depender menos.', weight: 'relevant' },
  { text: 'La persona calmada no ignora el caos. Lo observa sin ser arrastrada.', weight: 'relevant' },
  { text: 'La disciplina real no se fuerza. Se elige en silencio.', weight: 'relevant' },

  // ─── PROFUNDAS ───
  // Rare. Memorable. These define VitaZen's soul.
  // They appear ~15% of the time and stay for 2 visits.

  { text: 'Lo que no se examina se repite.', weight: 'deep' },
  { text: 'No busques significado. Constrúyelo.', weight: 'deep' },
  { text: 'Lo que toleras persiste.', weight: 'deep' },
  { text: 'No eres tus pensamientos. Eres quien los observa.', weight: 'deep' },
  { text: 'Tu valor no depende de tu productividad.', weight: 'deep' },
  { text: 'La profundidad requiere silencio. La prisa te mantiene en la superficie.', weight: 'deep' },
  { text: 'Entre lo que pasa y tu reacción hay un espacio. Ahí vive tu libertad.', weight: 'deep' },
  { text: 'El coraje silencioso de cada día es más heroico que cualquier gesto espectacular.', weight: 'deep' },
  { text: 'La gratitud no cambia las circunstancias. Cambia quien las observa.', weight: 'deep' },
  { text: 'Lo que tienes ahora una vez fue lo que esperabas.', weight: 'deep' },
  { text: 'La persona que admite su miedo ya ha dado el primer paso.', weight: 'deep' },
  { text: 'El silencio no está vacío.', weight: 'deep' },
  { text: 'No necesitas ver todo el camino. Solo el siguiente paso.', weight: 'deep' },
  { text: 'La presencia es el lujo que casi nadie se permite.', weight: 'deep' },
  { text: 'Donde hay confusión, hay algo que no quieres ver.', weight: 'deep' },
  { text: 'El poder real no se demuestra con volumen. Se demuestra con quietud.', weight: 'deep' },
  { text: 'Aprender a desaprender es la habilidad más difícil y la más valiosa.', weight: 'deep' },
  { text: 'No necesitas un evento transformador. Necesitas pequeñas decisiones diarias.', weight: 'deep' },
  { text: 'La perfección es el enemigo más elegante del progreso.', weight: 'deep' },
] as const;

// ─── Helpers ───

/** Get just the text strings (for backward compat) */
export const REFLECTION_TEXTS: readonly string[] = REFLECTIONS.map(r => r.text);

/** Get reflections filtered by weight */
export function getReflectionsByWeight(weight: ReflectionWeight): readonly string[] {
  return REFLECTIONS.filter(r => r.weight === weight).map(r => r.text);
}

/** Weighted random selection: light 50%, relevant 35%, deep 15% */
export function selectWeightedReflection(excludeIndices: number[] = []): number {
  const weights: Record<ReflectionWeight, number> = {
    light: 0.50,
    relevant: 0.35,
    deep: 0.15,
  };

  // Build available pool with weights
  const pool: { index: number; weight: number }[] = [];
  const excludeSet = new Set(excludeIndices);

  REFLECTIONS.forEach((r, i) => {
    if (!excludeSet.has(i)) {
      pool.push({ index: i, weight: weights[r.weight] });
    }
  });

  if (pool.length === 0) {
    // Fallback: all reflections
    return Math.floor(Math.random() * REFLECTIONS.length);
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
