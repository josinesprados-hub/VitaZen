// ═══════════════════════════════════════════
// DECISION ENGINE — Type Definitions
// Decides what information the mentor should
// use and what it should ignore.
//
// Does NOT store, learn, or generate context.
// Only filters and prioritizes.
// ═══════════════════════════════════════════

/**
 * A context block identified within the system prompt.
 * The Decision Engine parses the assembled prompt into
 * these blocks, scores them, and decides which to keep.
 */
export interface ContextBlock {
  /** Block identifier for scoring */
  id: ContextBlockId;
  /** The full text of this block (may span multiple lines) */
  text: string;
  /** Character count of the block text */
  charCount: number;
  /** Whether this block is always preserved (never filtered) */
  protected: boolean;
  /** Relevance score 0-100 computed from user message analysis */
  relevance: number;
  /** Maximum character budget for this block */
  budget: number;
}

/** All identifiable context blocks in the system prompt */
export type ContextBlockId =
  | 'base_prompt'        // The core mentor personality from groq.ts — NEVER filtered
  | 'context_rules'      // "CÓMO USAR ESTE CONTEXTO" instructions
  | 'identity'           // Layer 1: name, onboarding, focus
  | 'emotional_state'    // Layer 2: ESE status, summary, recommendation
  | 'life_stage'         // Layer 2: Life Stages observation + transition
  | 'patterns'           // Layer 2: Cross-empire pattern observations
  | 'silent_memories'    // Layer 2: Silent Memory observations
  | 'lived_experience'   // Layer 3: check-ins, wellness, journals, finance
  | 'behavioral'         // Layer 4: habits, meditations, weekly activity, empires
  | 'conversational'     // Layer 5: recent conversation topics
  | 'understanding'      // Emotional Understanding adaptation instructions
  | 'evidence_rules';    // "CONTROL DE EVIDENCIA" (PREMIUM only)

/**
 * Token budget configuration per plan.
 * These are CHARACTER budgets (not tokens) since we operate
 * on the assembled prompt string. Approximate ratio: 1 token ≈ 4 chars.
 */
export interface DecisionBudget {
  /** Maximum total characters for the context section (between markers) */
  maxContextChars: number;
  /** Per-block maximums. Blocks exceeding this get truncated. */
  blockMax: Partial<Record<ContextBlockId, number>>;
  /** How many non-protected blocks can be active simultaneously */
  maxActiveBlocks: number;
}

/**
 * The output of the Decision Engine.
 * Contains the optimized system prompt, ready for Groq.
 */
export interface DecisionResult {
  /** The optimized system prompt */
  systemPrompt: string;
  /** Which blocks were kept (for observability) */
  activeBlocks: ContextBlockId[];
  /** Which blocks were filtered out */
  filteredBlocks: ContextBlockId[];
  /** Which blocks were truncated */
  truncatedBlocks: ContextBlockId[];
  /** Total characters saved by filtering */
  charsSaved: number;
}

/**
 * A domain classifier result.
 * Maps user message content to relevance areas.
 */
export interface DomainSignal {
  domain: RelevanceDomain;
  strength: number; // 0-100
}

/** Domains that affect which context blocks are relevant */
export type RelevanceDomain =
  | 'emotional'      // User talks about feelings, stress, mood, relationships
  | 'progress'       // User talks about goals, achievements, consistency, habits
  | 'energy'         // User talks about sleep, tiredness, physical state
  | 'financial'      // User talks about money, spending, finances
  | 'relational'     // User talks about partner, family, social
  | 'reflective'     // User talks about thinking, philosophy, meaning
  | 'practical'      // User asks for plans, steps, methods, structure
  | 'crisis';        // User signals overwhelm, burnout, acute distress