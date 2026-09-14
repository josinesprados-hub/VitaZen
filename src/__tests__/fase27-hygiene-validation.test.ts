// ═════════════════════════════════════════════════════════════════════
// FASE 27 — HIGIENE MENOR: H-01 · S-1 · V-1 · V-2 · V-3 · A-2
// ═════════════════════════════════════════════════════════════════════
//
// Regression + behavior tests for the six FASE 27 hygiene fixes:
//
//   H-01  /api/analytics/track — anonymous requests are rate-limited by
//         client IP (N-06 pattern from auth/reset-password); authenticated
//         per-user limit untouched; whitelist + 2KB body cap untouched.
//   S-1   stripe webhook checkout.session.completed — grants PREMIUM only
//         when the signature-verified priceId matches PLANS.PREMIUM.priceId;
//         missing/mismatched price → fail-closed (no plan change, no
//         subscription record, claim stays consumed for idempotency).
//   V-1   /api/notifications/register-token — token ≤ 4096, platform enum
//         (web|ios|android), userAgent ≤ 512; invalid input → 400.
//   V-2   /api/ai/threads PATCH — title must be string, archived must be
//         boolean when present; invalid types → 400 (not 500).
//   V-3   /api/finance — amount finite/positive/≤ 1e9 (POST+PUT); PUT date
//         type-checked before startOfMadridDay; invalid input → 400.
//   A-2   PLANS no longer exports aiMessagesLimit (dead constant with
//         drifting value) — asserted via module import.
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Shared module mocks ─────────────────────────────────────────────

// rate-limit: keep the REAL RATE_LIMITS + rateLimitedResponse + getClientIp;
// replace only rateLimit() so tests can simulate limited/not-limited and
// assert the exact (key, config) each route uses.
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return {
    ...actual,
    rateLimit: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
  getAuthUserBasic: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    analyticsEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    pushToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
    },
    notificationPreference: {
      upsert: vi.fn(),
    },
    aIThread: {
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    financeLog: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    empireProgress: {
      upsert: vi.fn(),
    },
    stripeEventLog: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Stripe mock (webhook S-1). PLANS.PREMIUM is a getter so the "price config
// unset" test can swap the value per-test (the getter body only runs when the
// route reads it — i.e. at request time, after beforeEach has assigned it).
let _plansPremium: { priceId: string | undefined } = { priceId: 'price_premium_1' };

vi.mock('@/lib/stripe', () => ({
  get PLANS() {
    return { PREMIUM: _plansPremium };
  },
  stripe: {
    webhooks: { constructEvent: vi.fn() },
    checkout: { sessions: { listLineItems: vi.fn() } },
    subscriptions: { retrieve: vi.fn() },
    customers: { retrieve: vi.fn() },
  },
}));

vi.mock('@/lib/emails/sender', () => ({
  sendSubscriptionConfirmedEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/analytics-server', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/observability/server-logger', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/achievements', () => ({
  evaluateAchievements: vi.fn(async () => []),
}));
vi.mock('@/lib/widgets/triggers', () => ({
  onFinanceChange: vi.fn(),
}));

// ─── Imports under test (after mocks) ────────────────────────────────

import { POST as analyticsPost } from '@/app/api/analytics/track/route';
import { POST as registerTokenPost } from '@/app/api/notifications/register-token/route';
import { PATCH as threadsPatch } from '@/app/api/ai/threads/route';
import { POST as financePost, PUT as financePut } from '@/app/api/finance/route';
import { POST as webhookPost } from '@/app/api/stripe/webhook/route';

import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getAuthUser, getAuthUserBasic } from '@/lib/auth';
import { db } from '@/lib/db';
import { stripe, PLANS } from '@/lib/stripe';
import { serverLog } from '@/lib/observability/server-logger';

const mockRateLimit = vi.mocked(rateLimit);
const mockGetAuthUser = vi.mocked(getAuthUser);
const mockGetAuthUserBasic = vi.mocked(getAuthUserBasic);

