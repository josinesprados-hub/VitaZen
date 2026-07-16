// ═══════════════════════════════════════════
// EMOTIONAL UNDERSTANDING ENGINE — Core
// Learns HOW to help each user better.
//
// Architecture:
//   READ path  (synchronous, on every message):
//     getUnderstandingContext() → confirmed insights → adaptation snippet
//     Injected into system prompt as a separate invisible block.
//
//   WRITE path (async, fire-and-forget, post-response):
//     extractAndPersist() → analyze message → create/update hypotheses
//     Runs after assistant response is saved. Non-blocking.
//
// Design principles:
//   - Zero extra Groq API calls. All extraction is rule-based.
//   - Hypothesis → Knowledge lifecycle with confidence scoring.
//   - Natural language adaptation (never "He aprendido que...").
//   - Complements, never duplicates, existing systems.
// ═══════════════════════════════════════════

import { db } from '../db';
import {
  type InsightCategory,
  type UnderstandingContext,
  type ConfirmedInsight,
  type ExtractionInput,
  type DetectedSignal,
  CONFIRMATION_THRESHOLD,
  MAX_INSIGHTS_PREMIUM,
  MAX_INSIGHTS_FREE,
  MAX_HYPOTHESES_PER_USER,
  MAX_TOTAL_INSIGHTS_PER_USER,
  MIN_MESSAGES_FOR_EXTRACTION,
  EXTRACTION_COOLDOWN_MS,
  FREE_CATEGORIES,
} from './types';

// ═══════════════════════════════════════════
// 1. EXTRACTION PATTERNS
// Rule-based detection from user message content.
// Each pattern maps signal phrases to insights + categories.
// No AI inference — deterministic pattern matching only.
// ═══════════════════════════════════════════

interface ExtractionRule {
  /** Regex pattern to match against the user message (case-insensitive) */
  pattern: RegExp;
  /** The behavioral insight to record */
  insight: string;
  /** Category of understanding */
  category: InsightCategory;
}

/**
 * Extraction rules ordered by specificity.
 * More specific patterns first to prevent false positives.
 * Each rule captures ONE behavioral signal.
 *
 * Design: These are NOT emotional states (that's the ESE's job).
 * These are behavioral preferences and patterns — how the user
 * operates, what works for them, what doesn't.
 */
