// ═══════════════════════════════════════════
// REASONING ENGINE — Core
//
// The brain that decides HOW the mentor should
// respond before the response is generated.
//
// Architecture:
//   - Zero DB queries
//   - Zero API calls
//   - Zero new context generation
//   - Pure string analysis + deterministic rules
//   - <1ms execution time
//
// Executes AFTER the Decision Engine has optimized
// the context, BEFORE the prompt is sent to Groq.
// It injects a REASONING INSTRUCTION into the prompt
// that tells the model HOW to use the available
// context for THIS specific message.
//
// The Decision Engine decides WHAT context to use.
// The Reasoning Engine decides HOW to use it.
// ═══════════════════════════════════════════

import type {
  UserNeed,
  Intention,
  ToneStyle,
  ResponseObjective,
  AdaptationSignals,
  RepetitionCheck,
  ReasoningInput,
  ReasoningInstruction,
  RepetitionType,
} from './types';

// ═══════════════════════════════════════════
// 1. NEED DETECTION
// What the user really needs beyond the text.
// ═══════════════════════════════════════════

interface NeedRule {
  need: UserNeed;
  patterns: RegExp[];
  priority: number; // higher = more important
}

const NEED_RULES: NeedRule[] = [
  // Crisis / unblock — highest priority
  {
    need: 'desbloqueo',
    patterns: [
      /\bno (puedo|más|aguanto|soporto|resisto)\b/i,
      /\b(?:me siento|estoy) (completamente|totalmente|absolutamente) (saturado|agotado|perdido|desbordado)\b/i,
      /\bno (sé|se) (qué hacer|por dónde empezar|cómo seguir)\b/i,
      /\bestoy al (límite|borde|final)\b/i,
    ],
    priority: 100,
  },
  {
    need: 'comprension_emocional',
    patterns: [
      /\b(?:me siento|estoy) (triste|contento|feliz|frustrado|ansioso|nervioso|preocupado|decepcionado|perdido|confundido|solo|sola)\b/i,
      /\b(?:tengo|miedo|siento) (miedo|culpa|vergüenza|inseguridad)\b/i,
      /\b(?:estoy pasando por|atravesando) (un|una) (mal|difícil) (momento|rato|etapa|época)\b/i,
      /\b(?:me )?(duele|dolió|hace daño|cuesta)\b/i,
    ],
    priority: 90,
  },
  {
    need: 'validacion_emocional',
    patterns: [
      /\b(?:siempre|todo) (me sale|me pasa|me ocurre|intento)\b/i,
      /\b(?:otra vez|de nuevo|otra vez lo) (mismo|igual|fallé)\b/i,
      /\bsoy un (fracaso|desastre|inútil|fracasado)\b/i,
      /\bno soy (lo bastante|suficientemente) (bueno|fuerte|constante|disciplinado|valiente)\b/i,
    ],
    priority: 85,
  },
  {
    need: 'toma_de_decisiones',
    patterns: [
      /\b(?:quiero|voy a|debería) (dejar|cambiar|renunciar|empezar|tomar)\b/i,
      /\bno (sé|se) (si|sí) (debería|quiero|puedo|hacer)\b/i,
      /\b(?:me da|m da) (miedo|pánico|terror|vértigo)\b/i,
      /\b(?:duda|dudando|indeciso|no me decido)\b/i,
    ],
    priority: 80,
  },
  {
    need: 'celebracion',
    patterns: [
      /\b(?:lo )?(logré|conseguí|terminé|completé|finalicé)\b/i,
      /\b(?:por fin|ya pude|al fin|mejor)\b/i,
      /\b(?:racha de|días seguidos)\b/i,
    ],
    priority: 75,
  },
  {
    need: 'ayuda_practica',
    patterns: [
      /\b(?:cómo|como) (empiezo|hago|puedo|debo|funciona|organizo|mejoro)\b/i,
      /\b(?:dame|dame|necesito|quiero) (un )?(plan|método|rutina|paso|estructura|guía|estrategia)\b/i,
      /\b(?:qué|que) (puedo|hago|debo) (hacer|intentar|probar)\b/i,
    ],
    priority: 70,
  },
  {
    need: 'reflexion',
    patterns: [
      /\b(?:qué|que) (sentido|significado|importancia|valor) (tiene|hay)\b/i,
      /\b(?:mi )?(propósito|sentido|dirección|camino|vida|futuro)\b/i,
      /\b(?:para qué|para que) (todo|esto|lo|hago|intentarlo)\b/i,
      /\b(?:no sé|no se) si (quiero|debo|esto es)\b/i,
    ],
    priority: 65,
  },
  {
    need: 'orientacion',
    patterns: [
      /\b(?:estoy|me siento) (perdido|confundido|desorientado|sin rumbo)\b/i,
      /\b(?:no sé|no se) (por dónde|cómo) (empezar|seguir)\b/i,
      /\b(?:necesito|quiero) (orientación|dirección|una guía|que me guíes)\b/i,
    ],
    priority: 60,
  },
  {
    need: 'accion',
    patterns: [
      /\b(?:vamos|a por|empiezo|voy a empezar|hoy empiezo)\b/i,
      /\b(?:dame|dame|indica|sugiere) (el )?(primer|siguiente) (paso|movimiento)\b/i,
      /\b(?:listo|preparado|ya|vale) (para|que)\b/i,
    ],
    priority: 55,
  },
  {
    need: 'motivacion',
    patterns: [
      /\b(?:no puedo|más|sigo|siguiente)\b/i,
      /\b(?:fuerza|ánimo|esfuerzo|aguante)\b/i,
      /\b(?:cuesta|dificil|difícil|duro|pesado)\b/i,
    ],
    priority: 40, // Low priority — detected often but usually not the primary need
  },
  {
    need: 'claridad',
    patterns: [
      /\b(?:no entiendo|confuso|confusa|no tiene sentido|no me queda claro)\b/i,
      /\b(?:¿qué|que) (significa|quiere decir|quieres decir)\b/i,
    ],
    priority: 50,
  },
  {
    need: 'continuidad',
    patterns: [
      /\b(?:lo que hablamos|lo que dijiste|lo último que|me recomendaste|me dijiste)\b/i,
      /\b(?:como dijimos|como te conté|te comenté|te conté)\b/i,
      /\b(?:hace (unos|tiempo|semanas)|volvimos a|otra vez con)\b/i,
    ],
    priority: 45,
  },
];

