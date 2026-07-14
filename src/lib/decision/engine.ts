// ═══════════════════════════════════════════
// DECISION ENGINE — Core
//
// The brain that decides which context the
// mentor should use and which it should ignore.
//
// Architecture:
//   - Zero DB queries
//   - Zero API calls
//   - Zero new context generation
//   - Pure string analysis + deterministic filtering
//   - <1ms execution time
//
// Integrates at the assembly point in route.ts,
// AFTER all context is built but BEFORE it's
// sent to Groq.
// ═══════════════════════════════════════════

import type {
  ContextBlock,
  ContextBlockId,
  DecisionBudget,
  DecisionResult,
  DomainSignal,
  RelevanceDomain,
} from './types';

// ═══════════════════════════════════════════
// 1. BUDGET CONFIGURATION
// ═══════════════════════════════════════════

const BUDGETS: Record<string, DecisionBudget> = {
  FREE: {
    maxContextChars: 800,
    maxActiveBlocks: 3,
    blockMax: {
      identity: 200,
      emotional_state: 150,
      lived_experience: 200,
      behavioral: 200,
      conversational: 100,
      understanding: 80,
    },
  },
  PREMIUM: {
    maxContextChars: 2200,
    maxActiveBlocks: 8,
    blockMax: {
      identity: 350,
      emotional_state: 250,
      life_stage: 200,
      patterns: 250,
      silent_memories: 150,
      lived_experience: 400,
      behavioral: 350,
      conversational: 200,
      understanding: 300,
    },
  },
};

// ═══════════════════════════════════════════
// 2. DOMAIN CLASSIFICATION
// Determines what the user's message is about.
// Pure keyword matching — no AI, no latency.
// ═══════════════════════════════════════════

interface DomainRule {
  domain: RelevanceDomain;
  /** Keywords that signal this domain. More matches = higher strength. */
  keywords: RegExp[];
  /** Boost when ANY keyword matches (added once, not per match) */
  boost: number;
}