const EXTRACTION_RULES: ExtractionRule[] = [
  // ─── ABANDONMENT PATTERNS ───
  {
    pattern: /siempre abandono|siempre dejo.*(a medias|inacabado|sin terminar)|nunca termino|siempre pienso en dejar|otra vez lo dej[eé]/i,
    insight: 'Tiende a abandonar lo que empieza. Necesita estructura para sostener el compromiso.',
    category: 'abandonment_pattern',
  },
  {
    pattern: /cuando intento.*(demasiadas|muchas|todo).*cosas|cambiar todo.*(a la vez|de golpe)|demasiado pronto/i,
    insight: 'Abandona cuando intenta cambiar demasiadas cosas a la vez.',
    category: 'abandonment_pattern',
  },
  {
    pattern: /no veo resultados|no noto cambios|no pasa nada|nada cambia/i,
    insight: 'Abandona cuando no percibe progreso visible.',
    category: 'abandonment_pattern',
  },

  // ─── CHANGE TOLERANCE ───
  {
    pattern: /poco a poco|paso a paso|despacio|sin prisa|gradual|de a poco|uno a la vez/i,
    insight: 'Funciona mejor con cambios graduales y pasos pequeños.',
    category: 'change_tolerance',
  },
  {
    pattern: /de golpe|todo de una vez|radical|rotundo|del todo|completamente/i,
    insight: 'Preferencia por cambios drásticos cuando decide actuar.',
    category: 'change_tolerance',
  },

  // ─── PREFERENCE (response style) ───
  {
    pattern: /(listas|pasos numerados|resumen|resum[eé])\s*(me|me agobian|me saturan|me abruman|son demasiados|es mucho)/i,
    insight: 'Las listas largas le saturan. Prefiere instrucciones simples y concretas.',
    category: 'preference',
  },
  {
    pattern: /ve al grano|directo|sin rodeos|sin tanto|no me des vueltas|conciso/i,
    insight: 'Prefiere respuestas directas sin rodeos.',
    category: 'preference',
  },
  {
    pattern: /m[aá]s detalle|explica.*m[aá]s|profundiza|qu[eé]reo entender|por qu[eé]|la raz[oó]n/i,
    insight: 'Le gusta profundizar y entender el porqué de las cosas.',
    category: 'preference',
  },
  {
    pattern: /dame un plan|qu[eé] pasos|c[oó]mo empiezo|estructura|rutina|alg[uú]n m[eé]todo/i,
    insight: 'Valora la estructura y los planes claros.',
    category: 'preference',
  },
  {
    pattern: /solo necesito|basta con|nada m[aá]s|solo eso|simple|f[aá]cil/i,
    insight: 'Prefiere mantener las cosas simples. Evitar sobrecargar con opciones.',
    category: 'preference',
  },
  {
    pattern: /ejemplo|caso|situaci[oó]n|como ser[ií]a|imagina/i,
    insight: 'Los ejemplos concretos le ayudan a entender mejor.',
    category: 'preference',
  },

  // ─── MOTIVATOR ───
  {
    pattern: /cuando veo resultados|al ver progreso|si noto mejora|cuando avanzo/i,
    insight: 'La percepción de progreso aumenta mucho su adherencia.',
    category: 'motivator',
  },
  {
    pattern: /me gusta (ver|sentir|notar) que (avanzo|puedo|logro|puedo)/i,
    insight: 'Necesita sentir que está avanzando para mantener la motivación.',
    category: 'motivator',
  },
  {
    pattern: /me reconoce|elogi|me dices que lo hago bien|cuando me animas|refuerzo|animar/i,
    insight: 'El reconocimiento de sus avances aumenta su constancia.',
    category: 'motivator',
  },
  {
    pattern: /quiero mejorar|quiero ser mejor|mejorar.*vida|crecer|evolucionar/i,
    insight: 'Motivado por el crecimiento personal y la mejora continua.',
    category: 'motivator',
  },
  {
    pattern: /mi familia|mis hijos|mi pareja|por ellos|por ella|por [eé]l/i,
    insight: 'Su familia es una motivación importante.',
    category: 'motivator',
  },

  // ─── BLOCKER ───
  {
    pattern: /no tengo tiempo|falta de tiempo|ocupado|sin tiempo|mucho que hacer/i,
    insight: 'La percepción de falta de tiempo es un bloqueo recurrente.',
    category: 'blocker',
  },
  {
    pattern: /perfeccion|tiene que ser perfecto|si no es perfecto|exijo demasiado|todo o nada/i,
    insight: 'El perfeccionismo le bloquea. Tiende a "todo o nada".',
    category: 'blocker',
  },
  {
    pattern: /no s[eé] (por d[oó]nde|c[oó]mo empezar|qu[eé] hacer)|estoy perdido|no tengo claro/i,
    insight: 'Se bloquea cuando no tiene claridad sobre el primer paso.',
    category: 'blocker',
  },
  {
    pattern: /miedo a (fracasar|fallar|no lograr|equivocarme)|si fallo|que no funcione/i,
    insight: 'El miedo al fracaso le paraliza.',
    category: 'blocker',
  },
  {
    pattern: /estoy cansado|agotado|sin energ[ií]a|no tengo fuerzas|quemado|burnout/i,
    insight: 'El agotamiento físico o mental es un bloqueo frecuente.',
    category: 'blocker',
  },
  {
    pattern: /procrastino|dejo para despu[eé]s|no me apetece|me cuesta empezar/i,
    insight: 'La procrastinación es un patrón recurrente de bloqueo.',
    category: 'blocker',
  },

  // ─── SELF-DEMAND ───
  {
    pattern: /no soy (lo bastante|suficientemente) (bueno|fuerte|constante|disciplinado)|soy un fracaso|no valgo/i,
    insight: 'Alta autoexigencia con tendencia a la autocrítica.',
    category: 'self_demand',
  },
  {
    pattern: /deber[ií]a (poder|hacer|ser|lograr)|no deber[ií]a|me exijo/i,
    insight: 'Se exige mucho a sí mismo. Reacciona bien a la normalización.',
    category: 'self_demand',
  },

  // ─── SUPPORT NEED ───
  {
    pattern: /necesito que alguien|no puedo solo|ayúdame|no s[eé] c[oó]mo hacerlo solo|acompa[ñn]ame/i,
    insight: 'Necesita acompañamiento cercano. Funciona mejor con apoyo explícito.',
    category: 'support_need',
  },
  {
    pattern: /lo hago solo|no necesito ayuda|yo solo|sin ayuda|por mi cuenta/i,
    insight: 'Alta autonomía. Prefiere gestionar por su cuenta.',
    category: 'support_need',
  },

  // ─── LEARNING STYLE ───
  {
    pattern: /dime qu[eé] hacer|ya sabes|t[uú] que sabes|ind[ií]came|sugie(re|ro)|propo(ne|n)/i,
    insight: 'Prefiere que le propongas directamente qué hacer.',
    category: 'learning_style',
  },
  {
    pattern: /qu[eé] piensas|tu opini[oó]n|qu[eé] har[ií]as (t[uú]|vos)|c[oó]mo lo ves/i,
    insight: 'Valora la perspectiva del mentor y la reflexión compartida.',
    category: 'learning_style',
  },

  // ─── FAILURE REACTION ───
  {
    pattern: /volv[ií] a (empezar|intentar)|otra vez|no me rindo|lo vuelvo a intentar|reintentar/i,
    insight: 'Ante el fracaso, tiende a reintentar con determinación.',
    category: 'failure_reaction',
  },
  {
    pattern: /ya no puedo|m[eé] rind[oó]|no tiene sentido|para qu[eé]|no sirve/i,
    insight: 'Ante el fracaso, tiende a desmotivarse y considerar abandonar.',
    category: 'failure_reaction',
  },

  // ─── SUCCESS REACTION ───
  {
    pattern: /lo logr[eé]|lo consegu[ií]|por fin|ya puedo|lo hice|lo consegu[ií]/i,
    insight: 'Celebra sus logros con energía. Buen momento para consolidar.',
    category: 'success_reaction',
  },
  {
    pattern: /no es tanto|a[uú]n me falta|no es suficiente|todav[ií]a no/i,
    insight: 'Minimiza sus logros. Tiende a enfocarse en lo que falta.',
    category: 'success_reaction',
  },

  // ─── HABIT STYLE ───
  {
    pattern: /racha|d[ií]as seguidos|no romper|streak|cadena/i,
    insight: 'Las rachas le motivan. La continuidad visible le ayuda.',
    category: 'habit_style',
  },
  {
    pattern: /variedad|cambiar de|no me gusta (hacer|repetir) lo mismo|monotono|aburrido/i,
    insight: 'Necesita variedad. La repetición pura le desmotiva.',
    category: 'habit_style',
  },

  // ─── RECOVERY ───
  {
    pattern: /despu[eé]s de (un tiempo|parar|un break|descansar).*volvi|retom[eé]|empec[eé] de nuevo/i,
    insight: 'Tras pausas, es capaz de retomar por su cuenta.',
    category: 'recovery',
  },
  {
    pattern: /no consigo (volver|retomar|reincorporarme)|cada vez me cuesta m[aá]s/i,
    insight: 'Le cuesta retomar después de una pausa. Necesita un punto de entrada suave.',
    category: 'recovery',
  },
];

