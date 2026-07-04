// ═══════════════════════════════════════════
// WIDGET TYPES & CONSTANTS — VitaZen
// Minimal, calm, premium mobile widget architecture
// ═══════════════════════════════════════════
//
// Design principles:
//   - Pre-computed snapshots (compute on write, not on read)
//   - Lightweight payloads (under 1KB per widget)
//   - Intelligent TTL per widget type
//   - No aggressive polling, no refresh loops
//   - Battery-first: reads are O(1) from snapshot
//
// Widget types ready for implementation:
//   - reflection: daily calm reflection text
//   - momentum: score + trend + streak
//   - checkin: today's check-in status + emotion
//   - daily_focus: focus area + one tip
//   - calm_quote: one premium calm quote

// ─── Widget Types ───────────────────────────

export type WidgetType =
  | 'reflection'
  | 'momentum'
  | 'checkin'
  | 'daily_focus'
  | 'calm_quote';

/** All supported widget types for iteration */
export const WIDGET_TYPES: WidgetType[] = [
  'reflection',
  'momentum',
  'checkin',
  'daily_focus',
  'calm_quote',
];

// ─── TTL Configuration (per widget type) ────
//
// How long a snapshot is considered "fresh" before it needs recomputation.
// This is the PRIMARY defense against battery drain:
//   - iOS/Android widgets typically refresh every 15-60 min
//   - Our TTL means we serve cached data for most reads
//   - Actual recomputation only happens when data changes (trigger-based)
//     or when the TTL expires naturally
//
// TTL design rationale:
//   - reflection: changes once per day (evening reflection rotation)
//   - momentum: changes on user activity, but not rapidly
//   - checkin: changes when user checks in (trigger-based invalidation)
//   - daily_focus: changes once per day
//   - calm_quote: changes once per day

export const WIDGET_TTL_MS: Record<WidgetType, number> = {
  reflection:   6 * 60 * 60 * 1000,  // 6 hours — daily reflection, changes slowly
  momentum:     30 * 60 * 1000,       // 30 min — reflects recent activity
  checkin:      60 * 60 * 1000,       // 1 hour — changes on check-in (trigger-based too)
  daily_focus:  12 * 60 * 60 * 1000,  // 12 hours — changes once per day
  calm_quote:   24 * 60 * 60 * 1000,  // 24 hours — daily quote rotation
};

// ─── Rate Limiting ──────────────────────────
//
// Prevent aggressive refresh from widget clients.
// A single user can only request a manual refresh this often.

export const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes between manual refreshes

/** Max times a user can request a manual refresh per day */
export const MAX_DAILY_REFRESHES = 12; // ~every 2 hours = reasonable for widgets

// ─── Payload Schemas ────────────────────────
//
// Each widget type has a strictly shaped payload.
// Payloads are intentionally minimal: a few fields, no nested objects.
// This keeps serialization fast and widget rendering simple.

export interface ReflectionWidgetPayload {
  /** The reflection text for today */
  text: string;
  /** Short label like "Reflexión del día" */
  label: string;
  /** When this reflection was selected (ISO string) */
  dateKey: string;
  /** PREMIUM: category hint for themed widgets */
  category?: string;
}

export interface MomentumWidgetPayload {
  /** Momentum score 0-100 */
  score: number;
  /** Level label: bajo | estable | fuerte */
  level: string;
  /** Trend arrow: up | down | stable */
  trend: 'up' | 'down' | 'stable';
  /** Current activity streak in days */
  streak: number;
  /** Short description */
  description: string;
}

export interface CheckinWidgetPayload {
  /** Whether user has checked in today */
  checkedIn: boolean;
  /** Emotion level 1-5 (null if not checked in) */
  emotion: number | null;
  /** Energy level 1-5 (null if not checked in) */
  energy: number | null;
  /** Today's intention (null if not checked in) */
  intention: string | null;
  /** Calm nudge when not checked in yet */
  nudge: string | null;
}

export interface DailyFocusWidgetPayload {
  /** Today's focus area name */
  focusArea: string;
  /** Empire key: disciplina | mente | energia | riqueza | crecimiento */
  empire: string;
  /** One calm, actionable tip */
  tip: string;
  /** Tip title */
  tipTitle: string;
}

export interface CalmQuoteWidgetPayload {
  /** The calm quote text */
  quote: string;
  /** Quote category for themed rendering */
  category: string;
  /** Day key for deterministic selection */
  dateKey: string;
}

/** Union type for any widget payload */
export type WidgetPayload =
  | ReflectionWidgetPayload
  | MomentumWidgetPayload
  | CheckinWidgetPayload
  | DailyFocusWidgetPayload
  | CalmQuoteWidgetPayload;

// ─── API Response Types ─────────────────────

export interface WidgetResponse {
  type: WidgetType;
  data: WidgetPayload;
  computedAt: string;    // ISO timestamp
  expiresAt: string;     // ISO timestamp
  stale: boolean;        // True if TTL has passed but data is still served (stale-while-revalidate)
}

export interface WidgetConfigResponse {
  /** Which widget types are available for this user */
  availableTypes: WidgetType[];
  /** Per-type TTL in seconds (for client-side cache headers) */
  ttlSeconds: Record<WidgetType, number>;
  /** Minimum refresh interval in seconds */
  minRefreshIntervalSec: number;
  /** User's plan for premium feature gating */
  plan: string;
}

export interface WidgetRefreshResult {
  type: WidgetType;
  refreshed: boolean;
  reason?: string;
  computedAt?: string;
}

// ─── Internal Types ─────────────────────────

export interface CachedSnapshot {
  userId: string;
  widgetType: WidgetType;
  data: WidgetPayload;
  computedAt: Date;
  expiresAt: Date;
}

// ─── Emotion Mapping ────────────────────────
//
// Maps 1-5 scale to calm, non-aggressive labels.
// No "bad" or "terrible" — always gentle and constructive.

export const EMOTION_LABELS: Record<number, string> = {
  1: 'Descansando',
  2: 'Tranquilo',
  3: 'Estable',
  4: 'Bien',
  5: 'Pleno',
};