const DOMAIN_RULES: DomainRule[] = [
  {
    domain: 'crisis',
    keywords: [
      /\bno (puedo|más|aguanto|soporto|resisto)\b/i,
      /\b(?:me siento|estoy) (completamente|totalmente|absolutamente) (saturado|agotado|perdido|rostizado| hundido|vencido|superado|desbordado)\b/i,
      /\bno (sé|se) (qué hacer|por dónde empezar|cómo seguir|qué más hacer)\b/i,
      /\b(?:quiero|voy a) (dejarlo|abandonar|cerrar|terminar con todo)\b/i,
      /\bno vale (la pena|nada|la pena intentar)\b/i,
      /\bestoy al (límite|borde|final)\b/i,
    ],
    boost: 30,
  },
  {
    domain: 'emotional',
    keywords: [
      /\b(?:me siento|estoy|está) (triste|contento|feliz|frustrado|ansioso|nervioso|preocupado|contento|agradecido|enfadado|molesto|ilusionado|decepcionado|esperanzado|perdido|confundido|solo|sola|acompañado)\b/i,
      /\b(?:mi |el )?(pareja|relación|ex|novio|novia|marido|mujer|esposo|esposa)\b/i,
      /\b(?:he )?(discutido|peleado|reñido|llorado)\b/i,
      /\b(?:tengo|miedo|siento) (miedo|culpa|vergüenza|celos|inseguridad)\b/i,
      /\b(?:estoy pasando por|atravesando) (un|una) (mal|difícil) (momento|rato|etapa|época)\b/i,
      /\b(?:me )?(duele|dolió|hace daño|cuesta)\b/i,
    ],
    boost: 20,
  },
  {
    domain: 'relational',
    keywords: [
      /\b(?:mi |los |las )?(hij[oa]|hijos|familia|madre|padre|herman[oa]|amig[oa]|amigos|jefe|compañer[oa]s|compañeros)\b/i,
      /\b(?:mi |nuestra )?(pareja|relación|matrimonio|boda|divorcio|separación)\b/i,
      /\b(?:convi|viv[oi]|habl[oe]) con (mi |su |la |el )?(pareja|familia|herman[oa]|madre|padre|amig[oa])\b/i,
      /\b(?:mi |nuestro) (hijo|hija|bebé|niño|niña)\b/i,
    ],
    boost: 20,
  },
  {
    domain: 'progress',
    keywords: [
      /\b(?:he )?(logrado|conseguido|avanzado|mejorado|completado|terminado|empezado|iniciado)\b/i,
      /\b(?:mi |la )?(racha|constancia|progreso|avance|mejora|éxito|meta|objetivo|goal)\b/i,
      /\b(?:estoy |venir|sigo) (constante|consistente|mejorando|avanzando|progresando)\b/i,
      /\b(?:pasos|días|semanas) (seguidos|consecutivos|de|racha)\b/i,
      /\b(?:quiero|necesito) (mejorar|avanzar|progresar|crecer|evolucionar)\b/i,
      /\b(?:hábito|rutina|disciplina|hábitos|rutina)\b/i,
      /\b(?:cómo|como) (sigo|sigo con|mantengo|sostengo)\b/i,
    ],
    boost: 15,
  },
  {
    domain: 'energy',
    keywords: [
      /\b(?:estoy|me siento) (cansado|agotado|sin energía|muerto|rendido|sin fuerzas|fatigado|letárgico|somnoliento)\b/i,
      /\b(?:no )?(he )?(dormido|descansado|podido dormir)\b/i,
      /\b(?:el )?(sueño|descanso|cama|noche|dormir|insomnio)\b/i,
      /\bpasos\b/i,
      /\bcaminado\b/i,
      /\b(?:mucho|bastante) (cansancio|agotamiento|fatiga)\b/i,
    ],
    boost: 20,
  },
  {
    domain: 'financial',
    keywords: [
      /\b(?:dinero|gasto|gastos|ahorro|ahorros|ingreso|ingresos|sueldo|salario|precio|compra|compras|deuda|deudas|préstamo|inversión|inversiones|finanzas|presupuesto)\b/i,
      /\b(?:pagué|pagar|cuesta|cuesta|caro|barato|costoso|economico)\b/i,
      /\b(?:mi |el )?(banco|cuenta|tarjeta|factura|recibo|alquiler|hipoteca|seguro)\b/i,
    ],
    boost: 20,
  },
  {
    domain: 'reflective',
    keywords: [
      /\b(?:qué|que) (sentido|significado|importancia|valor) (tiene|tiene|hay)\b/i,
      /\b(?:estoy |me estoy) (preguntando|cuestionando|reflexionando|pensando|planteando)\b/i,
      /\b(?:no sé|no se) (si|sí|qué|que) (quiero|debo|hacer|busco)\b/i,
      /\b(?:mi )?(propósito|sentido|dirección|camino|vida|futuro|pasado)\b/i,
      /\b(?:para qué|para que) (todo|esto|lo|hago|intentarlo)\b/i,
    ],
    boost: 15,
  },
  {
    domain: 'practical',
    keywords: [
      /\b(?:dame|dame|dar|propon|sugiere|indica) (un )?(plan|método|sistema|rutina|estructura|paso|guía|estrategia)\b/i,
      /\b(?:cómo|como) (empiezo|hago|puedo|debo|funciona|mejoro|avanzo|organizo)\b/i,
      /\b(?:qué|que) (puedo|hago|debo) (hacer|intentar|probar)\b/i,
      /\b(?:necesito|quiero) (un )?(plan|método|sistema|estrategia|pautas)\b/i,
      /\b(?:rutina|horario|agenda|planificación|organizar|estructurar)\b/i,
    ],
    boost: 15,
  },
];

/**
 * Classify the user message into relevance domains.
 * Returns domain signals sorted by strength (descending).
 * Pure keyword matching — zero latency.
 */
function classifyDomain(userMessage: string): DomainSignal[] {
  const msg = userMessage.toLowerCase();
  const signals: DomainSignal[] = [];

  for (const rule of DOMAIN_RULES) {
    let matchCount = 0;
    for (const kw of rule.keywords) {
      if (kw.test(msg)) matchCount++;
    }

    if (matchCount > 0) {
      // Strength = boost + (matches * 15), capped at 100
      const strength = Math.min(rule.boost + matchCount * 15, 100);
      signals.push({ domain: rule.domain, strength });
    }
  }

  // Sort by strength descending
  signals.sort((a, b) => b.strength - a.strength);
  return signals;
}

// ═══════════════════════════════════════════
// 3. RELEVANCE SCORING
// Maps domains to context block relevance.
// Each domain makes certain blocks more/less relevant.
// ═══════════════════════════════════════════