// ═══════════════════════════════════════════
// 2. CONFIDENCE MANAGEMENT
// Hypotheses start at 0.3. Each new evidence
// increases confidence. Contradictions decrease it.
// At 0.7+, it becomes confirmed knowledge.
// ═══════════════════════════════════════════

/** How much confidence increases per evidence hit */
const CONFIDENCE_INCREMENT = 0.15;
/** Confidence decay when a contradictory signal is detected (rare) */
const CONFIDENCE_DECAY = 0.1;
/** Maximum confidence cap */
const CONFIDENCE_MAX = 1.0;

/**
 * Compute new confidence from current value + new evidence.
 * Uses diminishing returns: each additional evidence adds less.
 */
function computeNewConfidence(current: number, evidenceCount: number): number {
  // Diminishing returns: increment shrinks as evidence grows
  const diminishingFactor = 1 / (1 + (evidenceCount - 1) * 0.15);
  const increment = CONFIDENCE_INCREMENT * diminishingFactor;
  return Math.min(current + increment, CONFIDENCE_MAX);
}

// ═══════════════════════════════════════════
// 3. CATEGORY-TO-ADAPTATION MAP
// Maps categories to natural language adaptation
// instructions. The mentor receives these as invisible
// guidance — never reveals the learning process.
// ═══════════════════════════════════════════

