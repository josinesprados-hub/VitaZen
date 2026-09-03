/**
 * FASE 12-P8 — PROD-04-R: Session Read-Only Tests
 *
 * Verifies that GET /api/auth/session is a pure read operation:
 * - No db.user.update() calls
 * - No Stripe customer.update() calls
 * - Returns correct session data
 * - Falls back to email lookup when firebaseUid doesn't match
 *
 * Also verifies that POST /api/auth/sync still performs the
 * necessary synchronizations (firebaseUid, emailVerified, email, Stripe).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock setup (hoisted) ────────────────────────────────────

const MOCK_STRIPE = vi.hoisted(() => {
  const customers = {
    update: vi.fn().mockResolvedValue({ id: 'cus_test' }),
  };
  return { customers, _instance: { customers } };
});

vi.mock('@/lib/stripe', () => ({
  stripe: MOCK_STRIPE._instance,
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {
    verifyIdToken: vi.fn().mockResolvedValue(null),
    generateEmailVerificationLink: vi.fn().mockResolvedValue('https://example.com'),
  },
}));

vi.mock('@/lib/emails/sender', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendVerifyEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/analytics-server', () => ({
  trackEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/observability/api-timing', () => ({
  withTiming: (_name: string, fn: Function) => fn,
}));

vi.mock('@/lib/observability/server-logger', () => ({
  serverLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    apiError: vi.fn(),
  },
}));

vi.mock('@/lib/observability/server-tracking', () => ({
  trackAuthSyncFailure: vi.fn(),
}));

const MOCK_USER_DATA = {
  id: 'user-1',
  firebaseUid: 'firebase-uid-1',
  email: 'user@test.com',
  name: 'Test User',
  plan: 'free',
  avatarUrl: null,
  country: null,
  city: null,
  age: null,
  bio: null,
  weeklyEmailSummary: false,
  dailyReminders: true,
  privacyStatsVisible: true,
  emailVerified: false,
  welcomeEmailSent: true,
  createdAt: new Date('2025-01-01'),
  onboardingCompleted: true,
  stripeCustomerId: 'cus_test',
};

const { MOCK_DB, mockUserFindUnique } = vi.hoisted(() => {
  let findUniqueImpl: (...args: unknown[]) => unknown;
  const findUniqueMock = vi.fn();
  findUniqueMock.mockImplementation((...args: unknown[]) =>
    findUniqueImpl ? findUniqueImpl(...args) : Promise.resolve(null),
  );

  const MOCK_DB = {
    user: {
      findUnique: findUniqueMock,
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return { MOCK_DB, mockUserFindUnique: findUniqueMock, _setImpl: (fn: typeof findUniqueImpl) => { findUniqueImpl = fn; } };
});

vi.mock('@/lib/db', () => ({ db: MOCK_DB }));

const MOCK_TOKEN = {
  uid: 'firebase-uid-1',
  email: 'user@test.com',
  email_verified: true,
  name: 'Test User',
};

const { verifyFirebaseTokenMock } = vi.hoisted(() => ({
  verifyFirebaseTokenMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  verifyFirebaseToken: (...args: unknown[]) => verifyFirebaseTokenMock(...args),
}));

// Import the route handlers AFTER mocks are set up
// We'll test by importing the route modules

// ─── Helper: build mock request ─────────────────────────────

function makeRequest(token?: string): Request {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request('http://localhost/api/auth/session', { headers });
}

// ─── Tests ───────────────────────────────────────────────────

describe('PROD-04-R: GET /api/auth/session is read-only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyFirebaseTokenMock.mockResolvedValue(MOCK_TOKEN);
  });

  it('returns user data without any db.user.update() call', async () => {
    // Setup: user found by firebaseUid
    mockUserFindUnique.mockImplementation(async (opts: Record<string, unknown>) => {
      const where = opts.where as Record<string, unknown>;
      if (where?.firebaseUid) {
        return {
          ...MOCK_USER_DATA,
          aiUsage: { count: 5, resetAt: new Date('2025-12-31') },
          subscriptions: [{
            id: 'sub-1',
            stripeSubscriptionId: 'sub_stripe_1',
            stripePriceId: 'price_1',
            status: 'active',
            currentPeriodStart: '2025-01-01',
            currentPeriodEnd: '2026-01-01',
            cancelAtPeriodEnd: false,
          }],
        };
      }
      return null;
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest('valid-token') as any);
    const data = await response.json();

    // Verify response
    expect(response.status).toBe(200);
    expect(data.user.id).toBe('user-1');
    expect(data.user.email).toBe('user@test.com');
    expect(data.user.plan).toBe('free');
    expect(data.user.aiUsage).toEqual({ count: 5, resetAt: '2025-12-31T00:00:00.000Z' });
    expect(data.user.subscription).toBeTruthy();

    // CRITICAL: No writes
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
  });

  it('returns 401 when no token provided', async () => {
    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest() as any);
    expect(response.status).toBe(401);
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
  });

  it('returns 401 when token is invalid', async () => {
    verifyFirebaseTokenMock.mockResolvedValue(null);
    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest('bad-token') as any);
    expect(response.status).toBe(401);
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
  });

  it('returns 404 when user not found', async () => {
    mockUserFindUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest('valid-token') as any);
    expect(response.status).toBe(404);
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
  });

  it('does NOT sync firebaseUid even when found via email fallback', async () => {
    // User NOT found by firebaseUid, but found by email
    let callCount = 0;
    mockUserFindUnique.mockImplementation(async (opts: Record<string, unknown>) => {
      const where = opts.where as Record<string, unknown>;
      callCount++;
      if (callCount === 1 && where?.firebaseUid) {
        // First call: not found by firebaseUid
        return null;
      }
      if (callCount === 2 && where?.email) {
        // Second call: found by email, with DIFFERENT firebaseUid
        return {
          ...MOCK_USER_DATA,
          firebaseUid: 'old-firebase-uid', // mismatch!
          emailVerified: true,
          aiUsage: null,
          subscriptions: [],
        };
      }
      return null;
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest('valid-token') as any);
    expect(response.status).toBe(200);

    // CRITICAL: No update to fix firebaseUid mismatch
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
  });

  it('does NOT sync emailVerified even when token says verified but DB says false', async () => {
    mockUserFindUnique.mockResolvedValue({
      ...MOCK_USER_DATA,
      emailVerified: false, // DB says not verified
      aiUsage: null,
      subscriptions: [],
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest('valid-token') as any);
    expect(response.status).toBe(200);

    // Response reflects DB state (stale), but no write occurs
    const data = await response.json();
    expect(data.user.emailVerified).toBe(false);
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
  });

  it('does NOT sync email or call Stripe even when email changed in Firebase', async () => {
    // Override token to have a different email
    verifyFirebaseTokenMock.mockResolvedValue({
      ...MOCK_TOKEN,
      email: 'newemail@test.com',
    });

    mockUserFindUnique.mockResolvedValue({
      ...MOCK_USER_DATA,
      email: 'user@test.com', // Old email in DB
      stripeCustomerId: 'cus_test',
      aiUsage: null,
      subscriptions: [],
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest('valid-token') as any);
    expect(response.status).toBe(200);

    // CRITICAL: No DB update for email
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
    // CRITICAL: No Stripe call
    expect(MOCK_STRIPE.customers.update).not.toHaveBeenCalled();
  });

  it('returns correct session shape with all expected fields', async () => {
    mockUserFindUnique.mockResolvedValue({
      ...MOCK_USER_DATA,
      emailVerified: true,
      aiUsage: { count: 3, resetAt: new Date('2025-06-15') },
      subscriptions: [],
    });

    const { GET } = await import('@/app/api/auth/session/route');
    const response = await GET(makeRequest('valid-token') as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    const u = data.user;

    // Verify all fields present
    expect(u.id).toBe('user-1');
    expect(u.firebaseUid).toBe('firebase-uid-1');
    expect(u.email).toBe('user@test.com');
    expect(u.name).toBe('Test User');
    expect(u.plan).toBe('free');
    expect(u.avatarUrl).toBeNull();
    expect(u.country).toBeNull();
    expect(u.city).toBeNull();
    expect(u.age).toBeNull();
    expect(u.bio).toBeNull();
    expect(u.weeklyEmailSummary).toBe(false);
    expect(u.dailyReminders).toBe(true);
    expect(u.privacyStatsVisible).toBe(true);
    expect(u.emailVerified).toBe(true);
    expect(u.welcomeEmailSent).toBe(true);
    expect(u.onboardingCompleted).toBe(true);
    expect(u.aiUsage).toEqual({ count: 3, resetAt: '2025-06-15T00:00:00.000Z' });
    expect(u.subscription).toBeNull();

    // Verify no unexpected fields (like stripeCustomerId leaking)
    expect(u.stripeCustomerId).toBeUndefined();

    // No writes
    expect(MOCK_DB.user.update).not.toHaveBeenCalled();
  });
});

describe('PROD-04-R: POST /api/auth/sync still performs synchronizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyFirebaseTokenMock.mockResolvedValue(MOCK_TOKEN);
  });

  it('syncs emailVerified when token verified but DB not', async () => {
    mockUserFindUnique.mockResolvedValue({
      ...MOCK_USER_DATA,
      emailVerified: false,
      subscriptions: [],
    });

    MOCK_DB.user.update.mockResolvedValue({ ...MOCK_USER_DATA, emailVerified: true });

    const { POST } = await import('@/app/api/auth/sync/route');
    const request = new Request('http://localhost/api/auth/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);

    // Verify emailVerified sync happened
    expect(MOCK_DB.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { emailVerified: true },
      }),
    );
  });

  it('syncs firebaseUid when found by email with mismatch', async () => {
    let callCount = 0;
    mockUserFindUnique.mockImplementation(async (opts: Record<string, unknown>) => {
      const where = opts.where as Record<string, unknown>;
      callCount++;
      if (callCount === 1 && where?.firebaseUid) return null;
      if (callCount === 2 && where?.email) {
        return {
          ...MOCK_USER_DATA,
          firebaseUid: 'old-uid',
          emailVerified: true,
          subscriptions: [],
        };
      }
      return null;
    });

    MOCK_DB.user.update.mockResolvedValue({});

    const { POST } = await import('@/app/api/auth/sync/route');
    const request = new Request('http://localhost/api/auth/sync', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);

    // Verify firebaseUid sync happened
    expect(MOCK_DB.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { firebaseUid: 'firebase-uid-1' },
      }),
    );
  });

  it('requires authentication — returns 401 without token', async () => {
    const { POST } = await import('@/app/api/auth/sync/route');
    const request = new Request('http://localhost/api/auth/sync', {
      method: 'POST',
    });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
  });
});