/**
 * Relevance matrix: domain → block → weight.
 * Positive = block is relevant for this domain.
 * Negative = block is less relevant (can be filtered).
 * 0 = neutral (kept if budget allows).
 */
const RELEVANCE_MATRIX: Record<RelevanceDomain, Partial<Record<ContextBlockId, number>>> = {
  crisis: {
    emotional_state: 90,
    understanding: 85,
    identity: 40,
    life_stage: 50,
    lived_experience: -30,
    behavioral: -20,
    patterns: -40,
    silent_memories: -30,
    conversational: -40,
    financial: -50,
  },
  emotional: {
    emotional_state: 95,
    understanding: 90,
    life_stage: 70,
    silent_memories: 50,
    identity: 60,
    conversational: 40,
    lived_experience: 30,
    behavioral: -10,
    patterns: -30,
    financial: -40,
  },
  relational: {
    understanding: 80,
    emotional_state: 70,
    identity: 60,
    silent_memories: 40,
    conversational: 30,
    life_stage: 20,
    lived_experience: 10,
    behavioral: -20,
    patterns: -40,
    financial: -50,
  },
  progress: {
    behavioral: 95,
    lived_experience: 80,
    emotional_state: 60,
    patterns: 70,
    identity: 50,
    understanding: 55,
    life_stage: 40,
    conversational: 30,
    silent_memories: 20,
    financial: -20,
  },
  energy: {
    emotional_state: 90,
    lived_experience: 80,
    life_stage: 60,
    understanding: 60,
    behavioral: 50,
    patterns: 50,
    identity: 30,
    conversational: -10,
    silent_memories: -10,
    financial: -30,
  },
  financial: {
    patterns: 95,
    lived_experience: 80,
    behavioral: 60,
    emotional_state: 40,
    identity: 30,
    understanding: 30,
    conversational: 20,
    life_stage: 10,
    silent_memories: -20,
  },
  reflective: {
    understanding: 90,
    life_stage: 80,
    identity: 70,
    silent_memories: 60,
    emotional_state: 60,
    conversational: 50,
    lived_experience: 40,
    patterns: 30,
    behavioral: 20,
    financial: -20,
  },
  practical: {
    behavioral: 90,
    lived_experience: 80,
    identity: 50,
    emotional_state: 30,
    understanding: 60,
    conversational: 30,
    patterns: 20,
    life_stage: 10,
    silent_memories: -10,
    financial: -20,
  },
};

/**
 * Score a context block based on domain signals.
 * Weighted average across all detected domains.
 */
function scoreBlock(
  blockId: ContextBlockId,
  domains: DomainSignal[],
  totalDomainStrength: number
): number {
  if (totalDomainStrength === 0) return 50; // neutral default

  let weightedScore = 0;
  let hasOpinion = false;

  for (const signal of domains) {
    const matrix = RELEVANCE_MATRIX[signal.domain];
    if (!matrix) continue;

    const weight = matrix[blockId];
    if (weight === undefined) continue;

    // Weight the matrix score by the domain's strength
    weightedScore += weight * (signal.strength / 100);
    hasOpinion = true;
  }

  if (!hasOpinion) return 50; // no domain has an opinion about this block

  // Normalize: weighted average
  const avgStrength = domains.reduce((s, d) => s + d.strength, 0) / domains.length;
  return Math.round(weightedScore / (avgStrength / 100));
}

// ═══════════════════════════════════════════
// 4. CONTEXT BLOCK PARSING
// Splits the assembled system prompt into
// identifiable blocks for scoring/filtering.
// ═══════════════════════════════════════════

/** Markers used in the prompt to delimit the context section */
const CONTEXT_START_MARKER = '── Lo que sabes de esta persona ──';
const CONTEXT_END_MARKER = '── Fin ──';

