// ═══════════════════════════════════════════
// EMOTIONAL UNDERSTANDING ENGINE — Types
// Defines the type system for behavioral learning.
// This engine learns HOW to help each user better.
// ═══════════════════════════════════════════

/**
 * The 14 categories of emotional understanding.
 * Each maps to a dimension of "how to help this person better".
 * These are NOT emotional states — they are behavioral patterns.
 */
export type InsightCategory =
  | 'motivator'             // What drives them (progress, recognition, autonomy, etc.)
  | 'blocker'               // What stops them (overwhelm, perfectionism, etc.)
  | 'preference'            // Response style preferences (brief, detailed, examples, etc.)
  | 'learning_style'        // How they process guidance (steps, reflection, direct, etc.)
  | 'autonomy'              // How much structure vs freedom they need
  | 'decision_style'        // How they make choices (analytical, intuitive, avoidant)
  | 'failure_reaction'      // How they respond to setbacks
  | 'success_reaction'      // How they respond to wins
  | 'support_need'          // How much emotional support vs practical action
  | 'change_tolerance'      // How they handle change (gradual, bold, resistant)
  | 'habit_style'           // How they maintain habits (streaks, variety, minimal)
  | 'self_demand'           // Their level of self-criticism / perfectionism
  | 'abandonment_pattern'   // What typically makes them quit
  | 'recovery';             // How they bounce back after setbacks

/**
 * A confirmed insight about the user, ready for mentor consumption.
 * Only insights with confidence >= CONFIRMATION_THRESHOLD are returned.
 */
export interface ConfirmedInsight {
  insight: string;
  category: InsightCategory;
  confidence: number;
}

/**
 * The output of the reading phase — what the mentor needs to adapt.
 * Contains both the adaptation instructions (for the prompt)
 * and the raw insights (for traceability).
 */
export interface UnderstandingContext {
  /** Adaptation instruction to inject into the system prompt. Natural Spanish. */
  adaptationSnippet: string | null;
  /** Raw confirmed insights for debugging/logging */
  insights: ConfirmedInsight[];
}

/**
 * Input for the extraction phase (post-response, async).
 * Contains the user's message and conversation context needed
 * to detect behavioral signals.
 */
export interface ExtractionInput {
  userId: string;
  threadId: string;
  userMessage: string;
  /** The assistant's response (needed for some extraction patterns) */
  assistantMessage?: string;
}

/**
 * Internal representation of a detected signal during extraction.
 * Not persisted directly — mapped to EmotionalInsight DB records.
 */
export interface DetectedSignal {
  /** The behavioral insight text */
  insight: string;
  /** Which category this belongs to */
  category: InsightCategory;
  /** The source type that generated this signal */
  sourceType: 'message' | 'journal' | 'checkin_note';
  /** Reference ID for traceability */
  sourceRef: string;
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════

/** Confidence threshold: below = hypothesis, above = confirmed knowledge */
export const CONFIRMATION_THRESHOLD = 0.7;

/** Maximum confirmed insights returned to the mentor (token budget) */
export const MAX_INSIGHTS_PREMIUM = 4;
export const MAX_INSIGHTS_FREE = 1;

/** Maximum hypothesis count per user (prevents unbounded growth) */
export const MAX_HYPOTHESES_PER_USER = 30;

/** Maximum total insights (hypotheses + confirmed) per user */
export const MAX_TOTAL_INSIGHTS_PER_USER = 40;

/** Minimum messages in a thread before extraction triggers (avoid noise from short threads) */
export const MIN_MESSAGES_FOR_EXTRACTION = 4;

/** Minimum interval between extractions for the same thread (ms) — 30 minutes */
export const EXTRACTION_COOLDOWN_MS = 30 * 60 * 1000;

/** Categories grouped for FREE tier — only the most impactful ones */
export const FREE_CATEGORIES: InsightCategory[] = [
  'preference',
  'motivator',
  'blocker',
];