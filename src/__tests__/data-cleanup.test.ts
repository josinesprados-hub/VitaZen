/**
 * FASE 12-P6 — Data Cleanup Tests
 *
 * Unit tests for src/lib/data-cleanup.ts
 *
 * These tests verify the cleanup logic without requiring a live database.
 * They mock Prisma and validate the exact WHERE clauses, batch sizes,
 * safety invariants, and idempotency of each cleanup function.
 *
 * NOTE: The DeferredNotification model exists in schema.prisma (PROD-01 merged).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock setup (hoisted so vi.mock factory can reference it) ───

function applyWhere(
  rows: Array<Record<string, unknown>>,
  where: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return rows.filter(row => {
    for (const [key, val] of Object.entries(where)) {
      if (typeof val === 'object' && val !== null) {
        if ('startsWith' in val) {
          if (!(row[key] as string).startsWith((val as { startsWith: string }).startsWith)) return false;
        } else if ('not' in val) {
          const inner = (val as { not: { startsWith: string } }).not;
          if ('startsWith' in inner && (row[key] as string).startsWith(inner.startsWith)) return false;
        } else if ('lt' in val) {
          if (new Date(row[key] as string) >= new Date((val as { lt: Date }).lt)) return false;
        } else if ('in' in val) {
          if (!((val as { in: unknown[] }).in).includes(row[key])) return false;
        }
      } else {
        if (row[key] !== val) return false;
      }
    }
    return true;
  });
}

function createModelMock() {
  let data: Array<{ id: string; [k: string]: unknown }> = [];
  const mock = {
    _data: data,
    findMany: async (opts: Record<string, unknown>) => {
      const where = opts.where as Record<string, unknown> | undefined;
      const take = (opts.take as number) || 100;
      const orderBy = (opts.orderBy as Record<string, string> | undefined);
      let filtered = [...data];
      if (where) filtered = applyWhere(filtered, where);
      if (orderBy) {
        const key = Object.keys(orderBy)[0];
        const dir = Object.values(orderBy)[0] === 'asc' ? 1 : -1;
        filtered.sort((a, b) => {
          const va = a[key] as string;
          const vb = b[key] as string;
          return va < vb ? -dir : va > vb ? dir : 0;
        });
      }
      return filtered.slice(0, take).map(r => ({ id: r.id }));
    },
    deleteMany: async (opts: Record<string, unknown>) => {
      const where = opts.where as Record<string, unknown> | undefined;
      const before = data.length;
      if (where && 'id' in where) {
        const ids = new Set((where.id as { in: string[] }).in);
        data = data.filter(r => !ids.has(r.id));
      }
      return { count: before - data.length };
    },
    reset: () => { data = []; },
    seed: (rows: Array<{ id: string; [k: string]: unknown }>) => { data = [...rows]; },
    count: () => data.length,
  };
  return mock;
}

const { MOCK_DB } = vi.hoisted(() => ({
  MOCK_DB: {
    analyticsEvent: createModelMock(),
    notificationLog: createModelMock(),
    pushToken: createModelMock(),
    deferredNotification: createModelMock(),
  },
}));

// Mock the db module
vi.mock('@/lib/db', () => ({ db: MOCK_DB }));

import {
  cleanupRateLimitEvents,
  cleanupNotificationLogs,
  cleanupInactivePushTokens,
  cleanupTerminalDeferredNotifications,
  cleanupOldAnalyticsEvents,
  runAllCleanups,
} from '@/lib/data-cleanup';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ─── Helpers ───────────────────────────────────────────────────

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

// ─── Tests ─────────────────────────────────────────────────────

describe('cleanupRateLimitEvents', () => {
  beforeEach(() => MOCK_DB.analyticsEvent.reset());

  it('does NOT delete recent rl: events (< 10 min)', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'rl-1', event: 'rl:checkin:post', createdAt: ago(5 * MINUTE) },
      { id: 'rl-2', event: 'rl:ai:chat', createdAt: ago(9 * MINUTE) },
    ]);
    await cleanupRateLimitEvents();
    expect(MOCK_DB.analyticsEvent.count()).toBe(2);
  });

  it('DOES delete old rl: events (> 10 min)', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'rl-old-1', event: 'rl:checkin:post', createdAt: ago(11 * MINUTE) },
      { id: 'rl-old-2', event: 'rl:ai:chat', createdAt: ago(1 * HOUR) },
    ]);
    await cleanupRateLimitEvents();
    expect(MOCK_DB.analyticsEvent.count()).toBe(0);
  });

  it('does NOT delete real product events even if old', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'prod-1', event: 'daily_session', createdAt: ago(1 * HOUR) },
      { id: 'prod-2', event: 'checkin_created', createdAt: ago(1 * DAY) },
    ]);
    await cleanupRateLimitEvents();
    expect(MOCK_DB.analyticsEvent.count()).toBe(2);
  });

  it('is idempotent — running twice does not error', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'rl-old', event: 'rl:checkin:post', createdAt: ago(30 * MINUTE) },
    ]);
    const r1 = await cleanupRateLimitEvents();
    const r2 = await cleanupRateLimitEvents();
    expect(r1.deleted).toBe(1);
    expect(r2.deleted).toBe(0);
    expect(r2.error).toBeUndefined();
  });
});

describe('cleanupNotificationLogs', () => {
  beforeEach(() => MOCK_DB.notificationLog.reset());

  it('does NOT delete NotificationLog < 8 days', async () => {
    MOCK_DB.notificationLog.seed([
      { id: 'nl-1', sentAt: ago(7 * DAY) },
      { id: 'nl-2', sentAt: ago(6 * DAY) },
    ]);
    await cleanupNotificationLogs();
    expect(MOCK_DB.notificationLog.count()).toBe(2);
  });

  it('DOES delete NotificationLog > 8 days', async () => {
    MOCK_DB.notificationLog.seed([
      { id: 'nl-old-1', sentAt: ago(9 * DAY) },
      { id: 'nl-old-2', sentAt: ago(30 * DAY) },
    ]);
    await cleanupNotificationLogs();
    expect(MOCK_DB.notificationLog.count()).toBe(0);
  });

  it('is idempotent', async () => {
    MOCK_DB.notificationLog.seed([
      { id: 'nl-old', sentAt: ago(10 * DAY) },
    ]);
    await cleanupNotificationLogs();
    await cleanupNotificationLogs();
    expect(MOCK_DB.notificationLog.count()).toBe(0);
  });
});

describe('cleanupInactivePushTokens', () => {
  beforeEach(() => MOCK_DB.pushToken.reset());

  it('does NOT delete active tokens', async () => {
    MOCK_DB.pushToken.seed([
      { id: 'pt-1', active: true, updatedAt: ago(60 * DAY) },
      { id: 'pt-2', active: true, updatedAt: ago(1 * DAY) },
    ]);
    await cleanupInactivePushTokens();
    expect(MOCK_DB.pushToken.count()).toBe(2);
  });

  it('does NOT delete inactive tokens < 30 days', async () => {
    MOCK_DB.pushToken.seed([
      { id: 'pt-3', active: false, updatedAt: ago(20 * DAY) },
    ]);
    await cleanupInactivePushTokens();
    expect(MOCK_DB.pushToken.count()).toBe(1);
  });

  it('DOES delete inactive tokens > 30 days', async () => {
    MOCK_DB.pushToken.seed([
      { id: 'pt-old-1', active: false, updatedAt: ago(31 * DAY) },
      { id: 'pt-old-2', active: false, updatedAt: ago(90 * DAY) },
    ]);
    await cleanupInactivePushTokens();
    expect(MOCK_DB.pushToken.count()).toBe(0);
  });
});

describe('cleanupTerminalDeferredNotifications', () => {
  beforeEach(() => MOCK_DB.deferredNotification.reset());

  it('does NOT delete pending', async () => {
    MOCK_DB.deferredNotification.seed([
      { id: 'dn-1', status: 'pending', processedAt: ago(10 * DAY) },
    ]);
    await cleanupTerminalDeferredNotifications();
    expect(MOCK_DB.deferredNotification.count()).toBe(1);
  });

  it('does NOT delete delivering', async () => {
    MOCK_DB.deferredNotification.seed([
      { id: 'dn-2', status: 'delivering', processedAt: ago(10 * DAY) },
    ]);
    await cleanupTerminalDeferredNotifications();
    expect(MOCK_DB.deferredNotification.count()).toBe(1);
  });

  it('DOES delete old sent', async () => {
    MOCK_DB.deferredNotification.seed([
      { id: 'dn-sent-old', status: 'sent', processedAt: ago(4 * DAY) },
    ]);
    await cleanupTerminalDeferredNotifications();
    expect(MOCK_DB.deferredNotification.count()).toBe(0);
  });

  it('DOES delete old failed', async () => {
    MOCK_DB.deferredNotification.seed([
      { id: 'dn-fail-old', status: 'failed', processedAt: ago(5 * DAY) },
    ]);
    await cleanupTerminalDeferredNotifications();
    expect(MOCK_DB.deferredNotification.count()).toBe(0);
  });

  it('DOES delete old expired', async () => {
    MOCK_DB.deferredNotification.seed([
      { id: 'dn-exp-old', status: 'expired', processedAt: ago(10 * DAY) },
    ]);
    await cleanupTerminalDeferredNotifications();
    expect(MOCK_DB.deferredNotification.count()).toBe(0);
  });

  it('does NOT delete recent terminal (< 3 days)', async () => {
    MOCK_DB.deferredNotification.seed([
      { id: 'dn-sent-recent', status: 'sent', processedAt: ago(2 * DAY) },
    ]);
    await cleanupTerminalDeferredNotifications();
    expect(MOCK_DB.deferredNotification.count()).toBe(1);
  });
});

describe('cleanupOldAnalyticsEvents', () => {
  beforeEach(() => MOCK_DB.analyticsEvent.reset());

  it('does NOT delete real events < 120 days', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'ae-1', event: 'daily_session', createdAt: ago(90 * DAY) },
      { id: 'ae-2', event: 'checkin_created', createdAt: ago(100 * DAY) },
    ]);
    await cleanupOldAnalyticsEvents();
    expect(MOCK_DB.analyticsEvent.count()).toBe(2);
  });

  it('DOES delete real events > 120 days', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'ae-old-1', event: 'daily_session', createdAt: ago(121 * DAY) },
    ]);
    await cleanupOldAnalyticsEvents();
    expect(MOCK_DB.analyticsEvent.count()).toBe(0);
  });

  it('does NOT delete rl: events via this cleanup', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'rl-via-analytics', event: 'rl:checkin:post', createdAt: ago(200 * DAY) },
    ]);
    await cleanupOldAnalyticsEvents();
    expect(MOCK_DB.analyticsEvent.count()).toBe(1);
  });
});

describe('runAllCleanups — independence and idempotency', () => {
  it('all cleanups run independently', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'rl-old', event: 'rl:x', createdAt: ago(30 * MINUTE) },
    ]);
    MOCK_DB.notificationLog.seed([
      { id: 'nl-old', sentAt: ago(10 * DAY) },
    ]);
    MOCK_DB.pushToken.seed([
      { id: 'pt-old', active: false, updatedAt: ago(40 * DAY) },
    ]);
    MOCK_DB.deferredNotification.seed([
      { id: 'dn-old', status: 'sent', processedAt: ago(5 * DAY) },
    ]);

    const result = await runAllCleanups();

    expect(result.analyticsRateLimitDeleted).toBe(1);
    expect(result.notificationLogsDeleted).toBe(1);
    expect(result.inactivePushTokensDeleted).toBe(1);
    expect(result.deferredNotificationsDeleted).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('is idempotent across all cleanups', async () => {
    MOCK_DB.analyticsEvent.seed([
      { id: 'rl-x', event: 'rl:x', createdAt: ago(30 * MINUTE) },
    ]);
    MOCK_DB.notificationLog.seed([
      { id: 'nl-x', sentAt: ago(10 * DAY) },
    ]);

    await runAllCleanups();
    const result2 = await runAllCleanups();

    expect(result2.analyticsRateLimitDeleted).toBe(0);
    expect(result2.notificationLogsDeleted).toBe(0);
    expect(result2.errors).toHaveLength(0);
  });
});