/**
 * Adaptation templates per category.
 * These are NOT shown to the user — they guide the LLM's style.
 * Written in natural Spanish so the model internalizes the guidance.
 *
 * Each category maps to a set of possible adaptation instructions.
 * The most recent/strongest insight per category is selected.
 */
const CATEGORY_ADAPTATIONS: Record<InsightCategory, string[]> = {
  motivator: [
    'Reconoce su progreso de forma breve y avanza. No necesitas celebrar, solo validar que avanzó.',
    'Conecta lo que hace con lo que le importa. Háblale desde su motivación.',
    'Cuando proponga algo, conéctalo con lo que a esta persona le mueve.',
  ],
  blocker: [
    'Ante su bloqueo recurrente, ofrece un camino directo. No profundices en el problema, propón salida.',
    'Normaliza su dificultad sin minimizarla. Luego ofrece un paso concreto.',
    'Cuando aparezca este patrón,reduce la ambición de la propuesta. Menos es más.',
  ],
  preference: [
    'Adapta tu longitud y estilo a lo que funciona para esta persona.',
    'Ajusta tu nivel de detalle al estilo que prefiere.',
    'Sigue el formato de respuesta que le resulta más útil.',
  ],
  learning_style: [
    'Adapta cómo presentas la orientación a su forma de procesar.',
    'Presenta la información del modo que mejor asimila.',
  ],
  autonomy: [
    'Ajusta cuánta estructura le propones según su nivel de autonomía.',
    'Ofrece el punto justo entre libertad y dirección.',
  ],
  decision_style: [
    'Adapta cómo le ayudas a decidir a su forma de tomar decisiones.',
  ],
  failure_reaction: [
    'Ante un revés, ajusta tu respuesta a cómo esta persona procesa los fracasos.',
    'Si something sale mal, responde de la forma que mejor le ayuda a reaccionar.',
  ],
  success_reaction: [
    'Ante un logro, responde según lo que esta persona necesita escuchar.',
    'Ajusta tu reconocimiento a cómo procesa los éxitos.',
  ],
  support_need: [
    'Ajusta tu nivel de acompañamiento a lo que esta persona necesita.',
    'Calibra cuánta presencia emocional vs acción práctica necesita.',
  ],
  change_tolerance: [
    'Proponga cambios al ritmo que esta persona tolera.',
    'Adapta la ambición de tus propuestas a su capacidad de absorber cambio.',
  ],
  habit_style: [
    'Adapta cómo propones mantener hábitos a su estilo.',
    'Sugiere formas de consistencia que encajen con cómo esta persona opera.',
  ],
  self_demand: [
    'Ten en cuenta su nivel de autoexigencia. Normaliza sin minimizar.',
    'Cuando se exija demasiado, recuerda con naturalidad que el progreso no es lineal.',
  ],
  abandonment_pattern: [
    'Si detectas que se acerca a su patrón de abandono, reduce la propuesta. Un paso, no diez.',
    'Ante señales de desgaste, simplifica. Mejor un pequeño compromiso que ninguno.',
  ],
  recovery: [
    'Si vuelve después de una pausa, ofrécele un punto de entrada suave.',
    'Adapta la dificultad de tu propuesta a su capacidad de retomar.',
  ],
};

// ═══════════════════════════════════════════
// 4. DEDUPLICATION — prevent overlap with
//    info already stored in other systems
// ═══════════════════════════════════════════

/**
 * Topics already covered by existing systems.
 * If a detected signal's core meaning overlaps with one of these,
 * we skip it to avoid duplicating information the mentor already has.
 */
const EXISTING_SYSTEM_TOPICS: RegExp[] = [
  // Emotional State Engine covers: energy levels, stress, focus, consistency
  /(?:tengo|estoy) (mucha|poca|alta|baja) (energ[ií]a|fuerza)/i,
  /(?:estoy|est[aá]) (muy|bastante) (estresado|agobiado|cansado)/i,
  /no puedo concentrarme|no tengo enfoque|distractivo/i,
  // Pattern Detection covers: finance-sleep, finance-meditation, finance-stress correlations
  // (very specific domain, unlikely to trigger our rules anyway)
  // Life Stages covers: monthly classification (exhaustion, intensity, calm, etc.)
  // (based on aggregated data, not message content)
  // Silent Memories covers: return, recurrence, shift, presence, temporal milestones
  // (these are system-generated, not user-stated)
];

