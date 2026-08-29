/**
 * PROD-03 — Rate Limiter Tests
 * Tests for src/lib/rate-limit.ts
 *
 * Run: bunx vitest run src/__tests__/rate-limit.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We test the rate-limit module by importing it AFTER setting up mocks.
// Since vi.mock is hoisted, we use a factory that references mock functions
// defined with vi.fn() inside the factory itself.

let _mockCount: ReturnType<typeof vi.fn>;
let _mockCreate: ReturnType<typeof vi.fn>;

// This mock factory is hoisted by vitest, so we use module-scoped
// variables that get assigned in beforeEach.
vi.mock('@/lib/db', () => ({
  get db() {
    return {
      analyticsEvent: {
        get count() { return _mockCount; },
        get create() { return _mockCreate; },
      },
    };
  },
}));

import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';

describe('rateLimit()', () => {
  beforeEach(() => {
    _mockCount = vi.fn();
    _mockCreate = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: Request allowed when under limit ──
  it('allows request when count is below maxRequests', async () => {
    _mockCount.mockResolvedValue(0);
    _mockCreate.mockResolvedValue({});

    const result = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result.limited).toBe(false);
    expect(result.current).toBe(1);
    expect(_mockCount).toHaveBeenCalledTimes(1);
    expect(_mockCreate).toHaveBeenCalledTimes(1);
  });

  // ── Test 2: Request blocked when at limit ──
  it('blocks request when count equals maxRequests', async () => {
    _mockCount.mockResolvedValue(5);

    const result = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result.limited).toBe(true);
    expect(result.current).toBe(5);
    expect(result.resetAt).toBeDefined();
    expect(_mockCreate).not.toHaveBeenCalled();
  });

  // ── Test 3: Request blocked when over limit ──
  it('blocks request when count exceeds maxRequests', async () => {
    _mockCount.mockResolvedValue(100);

    const result = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result.limited).toBe(true);
  });

  // ── Test 4: Fail-safe on DB error ──
  it('allows request when DB count query fails (fail-safe)', async () => {
    _mockCount.mockRejectedValue(new Error('Connection refused'));

    const result = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result.limited).toBe(false);
    expect(result.current).toBeUndefined();
  });

  // ── Test 5: Fail-safe on DB create error ──
  it('allows request even when DB create fails (fire-and-forget)', async () => {
    _mockCount.mockResolvedValue(0);
    _mockCreate.mockRejectedValue(new Error('Write failed'));

    const result = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result.limited).toBe(false);
    expect(result.current).toBe(1);
  });

  // ── Test 6: Uses correct event key prefix ──
  it('uses rl: prefix in the event key', async () => {
    _mockCount.mockResolvedValue(0);
    _mockCreate.mockResolvedValue({});

    await rateLimit('user-1', 'finance:post', RATE_LIMITS['finance:post']);

    const callArgs = _mockCount.mock.calls[0][0];
    expect(callArgs.where.userId).toBe('user-1');
    expect(callArgs.where.event).toBe('rl:finance:post');
    expect(callArgs.where.createdAt.gte).toBeInstanceOf(Date);
  });

  // ── Test 7: Records event with correct data ──
  it('records analytics event with rl: prefix and null properties', async () => {
    _mockCount.mockResolvedValue(0);
    _mockCreate.mockResolvedValue({});

    await rateLimit('user-1', 'meditation:post', RATE_LIMITS['meditation:post']);

    expect(_mockCreate).toHaveBeenCalledWith({
      data: {
        event: 'rl:meditation:post',
        userId: 'user-1',
        properties: null,
      },
    });
  });

  // ── Test 8: Different users have independent limits ──
  it('does not interfere between different users', async () => {
    _mockCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(10);
    _mockCreate.mockResolvedValue({});

    const result1 = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);
    const result2 = await rateLimit('user-2', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result1.limited).toBe(false);
    expect(result2.limited).toBe(true);
  });

  // ── Test 9: Different endpoints have independent limits ──
  it('does not interfere between different endpoints for same user', async () => {
    _mockCount
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    _mockCreate.mockResolvedValue({});

    const r1 = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);
    const r2 = await rateLimit('user-1', 'meditation:post', RATE_LIMITS['meditation:post']);

    expect(r1.limited).toBe(false);
    expect(r2.limited).toBe(false);
  });

  // ── Test 10: Window start is calculated correctly ──
  it('passes correct window start to DB query', async () => {
    _mockCount.mockResolvedValue(0);
    _mockCreate.mockResolvedValue({});

    const config = { maxRequests: 5, windowMs: 60_000 };
    await rateLimit('user-1', 'checkin:post', config);

    const callArgs = _mockCount.mock.calls[0][0];
    const windowStart = callArgs.where.createdAt.gte;
    const now = Date.now();
    expect(now - windowStart.getTime()).toBeGreaterThan(59_000);
    expect(now - windowStart.getTime()).toBeLessThan(61_000);
  });

  // ── Test 11: resetAt is set when limited ──
  it('sets resetAt when request is limited', async () => {
    _mockCount.mockResolvedValue(5);

    const config = { maxRequests: 5, windowMs: 60_000 };
    const before = Date.now();
    const result = await rateLimit('user-1', 'checkin:post', config);
    const after = Date.now();

    expect(result.limited).toBe(true);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + config.windowMs);
    expect(result.resetAt).toBeLessThanOrEqual(after + config.windowMs);
  });

  // ── Test 12: Stripe checkout has 5-minute window ──
  it('stripe:checkout uses 5-minute window with 3 max requests', async () => {
    expect(RATE_LIMITS['stripe:checkout'].maxRequests).toBe(3);
    expect(RATE_LIMITS['stripe:checkout'].windowMs).toBe(300_000);
  });

  // ── Test 13: All RATE_LIMITS keys have valid config ──
  it('every RATE_LIMITS entry has positive maxRequests and windowMs', () => {
    for (const [key, config] of Object.entries(RATE_LIMITS)) {
      expect(config.maxRequests).toBeGreaterThan(0);
      expect(config.windowMs).toBeGreaterThan(0);
      expect(typeof config.maxRequests).toBe('number');
      expect(typeof config.windowMs).toBe('number');
    }
  });

  // ── Test 14: Boundary — exactly at limit minus 1 ──
  it('allows request when count is maxRequests - 1', async () => {
    _mockCount.mockResolvedValue(4);
    _mockCreate.mockResolvedValue({});

    const result = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result.limited).toBe(false);
    expect(result.current).toBe(5);
  });

  // ── Test 15: Boundary — exactly at limit ──
  it('blocks request when count is exactly maxRequests', async () => {
    _mockCount.mockResolvedValue(5);

    const result = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);

    expect(result.limited).toBe(true);
  });

  // ── Test 16: Multiple rapid requests increment correctly ──
  it('tracks increments across multiple requests', async () => {
    _mockCreate.mockResolvedValue({});

    const results = [];
    for (let i = 0; i < 5; i++) {
      _mockCount.mockResolvedValueOnce(i);
      const r = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);
      results.push(r);
    }

    results.forEach((r, i) => {
      expect(r.limited).toBe(false);
      expect(r.current).toBe(i + 1);
    });

    _mockCount.mockResolvedValue(5);
    const blocked = await rateLimit('user-1', 'checkin:post', RATE_LIMITS['checkin:post']);
    expect(blocked.limited).toBe(true);
  });

  // ── Test 17: analytics:track limit config exists ──
  it('analytics:track limit config exists and is reasonable', () => {
    const config = RATE_LIMITS['analytics:track'];
    expect(config.maxRequests).toBe(30);
    expect(config.windowMs).toBe(60_000);
  });

  // ── Test 18: Mentor limits are NOT in RATE_LIMITS ──
  it('does not define separate rate limits for Mentor message/conversation creation', () => {
    expect(RATE_LIMITS).not.toHaveProperty('mentor:message');
    expect(RATE_LIMITS).not.toHaveProperty('mentor:conversation');
  });
});
