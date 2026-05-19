// ═══════════════════════════════════════════
// Patrones de Vida — Type Definitions
// ═══════════════════════════════════════════
//
// Architecture designed to grow.
// Separation: detection → rendering → copy → connection types
//
// Philosophy:
// - Never judge. Never score. Never advise.
// - Only observe. Only reflect. Only show.
// - If not enough data: silence.
// ═══════════════════════════════════════════

// ─── Connection Types ───
// Which empires are connected in a pattern

export type EmpireConnection =
  | 'finanzas-energia'
  | 'finanzas-mente'
  | 'finanzas-habitos'
  | 'finanzas-estres'
  | 'finanzas-sueno'
  | 'finanzas-social';

// ─── Pattern Signal ───
// What the data is telling us — raw signal before human copy

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
}

// ─── Life Observation ───
// The final human-readable observation
// This is what the user sees — calm, intimate, non-judgmental

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
  /** Observations that meet the threshold */
  observations: LifeObservation[];
  /** Whether there's enough data to even attempt detection */
  hasEnoughData: boolean;
  /** Total data points across all empires */
  totalDataPoints: number;
}