/**
 * Check if a detected signal would duplicate information
 * already available through other systems.
 */
function wouldDuplicateExistingSystem(message: string): boolean {
  for (const pattern of EXISTING_SYSTEM_TOPICS) {
    if (pattern.test(message)) return true;
  }
  return false;
}

// ═══════════════════════════════════════════
// 5. READ PATH — Get understanding context
// Called on every message (non-blocking).
// Returns confirmed insights as adaptation guidance.
// ═══════════════════════════════════════════

/**
 * Get the user's emotional understanding context for the mentor.
 *
 * This is the READ path — called synchronously during chat,
 * in parallel with buildMentorContext.
 *
 * Returns confirmed insights (confidence >= threshold) formatted
 * as natural adaptation instructions.
 *
 * FREE: max 1 insight, preference/motivator/blocker only.
 * PREMIUM: max 4 insights, all categories.
 */
export async function getUnderstandingContext(
  userId: string,
  plan: string
): Promise<UnderstandingContext> {
  const isPremium = plan === 'PREMIUM';
  const maxInsights = isPremium ? MAX_INSIGHTS_PREMIUM : MAX_INSIGHTS_FREE;

  // Single query: fetch confirmed insights, ordered by confidence desc
  // Use the composite index on (userId, confidence)
  const insights = await db.emotionalInsight.findMany({
    where: {
      userId,
      confidence: { gte: CONFIRMATION_THRESHOLD },
      ...(isPremium ? {} : { category: { in: FREE_CATEGORIES } }),
    },
    orderBy: { confidence: 'desc' },
    take: maxInsights,
  });

  if (insights.length === 0) {
    return { adaptationSnippet: null, insights: [] };
  }

  const confirmed: ConfirmedInsight[] = insights.map(i => ({
    insight: i.insight,
    category: i.category as InsightCategory,
    confidence: i.confidence,
  }));

  // Build adaptation snippet — one instruction per unique category
  // Use a set to avoid repeating categories
  const seenCategories = new Set<InsightCategory>();
  const adaptations: string[] = [];

  for (const insight of confirmed) {
    if (seenCategories.has(insight.category)) continue;
    seenCategories.add(insight.category);

    const templates = CATEGORY_ADAPTATIONS[insight.category];
    if (templates && templates.length > 0) {
      // Pick template based on insight confidence (higher = more specific)
      const templateIndex = insight.confidence >= 0.85 ? 0 : Math.min(Math.floor(insight.confidence * templates.length), templates.length - 1);
      adaptations.push(templates[templateIndex]);
    }

    // FREE tier: 1 adaptation max
    if (!isPremium && adaptations.length >= 1) break;
  }

  const adaptationSnippet = adaptations.length > 0
    ? adaptations.join('\n')
    : null;

  return { adaptationSnippet, insights: confirmed };
}

// ═══════════════════════════════════════════
// 6. WRITE PATH — Extract and persist
// Called asynchronously after response is saved.
// Non-blocking. Failures are silently swallowed.
// ═══════════════════════════════════════════

/**
 * Extract behavioral signals from a user message and persist as hypotheses.
 *
 * This is the WRITE path — called asynchronously (fire-and-forget)
 * AFTER the assistant response is saved. It should NEVER block
 * the chat response.
 *
 * Flow:
 *   1. Check if thread has enough messages (avoid noise from short threads)
 *   2. Check cooldown (avoid processing every single message)
 *   3. Run extraction rules against the message
 *   4. Deduplicate against existing insights
 *   5. Create new hypotheses or reinforce existing ones
 *   6. Enforce max hypothesis count
 *
 * Design: All extraction is rule-based (regex). Zero extra Groq calls.
 */