/** Keywords that signal the start of each layer/block within the context */
const BLOCK_INDICATORS: { id: ContextBlockId; patterns: RegExp[] }[] = [
  {
    id: 'identity',
    patterns: [
      /^Se llama\s+/m,
      /^Comenzó VitaZen/m,
      /^Su foco principal es/m,
      /^Al comenzar describía/m,
      /^Su nivel de estrés inicial/m,
      /^Su capacidad de enfoque inicial/m,
      /^Los hábitos que quería construir/m,
    ],
  },
  {
    id: 'emotional_state',
    patterns: [
      /^Actualmente se encuentra en un estado\s+/m,
      /^Actualmente se encuentra en un estado /m,
      /^Un periodo con calma/m,
      /^Calma\./m,
      /^Crecimiento\./m,
      /^Intensidad\./m,
      /^Agotamiento\./m,
      /^Silencio\./m,
      /^Estabilidad\./m,
      /^Días muy distintos/m,
    ],
  },
  {
    id: 'life_stage',
    patterns: [
      /^Actualmente atraviesa una etapa de\s+/m,
    ],
  },
  {
    id: 'patterns',
    patterns: [
      /^VitaZen ha detectado una conexión entre\s+/m,
    ],
  },
  {
    id: 'silent_memories',
    patterns: [
      /^Hacía unos días\./m,
      /^Vuelves después de un tiempo\./m,
      /^Aquí estás de nuevo\./m,
      /^Hacía mucho\./m,
      /^Este ritmo ya te había acompañado antes\./m,
      /^Ya habías estado así\./m,
      /^La energía cambió estas semanas\./m,
      /^Menos energía últimamente\./m,
      /^Menos peso últimamente\./m,
      /^Un mes así\./m,
      /^Un año así\./m,
      /^Ya tres meses\./m,
      /^Medio año\./m,
      /^Un año\.\s*$/m,
    ],
  },
  {
    id: 'lived_experience',
    patterns: [
      /^Último check-in\s+/m,
      /^Su intención del día/m,
      /^En los últimos días ha descansado/m,
      /^Su descanso ha sido irregular/m,
      /^Calidad del descanso/m,
      /^Ha anotado sobre su bienestar/m,
      /^Reflexiones recientes en su diario/m,
      /^En su última reflexión escribió/m,
      /^Últimamente la mayoría de sus gastos/m,
      /^Ha registrado varias decisiones/m,
      /^Sus gastos recientes reflejan/m,
      /^Se aprecia una etapa de mayor prudencia/m,
      /^Ha explicado que un gasto/m,
      /^Viene realizando cierres personales/m,
      /^Su última reflexión mensual/m,
      /^Revisó su cierre mensual/m,
      /^Suele reflexionar sobre su evolución/m,
      /^Hace poco revisó cómo le fue/m,
      /^Hace tiempo que no realiza un cierre/m,
    ],
  },
  {
    id: 'behavioral',
    patterns: [
      /^Hábitos activos/m,
      /^Última meditación/m,
      /^Esta semana/m,
      /^Viene siendo más constante/m,
      /^Últimamente menos activo/m,
      /^Está empezando a usar la app/m,
      /^Progreso de imperios/m,
    ],
  },
  {
    id: 'conversational',
    patterns: [
      /^Temas recientes de conversación/m,
    ],
  },
];

/**
 * Parse the assembled system prompt into identifiable blocks.
 *
 * Strategy:
 * 1. The base prompt (everything before CONTEXT_START_MARKER) is always protected.
 * 2. The context section (between markers) is split into blocks.
 * 3. Everything after CONTEXT_END_MARKER (rules, understanding) is separate.
 */
