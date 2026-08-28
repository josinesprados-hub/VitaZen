// ═══════════════════════════════════════════
// DELIVERY RECOVERY — Constants
// PROD-01 (FASE 12-P1-B)
// ═══════════════════════════════════════════

/** Max deferred notifications processed per cron run */
export const RECOVERY_BATCH_SIZE = 100;

/** Max delivery attempts before marking as failed */
export const MAX_RECOVERY_ATTEMPTS = 3;

/** Max age for a deferred notification before it expires (24 hours) */
export const RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