function detectNeeds(message: string): UserNeed[] {
  const msg = message.toLowerCase();
  const scored: Array<{ need: UserNeed; score: number }> = [];

  for (const rule of NEED_RULES) {
    let matchCount = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(msg)) matchCount++;
    }
    if (matchCount > 0) {
      scored.push({ need: rule.need, score: rule.priority + matchCount * 20 });
    }
  }

  // Sort by score descending, return ordered needs
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.need);
}

// ═══════════════════════════════════════════
// 2. MULTI-INTENTION ANALYSIS
// Detects hybrid messages with multiple signals.
// ═══════════════════════════════════════════

interface IntentionRule {
  intention: Intention;
  patterns: RegExp[];
}

const INTENTION_RULES: IntentionRule[] = [
  {
    intention: 'progreso',
    patterns: [
      /\b(?:he )?(logrado|conseguido|avanzado|mejorado|completado)\b/i,
      /\b(?:pasos|días|semanas) (seguidos|de|racha)\b/i,
      /\bcaminado|pasos\b/i,
      /\b(?:he hecho|ya pude|pude|terminé)\b/i,
    ],
  },
  {
    intention: 'frustracion',
    patterns: [
      /\b(?:sigo sin|no logro|no puedo|no consigo)\b/i,
      /\b(?:me siento un )?(fracaso|desastre|inútil)\b/i,
      /\b(?:aún me falta|todavía no|no es suficiente)\b/i,
    ],
  },
  {
    intention: 'autoestima_baja',
    patterns: [
      /\bno soy (lo bastante|suficientemente)\b/i,
      /\bsoy un (fracaso|desastre)\b/i,
      /\bno valgo\b/i,
    ],
  },
  {
    intention: 'inseguridad',
    patterns: [
      /\b(?:tengo|miedo|siento) (miedo|inseguridad)\b/i,
      /\b(?:me da|m da) (miedo|pánico|vértigo)\b/i,
      /\b(?:no sé|no se) si (podré|podemos|seré)\b/i,
    ],
  },
  {
    intention: 'logro',
    patterns: [
      /\b(?:lo logré|lo conseguí|por fin|ya puedo|lo hice)\b/i,
      /\b(?:he )?(ahorrado|completado|terminado)\b/i,
    ],
  },
  {
    intention: 'cambio_vital',
    patterns: [
      /\b(?:quiero|voy a) (dejar|cambiar|renunciar) (el )?(trabajo|todo|la carrera)\b/i,
      /\b(?:cambio|cambiar) (de vida|radical|total)\b/i,
    ],
  },
  {
    intention: 'incertidumbre',
    patterns: [
      /\b(?:no sé|no se) (qué|hacia dónde|por dónde)\b/i,
      /\b(?:duda|dudando|indeciso)\b/i,
    ],
  },
  {
    intention: 'necesidad_confianza',
    patterns: [
      /\b(?:necesito|quiero) (confianza|creer|seguridad)\b/i,
      /\b(?:¿seré capaz|podré con|lo conseguiré)\b/i,
    ],
  },
  {
    intention: 'agotamiento',
    patterns: [
      /\b(?:cansado|agotado|sin energía|muerto|rendido|sin fuerzas|quemado|burnout)\b/i,
      /\b(?:no he dormido|no descansado|insomnio)\b/i,
    ],
  },
  {
    intention: 'busqueda_sentido',
    patterns: [
      /\b(?:qué|que) (sentido|significado) (tiene|hay)\b/i,
      /\b(?:para qué|para que) (todo|esto)\b/i,
    ],
  },
  {
    intention: 'desahogo',
    patterns: [
      /\b(?:estoy harto|harto de|ya no aguanto|no soporto más)\b/i,
      /\b(?:no puedo más|saturado|hundido)\b/i,
    ],
  },
  {
    intention: 'curiosidad',
    patterns: [
      /\b(?:por qué|porque|cómo funciona|qué es|cuál es)\b/i,
      /\b(?:me gusta saber|quiero entender)\b/i,
    ],
  },
  {
    intention: 'queja',
    patterns: [
      /\b(?:siempre me pasa|otra vez lo mismo|nada cambia|todo igual)\b/i,
      /\b(?:estoy harto|harta de|ya no)\b/i,
    ],
  },
  {
    intention: 'gratitud',
    patterns: [
      /\b(?:gracias|agradecido|agradecida)\b/i,
      /\b(?:me has ayudado|me sirvió|fuiste útil)\b/i,
    ],
  },
  {
    intention: 'estancamiento',
    patterns: [
      /\b(?:estancado|estoy atascado|no avanzo|no muevo|sigo igual)\b/i,
      /\b(?:no veo progreso|nada cambia|siempre en lo mismo)\b/i,
    ],
  },
  {
    intention: 'motivacion_alta',
    patterns: [
      /\b(?:vamos|a por ello|estoy listo|listo|preparado|empecemos)\b/i,
      /\b(?:quiero mejorar|voy a por más|más retos)\b/i,
    ],
  },
  {
    intention: 'saturacion',
    patterns: [
      /\b(?:demasiado|demasiadas|mucho que hacer|saturado|agobiado)\b/i,
      /\b(?:no puedo con todo|demasiadas cosas)\b/i,
    ],
  },
  {
    intention: 'vulnerabilidad',
    patterns: [
      /\b(?:no se lo cuento a nadie|solo a ti|te lo confieso)\b/i,
      /\b(?:me da vergüenza|no suelo contar|nunca he dicho)\b/i,
    ],
  },
  {
    intention: 'duda',
    patterns: [
      /\b(?:no sé|no se) si (debería|hacer|es lo correcto|estoy bien)\b/i,
      /\b(?:estoy dudando|mi duda es|no tengo claro)\b/i,
    ],
  },
  {
    intention: 'celebracion_logro',
    patterns: [
      /\b(?:lo logré|lo conseguí|por fin|ya puedo|lo hice)\b/i,
      /\b(?:he )?(ahorrado|completado|cumplido)\b/i,
    ],
  },
];

