// ═══════════════════════════════════════════
// Patrones de Vida — Type Definitions
// ═══════════════════════════════════════════
//
// Silence over mediocrity.
// Weight over quantity.
// Stability over novelty.
// ═══════════════════════════════════════════

// ─── Connection Types ───
// Only connections that support weekly correlation
// between two empires with sufficient data density.

export type EmpireConnection =
  | 'finanzas-energia'
  | 'finanzas-mente'
  | 'finanzas-estres'
  | 'finanzas-sueno';

// ─── Observation Weight ───
// Internal. NEVER shown to user.
// Controls how long an observation persists and how
// frequently it can appear.
//
// ligera:   low confidence, brief appearance, easy to replace
// relevante: solid confidence, stays longer, not easily replaced
// profunda:  high confidence + high consistency, stays weeks,
//            only replaced by something equally strong

export type ObservationWeight = 'ligera' | 'relevante' | 'profunda';

// ─── Weight Configuration ───
// How long each weight level persists in the cache.
// In ISO weeks.

export const WEIGHT_DURATION: Record<ObservationWeight, number> = {
  ligera: 1,    // 1 week — appears and goes
  relevante: 2, // 2 weeks — stays a bit
  profunda: 4,  // 4 weeks — stays, only replaced by equal or stronger
};

// ─── Pattern Signal ───
// What the data is telling us — raw signal before human copy.

export interface PatternSignal {
  /** Unique identifier for this pattern type */
  id: string;
  /** Which empires are connected */
  connection: EmpireConnection;
  /** How strong is the signal (0-1) — internal only, NEVER shown to user */
  confidence: number;
  /** Minimum data points required to even consider showing this */
  minimumDataPoints: number;
  /** Actual data points found */
  dataPointsFound: number;
  /** What fraction of clean weeks follow the pattern direction */
  consistencyScore: number;
  /** How many anomalous weeks were excluded */
  anomaliesExcluded: number;
  /** Computed emotional weight */
  weight: ObservationWeight;
}

// ─── Life Observation ───
// The final human-readable observation.

export interface LifeObservation {
  /** Unique ID */
  id: string;
  /** Which empires are connected */
  connection: EmpireConnection;
  /** The human observation — always in Spanish, always calm */
  text: string;
  /** Subtle hint about which empires are involved */
  empires: string[];
  /** Internal confidence — NEVER exposed to user */
  confidence: number;
  /** Internal weight — controls persistence duration */
  weight: ObservationWeight;
}

// ─── Cross-Empire Data ───
// Data from all empires, pre-processed for pattern detection

export interface CrossEmpireData {
  // Finanzas
  financeLogs: {
    date: string;
    type: string;
    category: string;
    amount: number;
    mood: string | null;
    contexto: string | null;
  }[];

  // Energía (WellnessLog)
  wellnessLogs: {
    date: string;
    mood: number;
    energy: number;
    sleep: number;
    stress: number;
  }[];

  // Mente (MeditationSession)
  meditationSessions: {
    duration: number;
    type: string;
    completedAt: string;
  }[];

  // Hábitos (HabitLog)
  habitLogs: {
    name: string;
    streak: number;
    lastCompletedAt: string | null;
  }[];

  // Check-ins (DailyCheckin)
  checkins: {
    date: string;
    emotion: number;
    energy: number;
    focus: number;
    stress: number;
  }[];

  // Journal (JournalEntry)
  journalEntries: {
    content: string;
    mood: number | null;
    createdAt: string;
  }[];
}

// ─── Detection Result ───
// What the pattern detector returns

export interface PatternDetectionResult {
  /** Observations that meet the threshold AND pass all validation */
  observations: LifeObservation[];
  /** Whether there's enough data to even attempt detection */
  hasEnoughData: boolean;
  /** Total data points across all empires */
  totalDataPoints: number;
}