// ─── Request helpers ─────────────────────────────────────────────────

function jsonRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return {
    headers: new Headers(headers),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as NextRequest;
}

const P2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

const VALID_TOKEN = 'fcm_token_' + 'a'.repeat(120);

// ═════════════════════════════════════════════════════════════════════
// H-01 — /api/analytics/track
// ═════════════════════════════════════════════════════════════════════

describe('H-01 — analytics/track anonymous IP rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-arm defaults (clearAllMocks wipes implementations — FASE 25 lesson).
    mockRateLimit.mockResolvedValue({ limited: false, current: 1, resetAt: Date.now() + 60_000 });
    mockGetAuthUser.mockResolvedValue(null);
    vi.mocked(db.analyticsEvent.create).mockResolvedValue({ id: 'evt_1' } as never);
    vi.mocked(db.analyticsEvent.findFirst).mockResolvedValue(null);
  });

  it('1. authenticated user → existing per-user limit intact (same key + config)', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user_1', plan: 'FREE' } as never);

    const res = await analyticsPost(
      jsonRequest({ event: 'recap_opened' }, { Authorization: 'Bearer valid-token' }),
    );

    expect(res.status).toBe(200);
    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    expect(mockRateLimit).toHaveBeenCalledWith('user_1', 'analytics:track', RATE_LIMITS['analytics:track']);
    expect(db.analyticsEvent.create).toHaveBeenCalledTimes(1);
  });

  it('2. anonymous request with platform IP header → rate limited by IP with the ip config', async () => {
    const res = await analyticsPost(
      jsonRequest({ event: 'recap_opened' }, { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }),
    );

    expect(res.status).toBe(200);
    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    // Leftmost XFF entry (platform-managed), dedicated ip key, dedicated config.
    expect(mockRateLimit).toHaveBeenCalledWith('203.0.113.7', 'analytics:track:ip', RATE_LIMITS['analytics:track:ip']);
    expect(db.analyticsEvent.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getAuthUser)).not.toHaveBeenCalled();
  });

  it('3. anonymous over the IP limit → 429 with Retry-After, nothing stored', async () => {
    mockRateLimit.mockResolvedValue({ limited: true, current: 31, resetAt: Date.now() + 45_000 });

    const res = await analyticsPost(
      jsonRequest({ event: 'recap_opened' }, { 'x-forwarded-for': '198.51.100.9' }),
    );

    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    const body = await res.json();
    expect(body.error).toBe('Too many requests');
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('4. authenticated user over their limit → 429 (existing behavior preserved)', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user_1', plan: 'FREE' } as never);
    mockRateLimit.mockResolvedValue({ limited: true, current: 31, resetAt: Date.now() + 30_000 });

    const res = await analyticsPost(
      jsonRequest({ event: 'recap_opened' }, { Authorization: 'Bearer valid-token' }),
    );

    expect(res.status).toBe(429);
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('5. event whitelist intact → unknown event 400 before any rate limiting', async () => {
    const res = await analyticsPost(
      jsonRequest({ event: 'page_view' }, { 'x-forwarded-for': '203.0.113.7' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid event');
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('6. 2KB body cap intact (M-05) → 413 before any rate limiting', async () => {
    const bigBody = JSON.stringify({ event: 'recap_opened', properties: { pad: 'x'.repeat(2100) } });
    const res = await analyticsPost({
      headers: new Headers({ 'x-forwarded-for': '203.0.113.7' }),
      text: async () => bigBody,
    } as unknown as NextRequest);

    expect(res.status).toBe(413);
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });

  it('7. anonymous without IP header (local dev) → tracked, IP limit skipped (documented fail-open)', async () => {
    const res = await analyticsPost(jsonRequest({ event: 'recap_opened' }));

    expect(res.status).toBe(200);
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(db.analyticsEvent.create).toHaveBeenCalledTimes(1);
  });

  it('8. authenticated daily_session dedup still works (regression guard)', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user_1', plan: 'FREE' } as never);
    vi.mocked(db.analyticsEvent.findFirst).mockResolvedValue({ id: 'existing' } as never);

    const res = await analyticsPost(
      jsonRequest({ event: 'daily_session' }, { Authorization: 'Bearer valid-token' }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracked).toBe(false);
    expect(body.reason).toBe('already_tracked_today');
    expect(db.analyticsEvent.create).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// V-1 — /api/notifications/register-token
// ═════════════════════════════════════════════════════════════════════

describe('V-1 — register-token validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ limited: false, current: 1, resetAt: Date.now() + 60_000 });
    mockGetAuthUserBasic.mockResolvedValue({ id: 'user_1', plan: 'FREE' } as never);
    vi.mocked(db.pushToken.findUnique).mockResolvedValue(null);
    vi.mocked(db.pushToken.count).mockResolvedValue(0);
    vi.mocked(db.pushToken.upsert).mockResolvedValue({ id: 'pt_1' } as never);
    vi.mocked(db.notificationPreference.upsert).mockResolvedValue({} as never);
  });

  const auth = { Authorization: 'Bearer valid-token' };

  it('1. valid token + platform web → 200, upsert stores platform', async () => {
    const res = await registerTokenPost(
      jsonRequest({ token: VALID_TOKEN, platform: 'web', userAgent: 'Mozilla/5.0' }, auth),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(db.pushToken.upsert).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(db.pushToken.upsert).mock.calls[0][0];
    expect(arg.create.platform).toBe('web');
    expect(arg.create.token).toBe(VALID_TOKEN);
  });

  it('2. platform ios/android (enum) accepted', async () => {
    const res = await registerTokenPost(
      jsonRequest({ token: VALID_TOKEN, platform: 'android' }, auth),
    );
    expect(res.status).toBe(200);
  });

  it('3. platform outside the enum → 400, no write', async () => {
    const res = await registerTokenPost(
      jsonRequest({ token: VALID_TOKEN, platform: 'windows' }, auth),
    );

    expect(res.status).toBe(400);
    expect(db.pushToken.upsert).not.toHaveBeenCalled();
  });

  it('4. platform non-string → 400, no write', async () => {
    const res = await registerTokenPost(
      jsonRequest({ token: VALID_TOKEN, platform: 42 }, auth),
    );

    expect(res.status).toBe(400);
    expect(db.pushToken.upsert).not.toHaveBeenCalled();
  });

  it('5. token > 4096 chars → 400, no write', async () => {
    const res = await registerTokenPost(
      jsonRequest({ token: 'x'.repeat(4097) }, auth),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('FCM token too long');
    expect(db.pushToken.upsert).not.toHaveBeenCalled();
  });

  it('6. token exactly 4096 chars → accepted (generous bound above real FCM size)', async () => {
    const res = await registerTokenPost(
      jsonRequest({ token: 'y'.repeat(4096) }, auth),
    );
    expect(res.status).toBe(200);
  });

  it('7. userAgent > 512 chars → 400, no write', async () => {
    const res = await registerTokenPost(
      jsonRequest({ token: VALID_TOKEN, userAgent: 'u'.repeat(513) }, auth),
    );

    expect(res.status).toBe(400);
    expect(db.pushToken.upsert).not.toHaveBeenCalled();
  });

  it('8. omitted platform/userAgent keep the old defaults (web / null)', async () => {
    const res = await registerTokenPost(jsonRequest({ token: VALID_TOKEN }, auth));

    expect(res.status).toBe(200);
    const arg = vi.mocked(db.pushToken.upsert).mock.calls[0][0];
    expect(arg.create.platform).toBe('web');
    expect(arg.create.userAgent).toBeNull();
  });

  it('9. auth + rate limit still enforced', async () => {
    const noAuth = await registerTokenPost(jsonRequest({ token: VALID_TOKEN }));
    expect(noAuth.status).toBe(401);

    const withAuth = await registerTokenPost(
      jsonRequest({ token: VALID_TOKEN, platform: 'web' }, auth),
    );
    expect(withAuth.status).toBe(200);
    expect(mockRateLimit).toHaveBeenCalledWith('user_1', 'notifications:register', RATE_LIMITS['notifications:register']);
  });
});

// ═════════════════════════════════════════════════════════════════════
// V-2 — /api/ai/threads PATCH
// ═════════════════════════════════════════════════════════════════════

describe('V-2 — threads PATCH type validation', () => {
  const auth = { Authorization: 'Bearer valid-token' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ limited: false, current: 1, resetAt: Date.now() + 60_000 });
    mockGetAuthUser.mockResolvedValue({ id: 'user_1', plan: 'FREE' } as never);
    vi.mocked(db.aIThread.findFirst).mockResolvedValue({ id: 'th_1', userId: 'user_1', title: 'Old', archived: false } as never);
    vi.mocked(db.aIThread.update).mockResolvedValue({ id: 'th_1' } as never);
  });

  it('1. valid title → update called with the (sliced) title', async () => {
    const res = await threadsPatch(jsonRequest({ threadId: 'th_1', title: 'Nueva conversación' }, auth));

    expect(res.status).toBe(200);
    expect(db.aIThread.update).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(db.aIThread.update).mock.calls[0][0];
    expect(arg.data.title).toBe('Nueva conversación');
  });

  it('2. title non-string (number) → 400, never reaches Prisma', async () => {
    const res = await threadsPatch(jsonRequest({ threadId: 'th_1', title: 123 }, auth));

    expect(res.status).toBe(400);
    expect(db.aIThread.findFirst).not.toHaveBeenCalled();
    expect(db.aIThread.update).not.toHaveBeenCalled();
  });

  it('3. title null → 400 (was a TypeError/500 before V-2)', async () => {
    const res = await threadsPatch(jsonRequest({ threadId: 'th_1', title: null }, auth));

    expect(res.status).toBe(400);
    expect(db.aIThread.update).not.toHaveBeenCalled();
  });

  it('4. archived non-boolean (string "true") → 400', async () => {
    const res = await threadsPatch(jsonRequest({ threadId: 'th_1', archived: 'true' }, auth));

    expect(res.status).toBe(400);
    expect(db.aIThread.update).not.toHaveBeenCalled();
  });

  it('5. valid archived → update called with boolean', async () => {
    const res = await threadsPatch(jsonRequest({ threadId: 'th_1', archived: true }, auth));

    expect(res.status).toBe(200);
    const arg = vi.mocked(db.aIThread.update).mock.calls[0][0];
    expect(arg.data.archived).toBe(true);
  });

  it('6. thread inexistente/ajeno keeps 404 (valid payload, ownership intact)', async () => {
    vi.mocked(db.aIThread.findFirst).mockResolvedValue(null);

    const res = await threadsPatch(jsonRequest({ threadId: 'th_other', title: 'Hi' }, auth));

    expect(res.status).toBe(404);
    expect(db.aIThread.update).not.toHaveBeenCalled();
  });

  it('7. existing length limit kept: long title still sliced to 100', async () => {
    const longTitle = 't'.repeat(250);
    const res = await threadsPatch(jsonRequest({ threadId: 'th_1', title: longTitle }, auth));

    expect(res.status).toBe(200);
    const arg = vi.mocked(db.aIThread.update).mock.calls[0][0];
    expect((arg.data.title as string).length).toBe(100);
  });

  it('8. rate limit still applied', async () => {
    await threadsPatch(jsonRequest({ threadId: 'th_1', archived: false }, auth));
    expect(mockRateLimit).toHaveBeenCalledWith('user_1', 'ai:threads:patch', RATE_LIMITS['ai:threads:patch']);
  });
});

// ═════════════════════════════════════════════════════════════════════
// S-1 — stripe webhook checkout.session.completed price verification
// ═════════════════════════════════════════════════════════════════════

describe('S-1 — webhook grants PREMIUM only for the configured price', () => {
  const signedHeaders = { 'stripe-signature': 'valid-signature' };
  // Captured transaction mock — the webhook's transaction callback returns
  // nothing, so the tx must be captured from the implementation, not from
  // mock.results (which records the callback's return value).
  let capturedTx: Record<string, any>;

  function checkoutEvent(userId: string | null, subscriptionId: string | null = 'sub_1', eventId = 'evt_checkout_1') {
    return {
      id: eventId,
      type: 'checkout.session.completed',
      livemode: true,
      data: {
        object: {
          id: 'cs_1',
          customer: 'cus_1',
          subscription: subscriptionId,
          metadata: userId ? { userId } : {},
        },
      },
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    _plansPremium = { priceId: 'price_premium_1' };

    const savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    (webhookPost as unknown as { __envSecret?: string }).__envSecret = savedSecret;

    vi.mocked(db.stripeEventLog.create).mockResolvedValue({} as never);
    vi.mocked(db.stripeEventLog.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      capturedTx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        subscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn().mockResolvedValue({}),
          upsert: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({}),
        },
        user: {
          update: vi.fn().mockResolvedValue({}),
        },
      } as never;
      return fn(capturedTx as never);
    });
    vi.mocked(db.user.findUnique).mockResolvedValue({ id: 'user_1', email: 'u@vz.cc', name: 'U' } as never);

    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(((((body: string) => JSON.parse(body))) as never));
    vi.mocked(stripe.checkout.sessions.listLineItems).mockResolvedValue({ data: [{ price: { id: 'price_premium_1' } }] } as never);
    vi.mocked(stripe.subscriptions.retrieve).mockResolvedValue({
      items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
    } as never);
    vi.mocked(stripe.customers.retrieve).mockResolvedValue({ metadata: { userId: 'user_1' } } as never);
  });

  afterEach(() => {
    const saved = (webhookPost as unknown as { __envSecret?: string }).__envSecret;
    if (saved === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = saved;
  });

  it('1. matching priceId → PREMIUM granted, subscription upserted, event signed', async () => {
    const res = await webhookPost(jsonRequest(checkoutEvent('user_1'), signedHeaders));

    expect(res.status).toBe(200);
    // constructEvent ran → the event went through signature verification.
    expect(stripe.webhooks.constructEvent).toHaveBeenCalled();

    expect(capturedTx.user.update).toHaveBeenCalledTimes(1);
    expect(capturedTx.user.update.mock.calls[0][0].data.plan).toBe('PREMIUM');

    expect(capturedTx.subscription.upsert).toHaveBeenCalledTimes(1);
    expect(capturedTx.subscription.upsert.mock.calls[0][0].create.stripePriceId).toBe('price_premium_1');
  });

  it('2. different priceId → fail-closed: no plan change, no subscription record', async () => {
    vi.mocked(stripe.checkout.sessions.listLineItems).mockResolvedValue({ data: [{ price: { id: 'price_evil_9' } }] } as never);

    const res = await webhookPost(jsonRequest(checkoutEvent('user_1'), signedHeaders));

    expect(res.status).toBe(200);
    expect(capturedTx.user.update).not.toHaveBeenCalled();
    expect(capturedTx.subscription.upsert).not.toHaveBeenCalled();
    expect(capturedTx.subscription.create).not.toHaveBeenCalled();
    // Logged for manual review.
    expect(vi.mocked(serverLog.error)).toHaveBeenCalled();
  });

  it('3. missing priceId (empty line items) → fail-closed', async () => {
    vi.mocked(stripe.checkout.sessions.listLineItems).mockResolvedValue({ data: [] } as never);

    const res = await webhookPost(jsonRequest(checkoutEvent('user_1'), signedHeaders));

    expect(res.status).toBe(200);
    expect(capturedTx.user.update).not.toHaveBeenCalled();
  });

  it('4. PLANS.PREMIUM.priceId unset (config missing) → fail-closed for any price', async () => {
    _plansPremium = { priceId: undefined };

    const res = await webhookPost(jsonRequest(checkoutEvent('user_1'), signedHeaders));

    expect(res.status).toBe(200);
    expect(capturedTx.user.update).not.toHaveBeenCalled();
  });

  it('5. idempotency intact: duplicated event (claim P2002) is deduplicated without writes', async () => {
    vi.mocked(db.stripeEventLog.create).mockRejectedValue(P2002());

    const res = await webhookPost(jsonRequest(checkoutEvent('user_1'), signedHeaders));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduplicated).toBe(true);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('6. rollback of the claim preserved: handler error → claim deleted → 500', async () => {
    vi.mocked(stripe.checkout.sessions.listLineItems).mockRejectedValue(new Error('stripe down'));

    const res = await webhookPost(jsonRequest(checkoutEvent('user_1'), signedHeaders));

    expect(res.status).toBe(500);
    expect(db.stripeEventLog.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'evt_checkout_1' } });
  });

  it('7. one-time payment (no subscription id) with matching price → synthetic record still created', async () => {
    const res = await webhookPost(jsonRequest(checkoutEvent('user_1', null), signedHeaders));

    expect(res.status).toBe(200);
    expect(capturedTx.subscription.create).toHaveBeenCalledTimes(1);
    expect(capturedTx.subscription.create.mock.calls[0][0].data.stripeSubscriptionId).toBe('checkout_cs_1');
    expect(capturedTx.subscription.create.mock.calls[0][0].data.stripePriceId).toBe('price_premium_1');
  });

  it('8. non-checkout events unaffected (invoice.payment_failed writes nothing, 200)', async () => {
    const event = {
      id: 'evt_invfail_1',
      type: 'invoice.payment_failed',
      livemode: true,
      data: { object: { id: 'in_1', attempt_count: 2 } },
    };

    const res = await webhookPost(jsonRequest(event, signedHeaders));

    expect(res.status).toBe(200);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// V-3 — /api/finance amount + date validation (POST and PUT)
// ═════════════════════════════════════════════════════════════════════

describe('V-3 — finance input validation', () => {
  const auth = { Authorization: 'Bearer valid-token' };
  let capturedTx: Record<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRateLimit.mockResolvedValue({ limited: false, current: 1, resetAt: Date.now() + 60_000 });
    mockGetAuthUserBasic.mockResolvedValue({ id: 'user_1', plan: 'FREE' } as never);
    vi.mocked(db.financeLog.findFirst).mockResolvedValue(null);
    vi.mocked(db.financeLog.findUnique).mockResolvedValue({ id: 'log_1', userId: 'user_1' } as never);
    vi.mocked(db.financeLog.update).mockResolvedValue({ id: 'log_1' } as never);
    vi.mocked(db.$transaction).mockImplementation(async (fn) => {
      capturedTx = {
        $executeRaw: vi.fn().mockResolvedValue(0),
        financeLog: { create: vi.fn().mockResolvedValue({ id: 'log_new', amount: 20, type: 'expense', category: 'foo', date: new Date() }), findFirst: vi.fn().mockResolvedValue(null) },
        empireProgress: { upsert: vi.fn().mockResolvedValue({}) },
      } as never;
      return fn(capturedTx as never);
    });
  });

  const validPost = { date: '2026-09-14', type: 'expense', category: 'Comida', amount: 20 };

  it('1. valid amount → stored rounded to cents', async () => {
    const res = await financePost(jsonRequest({ ...validPost, amount: 19.999 }, auth));

    expect(res.status).toBe(200);
    expect(capturedTx.financeLog.create).toHaveBeenCalledTimes(1);
    expect(capturedTx.financeLog.create.mock.calls[0][0].data.amount).toBe(20);
  });

  it('2. amount 0 → 400', async () => {
    const res = await financePost(jsonRequest({ ...validPost, amount: 0 }, auth));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('3. negative amount → 400', async () => {
    const res = await financePost(jsonRequest({ ...validPost, amount: -5 }, auth));
    expect(res.status).toBe(400);
  });

  it('4. NaN amount → 400 (never reaches Prisma)', async () => {
    const res = await financePost(jsonRequest({ ...validPost, amount: NaN }, auth));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('5. Infinity amount → 400 (was a Prisma 500 before V-3)', async () => {
    const res = await financePost(jsonRequest({ ...validPost, amount: Infinity }, auth));
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('6. absurdly large amount (2e9) → 400 with the ceiling message', async () => {
    const res = await financePost(jsonRequest({ ...validPost, amount: 2_000_000_000 }, auth));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('máximo');
  });

  it('7. non-number amount ("5") → 400', async () => {
    const res = await financePost(jsonRequest({ ...validPost, amount: '5' }, auth));
    expect(res.status).toBe(400);
  });

  it('8. PUT: valid amount + date → update called with rounded amount and parsed date', async () => {
    const res = await financePut(jsonRequest({ logId: 'log_1', amount: 30.456, date: '2026-09-13' }, auth));

    expect(res.status).toBe(200);
    const arg = vi.mocked(db.financeLog.update).mock.calls[0][0];
    expect(arg.data.amount).toBe(30.46);
    expect(arg.data.date).toBeInstanceOf(Date);
  });

  it('9. PUT: NaN/Infinity/huge amount → 400', async () => {
    for (const amount of [NaN, Infinity, 2_000_000_000]) {
      vi.mocked(db.financeLog.update).mockClear();
      const res = await financePut(jsonRequest({ logId: 'log_1', amount }, auth));
      expect(res.status).toBe(400);
      expect(db.financeLog.update).not.toHaveBeenCalled();
    }
  });

  it('10. PUT: non-string date (number / null) → 400, never reaches startOfMadridDay', async () => {
    for (const date of [12345, null]) {
      vi.mocked(db.financeLog.update).mockClear();
      const res = await financePut(jsonRequest({ logId: 'log_1', date }, auth));
      expect(res.status).toBe(400);
      expect(db.financeLog.update).not.toHaveBeenCalled();
    }
  });

  it('11. PUT: invalid date string keeps the existing safe behavior (400 Fecha inválida)', async () => {
    const res = await financePut(jsonRequest({ logId: 'log_1', date: 'not-a-date' }, auth));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Fecha inválida.');
  });

  it('12. PUT: valid update still works end-to-end (achievement + widget side effects mocked)', async () => {
    const res = await financePut(jsonRequest({ logId: 'log_1', amount: 42, type: 'income' }, auth));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.log.id).toBe('log_1');
  });
});

// ═════════════════════════════════════════════════════════════════════
// A-2 — PLANS.aiMessagesLimit removed (dead constant, drifting value)
// ═════════════════════════════════════════════════════════════════════

describe('A-2 — PLANS no longer exports aiMessagesLimit', () => {
  // These assertions run against the REAL '@/lib/stripe' module
  // (vi.importActual), not the file's mock — the point is to pin the real
  // exported shape.
  it('real PLANS.PREMIUM keeps priceId and drops aiMessagesLimit', async () => {
    const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
    expect('priceId' in actual.PLANS.PREMIUM).toBe(true);
    expect((actual.PLANS.PREMIUM as Record<string, unknown>).aiMessagesLimit).toBeUndefined();
  });

  it('real PLANS.FREE no longer carries the drifting dead field', async () => {
    const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
    expect((actual.PLANS.FREE as Record<string, unknown>).aiMessagesLimit).toBeUndefined();
    expect(actual.PLANS.FREE.name).toBe('Free');
  });
});