function detectIntentions(message: string): Intention[] {
  const msg = message.toLowerCase();
  const detected: Intention[] = [];
  const seen = new Set<string>();

  for (const rule of INTENTION_RULES) {
    if (seen.has(rule.intention)) continue;
    for (const pattern of rule.patterns) {
      if (pattern.test(msg)) {
        detected.push(rule.intention);
        seen.add(rule.intention);
        break;
      }
    }
  }

  // Max 3 intentions to keep the signal clean
  return detected.slice(0, 3);
}

// ═══════════════════════════════════════════
// 3. TONE SELECTION
// Maps detected needs + intentions to tone.
// ═══════════════════════════════════════════

const NEED_TONE_MAP: Partial<Record<UserNeed, ToneStyle>> = {
  comprension_emocional: 'calmado',
  validacion_emocional: 'cercano',
  desbloqueo: 'calmado',
  celebracion: 'cercano',
  ayuda_practica: 'practico',
  reflexion: 'reflexivo',
  orientacion: 'directo',
  accion: 'directo',
  motivacion: 'motivador',
  claridad: 'analitico',
  toma_de_decisiones: 'analitico',
  continuidad: 'cercano',
};

const INTENTION_TONE_MAP: Partial<Record<Intention, ToneStyle>> = {
  frustracion: 'cercano',
  autoestima_baja: 'cercano',
  inseguridad: 'calmado',
  agotamiento: 'calmado',
  saturacion: 'calmado',
  desahogo: 'cercano',
  vulnerabilidad: 'cercano',
  estancamiento: 'reflexivo',
  motivacion_alta: 'motivador',
  celebracion_logro: 'cercano',
  busqueda_sentido: 'reflexivo',
  queja: 'cercano',
  duda: 'reflexivo',
  progreso: 'directo',
  logro: 'cercano',
};

