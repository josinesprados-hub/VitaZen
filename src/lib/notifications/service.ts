// ═══════════════════════════════════════════
// NOTIFICATION SERVICE — VitaZen
// Core service: send notifications through FCM
// with full gate checks (rate limit, cooldown, dedup, quiet hours)
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdminApp } from './firebase-admin-wrapper';
import {
  NotificationType,
  NotificationTemplate,
  ScheduleGateResult,
} from './types';
import { canSendNotification, isDuplicateNotification, getUserTodayStart } from './scheduler';
import { getTemplate } from './templates';
import { trackFCMSendFailure, trackFCMInvalidTokens, trackNoActiveTokens } from '@/lib/observability/notification-tracking';

/** Result of a send attempt */
export interface SendNotificationResult {
  success: boolean;
  reason?: string;
  logId?: string;
}

/**
 * Main entry point: attempt to send a push notification.
 *
 * Flow:
 *  1. Run gate checks (preferences, quiet hours, caps, cooldowns)
 *  2. Deduplication check
 *  3. Get calm template
 *  4. Send via FCM to all active tokens for this user
 *  5. Log the result
 *  6. Handle invalid tokens (cleanup)
 */
export async function sendNotification(
  userId: string,
  type: NotificationType,
  templateVars?: Record<string, string | number>,
  overrideTemplate?: NotificationTemplate,
): Promise<SendNotificationResult> {
  // ── 1. Gate checks ──
  const gate: ScheduleGateResult = await canSendNotification(userId, type);
  if (!gate.allowed) {
    // PROD-01: Defer notifications blocked by quiet hours instead of discarding
    if (gate.reason === 'quiet_hours' && gate.deferUntil) {
      try {
        const template = overrideTemplate || getTemplate(type, templateVars);
        await db.deferredNotification.create({
          data: {
            userId,
            type,
            title: template.title,
            body: template.body,
            scheduledFor: gate.deferUntil,
            status: 'pending',
          },
        });
      } catch (deferErr) {
        // Log but don't throw — the caller still gets success:false
        console.error('[Notifications] Failed to defer notification:', deferErr);
      }
    }
    return {
      success: false,
      reason: gate.reason,
    };
  }

  // ── 2. Template ──
  const template = overrideTemplate || getTemplate(type, templateVars);

  // ── 3. Dedup ──
  const isDup = await isDuplicateNotification(userId, type, template.title, template.body);
  if (isDup) {
    return { success: false, reason: 'duplicate' };
  }

  // ── 4. Get active push tokens ──
  const tokens = await db.pushToken.findMany({
    where: { userId, active: true },
    select: { id: true, token: true },
  });

  if (tokens.length === 0) {
    trackNoActiveTokens();
    return { success: false, reason: 'no_active_tokens' };
  }

  // ── 5. Send via FCM ──
  const fcmTokens = tokens.map(t => t.token);
  let deliveredCount = 0;
  const invalidTokenIds: string[] = [];

  try {
    const app = getFirebaseAdminApp();
    const messaging = getMessaging(app);

    const message = {
      notification: {
        title: template.title,
        body: template.body,
      },
      data: {
        type,
        url: template.url || '/dashboard',
      },
      tokens: fcmTokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    deliveredCount = response.successCount;

    // Collect invalid tokens for cleanup
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const error = resp.error;
        // FCM returns these error codes for permanently invalid tokens
        if (
          error?.code === 'messaging/invalid-registration-token' ||
          error?.code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokenIds.push(tokens[idx].id);
        }
      }
    });
  } catch (error) {
    console.error('[Notifications] FCM send error:', error);
    trackFCMSendFailure(error, fcmTokens.length);
    // Still log the attempt — important for debugging and rate limit tracking
  }

  // ── 6. Cleanup invalid tokens (non-blocking) ──
  if (invalidTokenIds.length > 0) {
    trackFCMInvalidTokens(invalidTokenIds.length);
    db.pushToken.updateMany({
      where: { id: { in: invalidTokenIds } },
      data: { active: false },
    }).catch(err => {
      console.error('[Notifications] Token cleanup error:', err);
    });
  }

  // ── 7. Log the notification ──
  const log = await db.notificationLog.create({
    data: {
      userId,
      type,
      title: template.title,
      body: template.body,
      wasDelivered: deliveredCount > 0,
      wasInQuietHours: false, // Already gated above — if we reach here, we're outside quiet hours
    },
  });

  return {
    success: deliveredCount > 0,
    reason: deliveredCount > 0 ? undefined : 'fcm_delivery_failed',
    logId: log.id,
  };
}

/**
 * H-17 (FASE 8E): deferNotification — replaced by PROD-01 (FASE 12-P1-B).
 *
 * Deferred notifications are now persisted as DeferredNotification records
 * inside sendNotification() when quiet_hours blocks. The recovery cron at
 * /api/cron/delivery-recovery delivers them after quiet hours end.
 */

/**
 * Get the number of notifications sent to a user today.
 * Useful for UI display ("X de Y notificaciones hoy").
 */
export async function getTodayNotificationCount(
  userId: string,
  timezone: string = 'Europe/Madrid',
): Promise<number> {
  const todayStart = getUserTodayStart(timezone);

  return db.notificationLog.count({
    where: {
      userId,
      sentAt: { gte: todayStart },
    },
  });
}