function parseBlocks(systemPrompt: string): {
  basePrompt: string;
  contextBlocks: ContextBlock[];
  rulesBlock: string;
  understandingBlock: string;
} {
  const startIdx = systemPrompt.indexOf(CONTEXT_START_MARKER);
  const endIdx = systemPrompt.indexOf(CONTEXT_END_MARKER);

  // Case 1: No context markers at all — return as-is
  if (startIdx === -1 || endIdx === -1) {
    // Check if there's an understanding block appended after the base prompt
    const understandingIdx = systemPrompt.lastIndexOf('\n\n');

    return {
      basePrompt: systemPrompt,
      contextBlocks: [],
      rulesBlock: '',
      understandingBlock: '',
    };
  }

  // Extract sections
  const basePrompt = systemPrompt.substring(0, startIdx).trim();
  const contextSection = systemPrompt.substring(
    startIdx + CONTEXT_START_MARKER.length,
    endIdx
  ).trim();
  const afterContext = systemPrompt.substring(endIdx + CONTEXT_END_MARKER.length).trim();

  // Split context section into lines and assign to blocks
  const lines = contextSection.split('\n');
  const blockTexts: Partial<Record<ContextBlockId, string[]>> = {};
  const unassignedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let assigned = false;
    for (const indicator of BLOCK_INDICATORS) {
      if (indicator.patterns.some(p => p.test(trimmed))) {
        if (!blockTexts[indicator.id]) blockTexts[indicator.id] = [];
        blockTexts[indicator.id]!.push(trimmed);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // Try to attach to the most recent block
      unassignedLines.push(trimmed);
    }
  }

  // Attach unassigned lines to the most recent preceding block
  if (unassignedLines.length > 0) {
    // Find the last block that was assigned
    const blockOrder: ContextBlockId[] = [
      'identity', 'emotional_state', 'life_stage', 'patterns',
      'silent_memories', 'lived_experience', 'behavioral', 'conversational',
    ];

    let lastBlock: ContextBlockId | null = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      for (const indicator of BLOCK_INDICATORS) {
        if (indicator.patterns.some(p => p.test(trimmed))) {
          lastBlock = indicator.id;
          break;
        }
      }
      if (lastBlock) break;
    }

    if (lastBlock && blockTexts[lastBlock]) {
      blockTexts[lastBlock]!.push(...unassignedLines);
    }
  }

  // Build context blocks
  const contextBlocks: ContextBlock[] = Object.entries(blockTexts).map(([id, texts]) => ({
    id: id as ContextBlockId,
    text: texts!.join('\n'),
    charCount: texts!.join('\n').length,
    protected: false,
    relevance: 0, // scored later
    budget: 0,   // set later
  }));

  // Split afterContext into rules and understanding
  // Rules contain "CÓMO USAR ESTE CONTEXTO" and "CONTROL DE EVIDENCIA"
  let rulesBlock = '';
  let understandingBlock = '';

  // The understanding block was injected after the context block
  // in route.ts: systemPrompt = systemPrompt + '\n\n' + adaptationSnippet
  // So it's the last part of afterContext
  const rulesEndMarker = 'CONTROL DE EVIDENCIA:';
  const rulesEndIdx = afterContext.indexOf(rulesEndMarker);

  if (rulesEndIdx !== -1) {
    // There's a "CONTROL DE EVIDENCIA" section (PREMIUM)
    const afterEvidence = afterContext.substring(rulesEndIdx + rulesEndMarker.length);
    // The understanding block comes after the rules — it's the last \n\n separated block
    // that doesn't contain "CÓMO USAR" or "CONTROL DE EVIDENCIA"
    const rulesPart = afterContext.substring(0, rulesEndIdx + rulesEndMarker.length);
    rulesBlock = rulesPart;

    // Understanding is everything after the evidence rules that looks like adaptation
    const evidenceEnd = afterEvidence.indexOf('\n\n');
    if (evidenceEnd !== -1) {
      const afterEvidenceRules = afterEvidence.substring(evidenceEnd + 2).trim();
      if (afterEvidenceRules.length > 0 && !afterEvidenceRules.includes('CÓMO USAR')) {
        understandingBlock = afterEvidenceRules;
      }
    }
  } else {
    // No CONTROL DE EVIDENCIA — could be FREE or PREMIUM without that section
    // Check if there's content after "CÓMO USAR ESTE CONTEXTO" rules
    const comoUsarEnd = afterContext.indexOf('CÓMO USAR ESTE CONTEXTO:');
    if (comoUsarEnd !== -1) {
      // Find the end of the rules section (next double newline after rules)
      const rulesSection = afterContext.substring(comoUsarEnd);
      // Rules end at the next section or at the understanding block
      const potentialUnderstanding = afterContext.substring(comoUsarEnd).split('\n\n').pop()?.trim() || '';
      // The understanding block is the last paragraph if it doesn't contain rule keywords
      if (
        potentialUnderstanding.length > 0 &&
        !potentialUnderstanding.includes('CÓMO USAR') &&
        !potentialUnderstanding.includes('integrar de forma invisible') &&
        !potentialUnderstanding.includes('máximo UNA referencia')
      ) {
        rulesBlock = afterContext.substring(0, afterContext.lastIndexOf(potentialUnderstanding)).trim();
        understandingBlock = potentialUnderstanding;
      } else {
        rulesBlock = afterContext;
      }
    } else {
      rulesBlock = afterContext;
    }
  }

  return { basePrompt, contextBlocks, rulesBlock, understandingBlock };
}