function selectTone(
  needs: UserNeed[],
  intentions: Intention[]
): { primary: ToneStyle; secondary: ToneStyle | null } {
  // Priority: first need → first intention → default
  let primary: ToneStyle = 'cercano'; // default
  let secondary: ToneStyle | null = null;

  // Check needs first (higher priority)
  if (needs.length > 0) {
    const needTone = NEED_TONE_MAP[needs[0]];
    if (needTone) primary = needTone;

    if (needs.length > 1) {
      const secondNeedTone = NEED_TONE_MAP[needs[1]];
      if (secondNeedTone && secondNeedTone !== primary) {
        secondary = secondNeedTone;
      }
    }
  }

  // Check intentions for secondary tone
  if (intentions.length > 0) {
    const intentionTone = INTENTION_TONE_MAP[intentions[0]];
    if (intentionTone) {
      if (intentionTone !== primary) {
        secondary = intentionTone;
      }
      // If we still have no secondary, check second intention
      if (!secondary && intentions.length > 1) {
        const secondIntentionTone = INTENTION_TONE_MAP[intentions[1]];
        if (secondIntentionTone && secondIntentionTone !== primary) {
          secondary = secondIntentionTone;
        }
      }
    }
  }

  return { primary, secondary };
}

// ═══════════════════════════════════════════
// 4. RESPONSE OBJECTIVE
// What this response should achieve.
// ═══════════════════════════════════════════

const NEED_OBJECTIVE_MAP: Partial<Record<UserNeed, ResponseObjective>> = {
  comprension_emocional: 'contener',
  validacion_emocional: 'validar',
  desbloqueo: 'desbloquear',
  celebracion: 'celebrar',
  ayuda_practica: 'orientar',
  reflexion: 'reflexionar_junto',
  orientacion: 'aumentar_claridad',
  accion: 'orientar',
  motivacion: 'mantener_impulso',
  claridad: 'aumentar_claridad',
  toma_de_decisiones: 'ayudar_a_decidir',
  continuidad: 'orientar',
};

