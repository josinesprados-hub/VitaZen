// ═══════════════════════════════════════════
// DELIVERY RECOVERY — VitaZen
// Recovers deferred notifications after Quiet Hours.
// PROD-01 (FASE 12-P1-B)
// ═══════════════════════════════════════════

import { db } from '@/lib/db';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdminApp } from './firebase-admin-wrapper';
import { isInQuietHours, computeQuietHoursExit } from './scheduler';
import { MAX_RECOVERY_ATTEMPTS, RECOVERY_BATCH_SIZE, RECOVERY_MAX_AGE_MS } from './recovery-constants';

export interface RecoveryResult {
  processed: number;
  delivered: number;
  redeferred: number;
  failed: number;
  expired: number;
  skipped: number;
  errors: number;
}

/**
 * Process all due deferred notifications.
 *
 * Idempotency strategy:
 * - Uses Prisma atomic update with `where: { status: 'pending' }` as an
 *   optimistic concurrency guard. If two cron runs race, only one sees
 *   status='pending' — the other's update returns count=0 and skips.
 * - Sets status to 'delivering' before attempting FCM send.
 * - On FCM success: status → 'sent', creates NotificationLog.
 * - On FCM failure: status → 'failed' (if max attempts reached) or back
 *   to 'pending' (to retry next cron run).
 * - If still in quiet hours: re-defer with new scheduledFor.
 * - If expired: status → 'expired'.
 */
export async function processDeferredNotifications(): Promise<RecoveryResult> {
  const result: RecoveryResult = {
    processed: 0,
    delivered: 0,
    redeferred: 0,
    failed: 0,
    expired: 0,
    skipped: 0,
    errors: 0,
  };

  const now = new Date();
  const maxAge = new Date(now.getTime() - RECOVERY_MAX_AGE_MS);

  // Find pending notifications that are due (scheduledFor <= now)
  // and not too old. Limit batch size for safety.
  const candidates = await db.deferredNotification.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: now },
      createdAt: { gte: maxAge },
    },
    orderBy: { scheduledFor: 'asc' },
    take: RECOVERY_BATCH_SIZE,
  });

  for (const deferred of candidates) {
    result.processed++;

    try {
      // ── 1. Atomic claim: pending → delivering ──
      // This is the core idempotency guard. If two cron runs race on
      // the same row, only one will get updateCount=1.
      const claimed = await db.deferredNotification.updateMany({
        where: {
          id: deferred.id,
          status: 'pending', // Only claim if still pending
        },
        data: {
          status: 'delivering',
          lastAttemptAt: now,
          attemptCount: { increment: 1 },
        },
      });

      if (claimed.count === 0) {
        // Another process already claimed this one — skip
        result.skipped++;
        continue;
      }

      // ── 2. Re-check: is the user STILL in quiet hours? ──
      // User may have changed preferences, or timezone shifted.
      const prefs = await db.notificationPreference.findUnique({
        where: { userId: deferred.userId },
      });

      if (prefs && prefs.quietHoursEnabled && prefs.pushEnabled) {
        const stillQuiet = isInQuietHours(
          now,
          prefs.quietHoursStart,
          prefs.quietHoursEnd,
          prefs.timezone,
        );

        if (stillQuiet) {
          // Still in quiet hours — re-defer with new exit time
          const newExit = computeQuietHoursExit(
            now,
            prefs.quietHoursEnd,
            prefs.timezone,
          );
          await db.deferredNotification.update({
            where: { id: deferred.id },
            data: {
              status: 'pending',
              scheduledFor: newExit,
            },
          });
          result.redeferred++;
          continue;
        }
      }

      // ── 3. Check if push is still enabled ──
      if (!prefs || !prefs.pushEnabled) {
        await db.deferredNotification.update({
          where: { id: deferred.id },
          data: { status: 'failed', processedAt: now },
        });
        result.failed++;
        continue;
      }

      // ── 4. Send via FCM ──
      const tokens = await db.pushToken.findMany({
        where: { userId: deferred.userId, active: true },
        select: { id: true, token: true },
      });

      if (tokens.length === 0) {
        await db.deferredNotification.update({
          where: { id: deferred.id },
          data: { status: 'failed', processedAt: now },
        });
        result.failed++;
        continue;
      }

      let delivered = false;
      const fcmTokens = tokens.map(t => t.token);
      const invalidTokenIds: string[] = [];

      try {
        const app = getFirebaseAdminApp();
        const messaging = getMessaging(app);

        const response = await messaging.sendEachForMulticast({
          notification: {
            title: deferred.title,
            body: deferred.body,
          },
          data: {
            type: deferred.type,
            url: '/dashboard',
          },
          tokens: fcmTokens,
        });

        delivered = response.successCount > 0;

        // Collect invalid tokens
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const error = resp.error;
            if (
              error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokenIds.push(tokens[idx].id);
            }
          }
        });

        // Cleanup invalid tokens (non-blocking)
        if (invalidTokenIds.length > 0) {
          db.pushToken.updateMany({
            where: { id: { in: invalidTokenIds } },
            data: { active: false },
          }).catch(() => {});
        }
      } catch (fcmErr) {
        console.error('[DeliveryRecovery] FCM error for deferred', deferred.id, fcmErr);
      }

      // ── 5. Update status based on outcome ──
      if (delivered) {
        await db.deferredNotification.update({
          where: { id: deferred.id },
          data: { status: 'sent', processedAt: now },
        });

        // Also create a NotificationLog entry for consistency
        await db.notificationLog.create({
          data: {
            userId: deferred.userId,
            type: deferred.type,
            title: deferred.title,
            body: deferred.body,
            wasDelivered: true,
            wasInQuietHours: false, // It was deferred, but now delivered outside QH
          },
        });

        result.delivered++;
      } else {
        const current = await db.deferredNotification.findUnique({
          where: { id: deferred.id },
          select: { attemptCount: true },
        });
        const attempts = current?.attemptCount ?? deferred.attemptCount;

        if (attempts >= MAX_RECOVERY_ATTEMPTS) {
          await db.deferredNotification.update({
            where: { id: deferred.id },
            data: { status: 'failed', processedAt: now },
          });
          result.failed++;
        } else {
          // Retry later — put back to pending, schedule for next cron window
          await db.deferredNotification.update({
            where: { id: deferred.id },
            data: {
              status: 'pending',
              scheduledFor: new Date(now.getTime() + 15 * 60 * 1000), // 15 min from now
            },
          });
          result.errors++;
        }
      }
    } catch (err) {
      console.error('[DeliveryRecovery] Unexpected error for deferred', deferred.id, err);
      // Put back to pending so it can be retried
      try {
        await db.deferredNotification.update({
          where: { id: deferred.id },
          data: { status: 'pending' }, // Ensure it's not stuck in 'delivering'
        });
      } catch {
        // If even the rollback fails, just count it
      }
      result.errors++;
    }
  }

  // ── 6. Expire very old pending notifications ──
  // Notifications older than RECOVERY_MAX_AGE_MS that are still pending
  // are marked as expired to prevent unbounded table growth.
  try {
    const expiredCount = await db.deferredNotification.updateMany({
      where: {
        status: 'pending',
        createdAt: { lt: maxAge },
      },
      data: {
        status: 'expired',
        processedAt: now,
      },
    });
    result.expired = expiredCount.count;
  } catch {
    // Non-critical — log but don't fail the whole batch
  }

  return result;
}