// ═══════════════════════════════════════════
// 5. CONFLICT RESOLUTION
// When two blocks propose incompatible
// approaches, the higher-relevance block wins.
// ═══════════════════════════════════════════

/**
 * Known conflict pairs. When both blocks are active and their
 * signals conflict, the block with higher relevance wins and
 * the other gets its relevance reduced.
 */
interface ConflictRule {
  blockA: ContextBlockId;
  blockB: ContextBlockId;
  /** When A's relevance is > threshold AND B's relevance is < threshold, B is suppressed */
  aDominanceThreshold: number;
  /** How much to reduce B's relevance when suppressed */
  suppressionPenalty: number;
  /** Condition: which domain must be dominant for this conflict to apply */
  triggerDomain: RelevanceDomain;
}

const CONFLICT_RULES: ConflictRule[] = [
  {
    // When user is in crisis, behavioral/push context is counterproductive
    blockA: 'emotional_state',
    blockB: 'behavioral',
    aDominanceThreshold: 70,
    suppressionPenalty: 60,
    triggerDomain: 'crisis',
  },
  {
    // When user talks about emotions, detailed financial context is noise
    blockA: 'understanding',
    blockB: 'patterns',
    aDominanceThreshold: 70,
    suppressionPenalty: 50,
    triggerDomain: 'emotional',
  },
  {
    // When user talks about practical steps, silent memories add no value
    blockA: 'behavioral',
    blockB: 'silent_memories',
    aDominanceThreshold: 70,
    suppressionPenalty: 50,
    triggerDomain: 'practical',
  },
];

function resolveConflicts(
  blocks: ContextBlock[],
  domains: DomainSignal[]
): ContextBlock[] {
  const dominantDomain = domains.length > 0 ? domains[0].domain : null;

  for (const rule of CONFLICT_RULES) {
    // Only apply if the dominant domain matches
    if (!dominantDomain || dominantDomain !== rule.triggerDomain) continue;

    const blockA = blocks.find(b => b.id === rule.blockA);
    const blockB = blocks.find(b => b.id === rule.blockB);

    if (!blockA || !blockB) continue;

    if (blockA.relevance >= rule.aDominanceThreshold) {
      blockB.relevance = Math.max(0, blockB.relevance - rule.suppressionPenalty);
    }
  }

  return blocks;
}

// ═══════════════════════════════════════════
// 6. BLOCK TRUNCATION
// When a block exceeds its budget,
// truncate intelligently (keep first lines).
// ═══════════════════════════════════════════

function truncateBlock(block: ContextBlock, maxChars: number): ContextBlock {
  if (block.charCount <= maxChars) return block;

  const lines = block.text.split('\n');
  let totalChars = 0;
  const keptLines: string[] = [];

  for (const line of lines) {
    if (totalChars + line.length > maxChars) break;
    keptLines.push(line);
    totalChars += line.length + 1; // +1 for newline
  }

  return {
    ...block,
    text: keptLines.join('\n'),
    charCount: totalChars,
  };
}

// ═══════════════════════════════════════════
// 7. MAIN ENTRY POINT
// The only exported function. Called once
// per message in route.ts.
// ═══════════════════════════════════════════

/**
 * Optimize the assembled system prompt for the current user message.
 *
 * This is the Decision Engine's sole public function.
 * It takes the already-assembled system prompt and the user's message,
 * then returns an optimized version that uses only the most relevant
 * context blocks.
 *
 * Integration point: route.ts, AFTER buildContextualSystemPrompt
 * and getUnderstandingContext, BEFORE assembling groqMessages.
 *
 * @param systemPrompt - The fully assembled system prompt
 * @param userMessage - The current user message
 * @param plan - User's plan ('FREE' or 'PREMIUM')
 * @returns Optimized system prompt + decision metadata
 */