const INTENTION_OBJECTIVE_MAP: Partial<Record<Intention, ResponseObjective>> = {
  frustracion: 'normalizar',
  autoestima_baja: 'validar',
  inseguridad: 'contener',
  agotamiento: 'contener',
  saturacion: 'contener',
  desahogo: 'contener',
  vulnerabilidad: 'contener',
  estancamiento: 'desafiar_suavemente',
  motivacion_alta: 'mantener_impulso',
  celebracion_logro: 'celebrar',
  busqueda_sentido: 'reflexionar_junto',
  queja: 'validar',
  duda: 'aumentar_claridad',
  progreso: 'reforzar_compromiso',
  logro: 'celebrar',
  cambio_vital: 'ayudar_a_decidir',
  incertidumbre: 'ayudar_a_decidir',
};

function selectObjective(
  needs: UserNeed[],
  intentions: Intention[]
): { primary: ResponseObjective; secondary: ResponseObjective | null } {
  let primary: ResponseObjective = 'orientar'; // default
  let secondary: ResponseObjective | null = null;

  // Check needs
  if (needs.length > 0) {
    const needObj = NEED_OBJECTIVE_MAP[needs[0]];
    if (needObj) primary = needObj;
  }

  // Check intentions for primary or secondary
  if (intentions.length > 0) {
    const intentionObj = INTENTION_OBJECTIVE_MAP[intentions[0]];
    if (intentionObj && intentionObj !== primary) {
      secondary = intentionObj;
    }
  }

  // If primary is generic and an intention gives something specific, promote it
  if (primary === 'orientar' && secondary) {
    primary = secondary;
    secondary = null;
  }

  return { primary, secondary };
}

// ═══════════════════════════════════════════
// 5. ADAPTATION SIGNALS
// Dynamic adjustments based on context.
// ═══════════════════════════════════════════

function detectAdaptations(
  systemPrompt: string,
  userMessage: string
): AdaptationSignals {
  const msg = userMessage.toLowerCase();

  // Exhaustion: user signals burnout or fatigue
  const exhaustion =
    /\b(?:agotado|cansado|sin energía|quemado|burnout|sin fuerzas|rendido|fatigado)\b/i.test(msg) ||
    systemPrompt.includes('Agotamiento') || systemPrompt.includes('estado Sobrecargado');

  // Motivated: user signals high energy / readiness
  const motivated =
    /\b(?:vamos|listo|preparado|empecemos|a por ello|voy a por más|más retos)\b/i.test(msg) ||
    systemPrompt.includes('En progreso') || systemPrompt.includes('estado Enfocado');

  // Stagnant: user signals being stuck
  const stagnant =
    /\b(?:estancado|no avanzo|sigo igual|nada cambia|no muevo|atascado)\b/i.test(msg) ||
    systemPrompt.includes('Días muy distintos entre sí');

  // Progressing: context shows progress
  const progressing =
    systemPrompt.includes('En progreso') ||
    systemPrompt.includes('Crecimiento') ||
    systemPrompt.includes('Viene siendo más constante') ||
    systemPrompt.includes('estado Enfocado');

  // Saturated: user signals being overwhelmed
  const saturated =
    /\b(?:demasiado|saturado|agobiado|demasiadas cosas|no puedo con todo|mucho que hacer)\b/i.test(msg) ||
    systemPrompt.includes('Intensidad') || systemPrompt.includes('estado Sobrecargado');

  return { exhaustion, motivated, stagnant, progressing, saturated };
}

// ═══════════════════════════════════════════
// 6. REPETITION CHECK
// Detects patterns in recent history to avoid
// repetitive responses.
// ═══════════════════════════════════════════

const REPETITION_PATTERNS: {
  type: RepetitionType;
  pattern: RegExp;
}[] = [
  // Closing patterns the mentor uses frequently
  {
    type: 'closing',
    pattern: /\b(?:¿cómo sigues|avísame si|cuéntame|ya me dirás|hazmelo saber)\b/i,
  },
  // Question patterns
  {
    type: 'question',
    pattern: /\b(?:¿qué te parece|¿cómo te sientes|¿qué te gustaría|¿te parece bien)\b/i,
  },
  // Advice patterns
  {
    type: 'advice',
    pattern: /\b(?:empieza por|lo primero que|lo más importante|mi sugerencia|te propongo)\b/i,
  },
  // Structural patterns
  {
    type: 'structure',
    pattern: /\b(?:por un lado|por otro lado|en resumen|en conclusión|para terminar)\b/i,
  },
  // Phrase patterns
  {
    type: 'phrase',
    pattern: /\b(?:poco a poco|un paso a la vez|sin prisa|a tu ritmo|es normal)\b/i,
  },
];

