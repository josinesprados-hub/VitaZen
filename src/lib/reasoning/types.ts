// ═══════════════════════════════════════════
// REASONING ENGINE — Type Definitions
//
// The brain that decides HOW the mentor should
// respond before the response is generated.
//
// Does NOT store. Does NOT learn. Does NOT generate.
// Only decides: needs → intention → knowledge →
// tone → objective → adaptation → instruction.
// ═══════════════════════════════════════════

// ─── Needs ───
// What the user really needs (beyond the text)

export type UserNeed =
  | 'comprension_emocional'   // Emotional validation
  | 'claridad'               // Clarity / understanding
  | 'orientacion'            // Guidance / direction
  | 'accion'                 // Concrete action steps
  | 'motivacion'             // Motivation / energy boost
  | 'reflexion'              // Reflection / deeper thinking
  | 'celebracion'            // Celebrate achievement
  | 'continuidad'            // Natural continuity with past context
  | 'ayuda_practica'         // Practical help / tools
  | 'toma_de_decisiones'     // Decision-making support
  | 'validacion_emocional'   // Emotional validation (lighter)
  | 'desbloqueo';            // Unblock / unstuck

// ─── Intentions ───
// What the user's message conveys (can be multiple)

export type Intention =
  | 'progreso'               // Progress / achievement
  | 'frustracion'            // Frustration / setback
  | 'autoestima_baja'        // Low self-esteem / self-criticism
  | 'inseguridad'            // Insecurity / fear
  | 'logro'                  // Accomplishment
  | 'cambio_vital'           // Life change / big decision
  | 'incertidumbre'          // Uncertainty
  | 'necesidad_confianza'    // Need for confidence
  | 'agotamiento'            // Exhaustion / burnout
  | 'busqueda_sentido'       // Search for meaning
  | 'desahogo'               // Venting / emotional release
  | 'curiosidad'             // Curiosity / learning
  | 'queja'                  // Complaining
  | 'gratitud'               // Gratitude
  | 'duda'                   // Doubt / hesitation
  | 'celebracion_logro'      // Celebrating a win
  | 'estancamiento'          // Feeling stuck
  | 'motivacion_alta'        // High motivation
  | 'saturacion'             // Overwhelmed / saturated
  | 'vulnerabilidad';        // Opening up emotionally

// ─── Tone ───
// How the mentor should sound (within VitaZen philosophy)

export type ToneStyle =
  | 'cercano'                // Close, warm
  | 'directo'                // Direct, no fluff
  | 'calmado'                // Calm, reassuring
  | 'firme'                  // Firm, holding boundaries
  | 'reflexivo'              // Reflective, thoughtful
  | 'practico'               // Practical, action-oriented
  | 'motivador'              // Motivating, energizing
  | 'analitico'              // Analytical, objective;

// ─── Response Objective ───
// What this response should achieve

export type ResponseObjective =
  | 'desbloquear'            // Unblock the user
  | 'tranquilizar'           // Calm / reassure
  | 'celebrar'               // Celebrate progress
  | 'mantener_impulso'       // Maintain momentum
  | 'ayudar_a_decidir'       // Help make a decision
  | 'aumentar_claridad'      // Increase clarity
  | 'reforzar_compromiso'    // Reinforce commitment
  | 'profundizar'            // Go deeper into the topic
  | 'validar'                // Validate emotions
  | 'normalizar'             // Normalize the experience
  | 'desafiar_suavemente'    // Gently challenge
  | 'contener'               // Hold space / contain emotion
  | 'orientar'               // Provide direction
  | 'reflexionar_junto';     // Reflect together

// ─── Adaptation Signals ───
// Dynamic adjustments based on detected state

export interface AdaptationSignals {
  /** User is exhausted → less advice, more understanding */
  exhaustion: boolean;
  /** User is motivated → more action, less theory */
  motivated: boolean;
  /** User is stagnant → more empathy, less pressure */
  stagnant: boolean;
  /** User is progressing → more challenge, more depth */
  progressing: boolean;
  /** User is saturated → shorter, simpler response */
  saturated: boolean;
}

// ─── Repetition Check ───
// Detects patterns in recent history to avoid repetition

export interface RepetitionCheck {
  /** Whether a repetition risk was detected */
  hasRisk: boolean;
  /** Types of repetition detected */
  types: RepetitionType[];
}

export type RepetitionType =
  | 'phrase'                 // Same phrases repeated
  | 'structure'              // Same sentence structures
  | 'question'               // Same questions asked
  | 'closing'                // Same closing patterns
  | 'advice';                // Same advice given

// ─── Reasoning Output ───
// What the Reasoning Engine produces — injected as
// invisible instructions into the system prompt.

export interface ReasoningInstruction {
  /** Ordered list of detected needs (primary first) */
  needs: UserNeed[];
  /** Detected intentions (may be multiple) */
  intentions: Intention[];
  /** Primary tone to use */
  tone: ToneStyle;
  /** Secondary tone (optional, for hybrid messages) */
  secondaryTone: ToneStyle | null;
  /** Primary response objective */
  objective: ResponseObjective;
  /** Secondary objective (optional) */
  secondaryObjective: ResponseObjective | null;
  /** Dynamic adaptation signals */
  adaptations: AdaptationSignals;
  /** Whether to favor variety (repetition detected) */
  favorVariety: boolean;
  /** The final instruction snippet to inject into the prompt */
  instructionSnippet: string;
  /** Plan type for this reasoning pass */
  plan: 'FREE' | 'PREMIUM';
}

// ─── Reasoning Input ───
// What the engine needs to reason (all already available)

export interface ReasoningInput {
  /** The user's current message */
  userMessage: string;
  /** Recent conversation history (role + content) */
  history: Array<{ role: string; content: string }>;
  /** User's plan */
  plan: string;
  /** The assembled system prompt (for context awareness) */
  systemPrompt: string;
}