export async function extractAndPersist(input: ExtractionInput): Promise<void> {
  const { userId, threadId, userMessage } = input;

  // Guard: skip extraction for very short messages (greetings, etc.)
  if (userMessage.trim().length < 20) return;

  // Guard: check cooldown — don't extract on every message in the same thread
  const recentInsight = await db.emotionalInsight.findFirst({
    where: {
      userId,
      sourceType: 'message',
      sourceRef: threadId,
    },
    orderBy: { lastEvidenceAt: 'desc' },
    select: { lastEvidenceAt: true },
  });
  if (recentInsight) {
    const elapsed = Date.now() - recentInsight.lastEvidenceAt.getTime();
    if (elapsed < EXTRACTION_COOLDOWN_MS) return;
  }

  // Guard: check thread length — only extract from threads with enough context
  const messageCount = await db.aIMessage.count({
    where: { threadId, role: 'user' },
  });
  if (messageCount < MIN_MESSAGES_FOR_EXTRACTION) return;

  // Guard: deduplicate against existing system knowledge
  if (wouldDuplicateExistingSystem(userMessage)) return;

  // Run extraction rules
  const signals = extractSignals(userMessage, threadId);
  if (signals.length === 0) return;

  // Process each detected signal
  for (const signal of signals) {
    await upsertInsight(userId, signal);
  }

  // Enforce max hypothesis count — archive lowest-confidence hypotheses
  await enforceHypothesisCap(userId);
}

/**
 * Run all extraction rules against a message.
 * Returns detected signals (may be empty).
 */
function extractSignals(message: string, sourceRef: string): DetectedSignal[] {
  const signals: DetectedSignal[] = [];
  const seenCategories = new Set<InsightCategory>();

  for (const rule of EXTRACTION_RULES) {
    // Skip if we already detected something in this category
    // (one signal per category per extraction to avoid noise)
    if (seenCategories.has(rule.category)) continue;

    if (rule.pattern.test(message)) {
      seenCategories.add(rule.category);
      signals.push({
        insight: rule.insight,
        category: rule.category,
        sourceType: 'message',
        sourceRef,
      });
    }
  }

  // Maximum 2 signals per extraction to avoid over-detection
  return signals.slice(0, 2);
}

/**
 * Create a new hypothesis or reinforce an existing one.
 *
 * Matching logic:
 * - Same category + significant insight text overlap → reinforce
 * - Otherwise → create new hypothesis
 *
 * Reinforcement increases confidence using diminishing returns.
 */
async function upsertInsight(userId: string, signal: DetectedSignal): Promise<void> {
  // Look for existing insight in the same category
  const existing = await db.emotionalInsight.findMany({
    where: {
      userId,
      category: signal.category,
    },
    orderBy: { updatedAt: 'desc' },
    take: 5,
  });

  // Try to find a match by insight text similarity
  const match = existing.find(e => {
    const existingWords = e.insight.toLowerCase().split(/\s+/);
    const newWords = signal.insight.toLowerCase().split(/\s+/);
    // Simple overlap: if 40%+ of words match, consider it the same insight
    const commonWords = existingWords.filter(w => newWords.includes(w));
    return commonWords.length / Math.max(existingWords.length, 1) >= 0.4;
  });

  if (match) {
    // Reinforce existing insight
    const newConfidence = computeNewConfidence(match.confidence, match.evidenceCount);
    await db.emotionalInsight.update({
      where: { id: match.id },
      data: {
        confidence: Math.round(newConfidence * 100) / 100, // 2 decimal precision
        evidenceCount: match.evidenceCount + 1,
        lastEvidenceAt: new Date(),
        sourceType: signal.sourceType,
        sourceRef: signal.sourceRef,
      },
    });
  } else {
    // Create new hypothesis
    await db.emotionalInsight.create({
      data: {
        userId,
        insight: signal.insight,
        category: signal.category,
        confidence: 0.3, // hypothesis starting point
        evidenceCount: 1,
        lastEvidenceAt: new Date(),
        firstSeenAt: new Date(),
        sourceType: signal.sourceType,
        sourceRef: signal.sourceRef,
      },
    });
  }
}

/**
 * Enforce the maximum hypothesis cap.
 * When exceeded, delete the lowest-confidence hypotheses
 * that haven't been confirmed yet.
 */
async function enforceHypothesisCap(userId: string): Promise<void> {
  const totalCount = await db.emotionalInsight.count({ where: { userId } });
  if (totalCount <= MAX_TOTAL_INSIGHTS_PER_USER) return;

  // Delete lowest-confidence hypotheses (non-confirmed first)
  const toDelete = await db.emotionalInsight.findMany({
    where: {
      userId,
      confidence: { lt: CONFIRMATION_THRESHOLD },
    },
    orderBy: { confidence: 'asc' },
    take: totalCount - MAX_TOTAL_INSIGHTS_PER_USER,
    select: { id: true },
  });

  if (toDelete.length > 0) {
    await db.emotionalInsight.deleteMany({
      where: {
        id: { in: toDelete.map(d => d.id) },
      },
    });
  }
}