function checkRepetition(
  history: Array<{ role: string; content: string }>
): RepetitionCheck {
  if (history.length < 2) {
    return { hasRisk: false, types: [] };
  }

  // Only check the last 4 assistant messages
  const recentAssistant = history
    .filter(m => m.role === 'assistant')
    .slice(-4)
    .map(m => m.content.toLowerCase());

  if (recentAssistant.length < 2) {
    return { hasRisk: false, types: [] };
  }

  const detectedTypes: RepetitionType[] = [];

  for (const { type, pattern } of REPETITION_PATTERNS) {
    // Count how many recent messages contain this pattern
    const matchCount = recentAssistant.filter(msg => pattern.test(msg)).length;
    if (matchCount >= 2) {
      detectedTypes.push(type);
    }
  }

  // Also check if the last two assistant messages start similarly
  if (recentAssistant.length >= 2) {
    const last = recentAssistant[recentAssistant.length - 1];
    const prev = recentAssistant[recentAssistant.length - 2];
    // Check first 50 chars similarity
    const lastStart = last.slice(0, 50).trim();
    const prevStart = prev.slice(0, 50).trim();
    if (
      lastStart.length > 10 &&
      prevStart.length > 10 &&
      lastStart === prevStart
    ) {
      if (!detectedTypes.includes('structure')) {
        detectedTypes.push('structure');
      }
    }
  }

  return {
    hasRisk: detectedTypes.length > 0,
    types: detectedTypes,
  };
}

// ═══════════════════════════════════════════
// 7. INSTRUCTION SNIPPET BUILDER
// Converts the reasoning output into a compact,
// natural Spanish instruction for the system prompt.
// ═══════════════════════════════════════════

const TONE_INSTRUCTIONS: Record<ToneStyle, string> = {
  cercano: 'Acércate. Menos distancia, más presencia humana.',
  directo: 'Ve al grano. Sin rodeos, sin preámbulos innecesarios.',
  calmado: 'Baja el ritmo. Menos palabras, más calma en cada frase.',
  firme: 'Sé firme cuando haga falta. Sin ser cortante.',
  reflexivo: 'Profundiza. Tómate el espacio para pensar en voz alta.',
  practico: 'Concreto. Pasos, no teorías. Acción, no filosofía.',
  motivador: 'Da energía. Reconoce lo que hay y apunta hacia lo que sigue.',
  analitico: 'Pensamiento claro. Desglosa si ayuda, pero sin perder naturalidad.',
};

const OBJECTIVE_INSTRUCTIONS: Record<ResponseObjective, string> = {
  desbloquear: 'Tu objetivo: ayudar a salir del bloqueo. Propón un camino concreto.',
  tranquilizar: 'Tu objetivo: transmitir calma. Sin minimizar, sin dramatizar.',
  celebrar: 'Tu objetivo: reconocer lo logrado sin exagerar. Breve y real.',
  mantener_impulso: 'Tu objetivo: sostener la inercia. Refuerza lo que funciona.',
  ayudar_a_decidir: 'Tu objetivo: ayudar a decidir. No decidas por esta persona.',
  aumentar_claridad: 'Tu objetivo: aportar claridad. Ordena lo confuso.',
  reforzar_compromiso: 'Tu objetivo: consolidar el compromiso. Reconoce el esfuerzo.',
  profundizar: 'Tu objetivo: ir más profundo. Pregunta si abre camino, no por llenar.',
  validar: 'Tu objetivo: validar lo que siente. Sin correcciones, sin soluciones aún.',
  normalizar: 'Tu objetivo: normalizar. Lo que siente es comprensible.',
  desafiar_suavemente: 'Tu objetivo: desafiar suavemente. Haz notar lo que no ve.',
  contener: 'Tu objetivo: contener. Espacio seguro. Sin prisa por resolver.',
  orientar: 'Tu objetivo: orientar. Propone dirección sin imponerla.',
  reflexionar_junto: 'Tu objetivo: reflexionar junto a esta persona. No desde arriba.',
};