export function optimizeContext(
  systemPrompt: string,
  userMessage: string,
  plan: string
): DecisionResult {
  const budget = BUDGETS[plan] || BUDGETS.FREE;

  // Step 1: Parse the prompt into blocks
  const { basePrompt, contextBlocks, rulesBlock, understandingBlock } = parseBlocks(systemPrompt);

  // If no context blocks exist, return as-is
  if (contextBlocks.length === 0) {
    return {
      systemPrompt,
      activeBlocks: ['base_prompt'],
      filteredBlocks: [],
      truncatedBlocks: [],
      charsSaved: 0,
    };
  }

  // Step 2: Classify user message into domains
  const domains = classifyDomain(userMessage);
  const totalDomainStrength = domains.reduce((s, d) => s + d.strength, 0);

  // Step 3: Score each block
  const scoredBlocks = contextBlocks.map(block => ({
    ...block,
    relevance: scoreBlock(block.id, domains, totalDomainStrength),
    budget: budget.blockMax[block.id] || budget.maxContextChars,
  }));

  // Step 4: Resolve conflicts between blocks
  const resolvedBlocks = resolveConflicts(scoredBlocks, domains);

  // Step 5: Filter — remove blocks with negative relevance, respect maxActiveBlocks
  // Sort by relevance descending
  const sorted = [...resolvedBlocks].sort((a, b) => b.relevance - a.relevance);

  // Separate positive-relevance blocks from negative
  const positive = sorted.filter(b => b.relevance > 0);
  const negative = sorted.filter(b => b.relevance <= 0);

  // Keep top N blocks by relevance
  const kept = positive.slice(0, budget.maxActiveBlocks);

  // Track filtered blocks
  const filteredIds: ContextBlockId[] = [
    ...negative.map(b => b.id),
    ...positive.slice(budget.maxActiveBlocks).map(b => b.id),
  ];

  // Step 6: Truncate kept blocks to their budget
  const truncatedIds: ContextBlockId[] = [];
  const finalBlocks = kept.map(block => {
    const truncated = truncateBlock(block, block.budget);
    if (truncated.charCount < block.charCount) {
      truncatedIds.push(block.id);
    }
    return truncated;
  });

  // Step 7: Apply global context budget
  let totalContextChars = finalBlocks.reduce((s, b) => s + b.charCount, 0);
  if (totalContextChars > budget.maxContextChars) {
    // Remove lowest-relevance blocks until within budget
    finalBlocks.sort((a, b) => b.relevance - a.relevance);
    while (totalContextChars > budget.maxContextChars && finalBlocks.length > 1) {
      const removed = finalBlocks.pop()!;
      filteredIds.push(removed.id);
      totalContextChars -= removed.charCount;
    }
  }

  // Step 8: Handle understanding block
  let finalUnderstanding = understandingBlock;
  const understandingBudget = budget.blockMax.understanding || 150;
  if (understandingBlock.length > understandingBudget) {
    // Truncate understanding to first N lines that fit
    const lines = understandingBlock.split('\n');
    let chars = 0;
    const keptLines: string[] = [];
    for (const line of lines) {
      if (chars + line.length > understandingBudget) break;
      keptLines.push(line);
      chars += line.length + 1;
    }
    finalUnderstanding = keptLines.join('\n');
    if (finalUnderstanding.length < understandingBlock.length) {
      truncatedIds.push('understanding');
    }
  }

  // Step 9: Reassemble the system prompt
  const activeIds: ContextBlockId[] = [...finalBlocks.map(b => b.id)];
  if (finalUnderstanding) activeIds.push('understanding');
  activeIds.push('base_prompt');

  const contextText = finalBlocks.map(b => b.text).join('\n');

  let finalPrompt: string;
  if (contextText.trim().length > 0) {
    finalPrompt = `${basePrompt}\n\n── Lo que sabes de esta persona ──\n${contextText.trim()}\n── Fin ──`;
    if (rulesBlock) {
      finalPrompt += `\n\n${rulesBlock}`;
    }
    if (finalUnderstanding.trim()) {
      finalPrompt += `\n\n${finalUnderstanding.trim()}`;
    }
  } else {
    // No context survived filtering — use base prompt only
    finalPrompt = basePrompt;
    if (rulesBlock) {
      // Keep a minimal version of rules
      finalPrompt += `\n\n${rulesBlock}`;
    }
  }

  // Calculate chars saved
  const originalContextChars = contextBlocks.reduce((s, b) => s + b.charCount, 0) + understandingBlock.length;
  const finalContextChars = finalBlocks.reduce((s, b) => s + b.charCount, 0) + finalUnderstanding.length;
  const charsSaved = Math.max(0, originalContextChars - finalContextChars);

  return {
    systemPrompt: finalPrompt,
    activeBlocks: activeIds,
    filteredBlocks: filteredIds,
    truncatedBlocks: truncatedIds,
    charsSaved,
  };
}