function buildInstructionSnippet(
  result: ReasoningInstruction,
  isFree: boolean
): string {
  const lines: string[] = [];

  // Section 1: Objective
  const objInstr = OBJECTIVE_INSTRUCTIONS[result.objective];
  if (objInstr) lines.push(objInstr);

  // Secondary objective (PREMIUM only)
  if (!isFree && result.secondaryObjective) {
    const secObjInstr = OBJECTIVE_INSTRUCTIONS[result.secondaryObjective];
    if (secObjInstr && secObjInstr !== objInstr) {
      lines.push(secObjInstr);
    }
  }

  // Section 2: Tone
  const toneInstr = TONE_INSTRUCTIONS[result.tone];
  if (toneInstr) lines.push(toneInstr);

  // Secondary tone (PREMIUM only)
  if (!isFree && result.secondaryTone) {
    const secToneInstr = TONE_INSTRUCTIONS[result.secondaryTone];
    if (secToneInstr) {
      lines.push(`También: ${secToneInstr.toLowerCase().replace('.', '')}.`);
    }
  }

  // Section 3: Adaptations (PREMIUM only for most, FREE gets exhaustion only)
  const a = result.adaptations;
  if (a.exhaustion) {
    lines.push('Menos consejos. Más comprensión. No añadas presión.');
  }
  if (!isFree) {
    if (a.motivated) {
      lines.push('Más acción. Menos teoría. Aprovecha la energía.');
    }
    if (a.stagnant) {
      lines.push('Más empatía. Menos presión. Reconoce la dificultad sin forzar solución.');
    }
    if (a.progressing) {
      lines.push('Más desafío. Más profundidad. No te conformes con lo superficial.');
    }
    if (a.saturated) {
      lines.push('Respuesta más corta. Una idea, no tres. No satures más.');
    }
  }

  // Section 4: Variety
  if (result.favorVariety) {
    lines.push('Evita repetir estructuras, frases o cierres de respuestas anteriores.');
  }

  // FREE: limit instruction length
  if (isFree && lines.length > 3) {
    // Keep only the most important instructions
    return lines.slice(0, 2).join('\n');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════
// 8. MAIN ENTRY POINT
// The only exported function. Called once
// per message in route.ts.
// ═══════════════════════════════════════════

/**
 * Reason about how the mentor should respond to this message.
 *
 * This is the Reasoning Engine's sole public function.
 * It takes the user message, conversation history, and the
 * assembled system prompt, then returns a reasoning instruction
 * that tells the model HOW to use the available context.
 *
 * Integration point: route.ts, AFTER the Decision Engine has
 * optimized the system prompt, BEFORE assembling groqMessages.
 *
 * @param input - The reasoning input (message, history, plan, system prompt)
 * @returns Reasoning instruction to inject into the system prompt
 */
export function reason(input: ReasoningInput): ReasoningInstruction {
  const { userMessage, history, plan, systemPrompt } = input;
  const isFree = plan !== 'PREMIUM';

  // Step 1: Detect user needs
  const needs = detectNeeds(userMessage);

  // Step 2: Detect intentions (multi-intention analysis)
  const intentions = detectIntentions(userMessage);

  // Step 3: Select tone
  const { primary: tone, secondary: secondaryTone } = selectTone(needs, intentions);

  // Step 4: Select response objective
  const { primary: objective, secondary: secondaryObjective } = selectObjective(needs, intentions);

  // Step 5: Detect adaptation signals
  const adaptations = detectAdaptations(systemPrompt, userMessage);

  // Step 6: Check for repetition risk
  const repetition = checkRepetition(history);

  // Build the instruction snippet
  const instructionSnippet = buildInstructionSnippet(
    {
      needs,
      intentions,
      tone,
      secondaryTone,
      objective,
      secondaryObjective,
      adaptations,
      favorVariety: repetition.hasRisk,
      instructionSnippet: '', // filled below
      plan: isFree ? 'FREE' : 'PREMIUM',
    },
    isFree,
  );

  return {
    needs,
    intentions,
    tone,
    secondaryTone,
    objective,
    secondaryObjective,
    adaptations,
    favorVariety: repetition.hasRisk,
    instructionSnippet,
    plan: isFree ? 'FREE' : 'PREMIUM',
  };
}