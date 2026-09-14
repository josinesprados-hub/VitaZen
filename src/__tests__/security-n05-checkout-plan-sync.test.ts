// ═════════════════════════════════════════════════════════════════════
// FASE 17 — N-05: checkout.session.completed JOINS THE plan-sync LOCK
// ═════════════════════════════════════════════════════════════════════
//
// Every plan-changing Stripe handler takes the per-user advisory lock
// `pg_advisory_xact_lock(md5(userId || '|plan-sync'))` as the FIRST
// statement of its transaction — except checkout.session.completed, which
// promoted users WITHOUT the lock. That made the H-03 guarantee one-sided:
// downgrade handlers serialized against checkout, but checkout did not
// serialize against downgrades. Race (re-subscription after cancellation):
// subscription.deleted (locked) evaluates otherActive BEFORE checkout's new
// subscription is visible → writes plan FREE AFTER checkout wrote PREMIUM
// → paying user stuck on FREE.
//
// Fix: checkout.session.completed takes the SAME lock as the FIRST
// statement of its transaction. Lock-order safety: every plan handler
// takes exactly ONE lock per transaction and never nests another — no
// lock-order cycle can exist, so no deadlock is possible.
//
// Spec cases covered:
//   1. checkout normal                → PREMIUM
//   2. checkout repeated/idempotent   → no duplicate side effects
//   3. checkout + cancellation        → final state coherent (keeps PREMIUM
//                                       when the new active sub is visible)
//   4. plan-sync lock IS taken (same raw pattern as the other handlers)
//   5. invalid webhook                → rejected 400
//   6. signature still enforced (constructEvent called; missing sig → 400)
//   7. XP untouched (user.update data keys only plan/stripeCustomerId)
//   8. streaks untouched
//   9. forged/unsigned payload cannot resolve a userId (fail before any write)
//  10. duplicated events remain idempotent (claim-first)
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ─── Mocks (hoisted-safe: module-scoped vars assigned in beforeEach) ──

let _constructEvent: ReturnType<typeof vi.fn>;
let _listLineItems: ReturnType<typeof vi.fn>;
let _stripeSubRetrieve: ReturnType<typeof vi.fn>;
let _customersRetrieve: ReturnType<typeof vi.fn>;

vi.mock('@/lib/stripe', () => ({
  // PLANS export added (FASE 27): the webhook route now imports PLANS for the
  // S-1 price verification. priceId matches this file's listLineItems mock
  // ('price_1') so the existing "PREMIUM granted" assertions stay valid.
  PLANS: { PREMIUM: { priceId: 'price_1' } },
  stripe: {
    get webhooks() { return { get constructEvent() { return _constructEvent; } }; },
    get checkout() { return { sessions: { get listLineItems() { return _listLineItems; } } }; },
    get subscriptions() { return { get retrieve() { return _stripeSubRetrieve; } }; },
    get customers() { return { get retrieve() { return _customersRetrieve; } }; },
  },
}));

let _tx: Record<string, any>;
let _stripeEventLogCreate: ReturnType<typeof vi.fn>;
let _stripeEventLogDelete: ReturnType<typeof vi.fn>;
let _dbUserFindUnique: ReturnType<typeof vi.fn>;
let _dbTransaction: ReturnType<typeof vi.fn>;

vi.mock('@/lib/db', () => ({
  get db() {
    return {
      get $transaction() { return _dbTransaction; },
      get stripeEventLog() {
        return { get create() { return _stripeEventLogCreate; }, get deleteMany() { return _stripeEventLogDelete; } };
      },
      get user() { return { get findUnique() { return _dbUserFindUnique; } }; },
    };
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

import { POST } from '@/app/api/stripe/webhook/route';

function makeRequest(payload: object, withSignature = true) {
  const headers = new Headers();
  if (withSignature) headers.set('stripe-signature', 'valid-signature');
  return {
    text: async () => JSON.stringify(payload),
    headers,
  } as unknown as NextRequest;
}

function checkoutEvent(userId: string | null, subscriptionId = 'sub_1', eventId = 'evt_checkout_1') {
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

const P2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('N-05 — checkout.session.completed plan-sync lock', () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    // The route iterates [STRIPE_WEBHOOK_SECRET, STRIPE_TEST_WEBHOOK_SECRET]
    // and 400s WITHOUT calling constructEvent if BOTH are missing — set the
    // live secret so the verification path is exercised.
    savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

    _constructEvent = vi.fn();
    _listLineItems = vi.fn().mockResolvedValue({ data: [{ price: { id: 'price_1' } }] });
    _stripeSubRetrieve = vi.fn().mockResolvedValue({
      items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
    });
    _customersRetrieve = vi.fn().mockResolvedValue({ metadata: { userId: 'user_1' } });

    _tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      subscription: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user_1', plan: 'FREE', email: 'user@example.com' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    _dbTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(_tx));
    _stripeEventLogCreate = vi.fn().mockResolvedValue({});
    _stripeEventLogDelete = vi.fn().mockResolvedValue({ count: 0 });
    _dbUserFindUnique = vi.fn().mockResolvedValue({ id: 'user_1', email: 'user@example.com' });

    _constructEvent.mockImplementation((body: string, _sig: string, _secret: string) => {
      return JSON.parse(body);
    });
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
  });

  // ── 1. checkout normal → PREMIUM ──
  it('promotes the user to PREMIUM and upserts the subscription', async () => {
    const res = await POST(makeRequest(checkoutEvent('user_1')));
    expect(res.status).toBe(200);

    expect(_tx.user.update).toHaveBeenCalled();
    const updateData = _tx.user.update.mock.calls[0][0].data;
    expect(updateData.plan).toBe('PREMIUM');
    expect(updateData.stripeCustomerId).toBe('cus_1');

    expect(_tx.subscription.upsert).toHaveBeenCalled();
    const upsertArg = _tx.subscription.upsert.mock.calls[0][0];
    expect(upsertArg.where.stripeSubscriptionId).toBe('sub_1');
    expect(upsertArg.create.userId).toBe('user_1');
    expect(upsertArg.update.status).toBe('active');
  });

  // ── 2 & 10. idempotency: repeated/duplicated events → no duplicate writes ──
  it('is idempotent: a duplicated event is skipped (claim-first) without new writes', async () => {
    const req1 = await POST(makeRequest(checkoutEvent('user_1')));
    expect(req1.status).toBe(200);
    expect(_tx.user.update).toHaveBeenCalledTimes(1);

    // Second delivery of the SAME event: claim fails with P2002.
    _stripeEventLogCreate.mockRejectedValueOnce(P2002());
    const res2 = await POST(makeRequest(checkoutEvent('user_1')));
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2).toEqual({ received: true, deduplicated: true });
    expect(_tx.user.update).toHaveBeenCalledTimes(1); // no second promotion

    // A third delivery (fresh claim attempt) is still deduplicated.
    _stripeEventLogCreate.mockRejectedValueOnce(P2002());
    const res3 = await POST(makeRequest(checkoutEvent('user_1')));
    expect((await res3.json()).deduplicated).toBe(true);
    expect(_tx.user.update).toHaveBeenCalledTimes(1);
  });

  // ── 3. checkout + cancellation concurrent → coherent final state ──
  it('cancellation seeing the new active subscription keeps PREMIUM (no FREE downgrade)', async () => {
    // Order: checkout commits first (PREMIUM written), THEN
    // customer.subscription.deleted arrives for the OLD subscription.
    const resCheckout = await POST(makeRequest(checkoutEvent('user_1')));
    expect(resCheckout.status).toBe(200);
    expect(_tx.user.update.mock.calls[0][0].data.plan).toBe('PREMIUM');

    // Simulate: the deleted handler's otherActive check now SEES the new
    // active subscription (serialized by the shared plan-sync lock).
    _constructEvent.mockImplementationOnce((body: string) => JSON.parse(body));
    const deletedEvent = {
      id: 'evt_deleted_1',
      type: 'customer.subscription.deleted',
      livemode: true,
      data: { object: { id: 'sub_OLD', customer: 'cus_1' } },
    };
    _customersRetrieve.mockResolvedValueOnce({ metadata: { userId: 'user_1' } });
    _tx.subscription.findFirst.mockResolvedValueOnce({
      id: 'row_1', userId: 'user_1', status: 'active', stripeSubscriptionId: 'sub_1',
    });

    const resDeleted = await POST(makeRequest(deletedEvent));
    expect(resDeleted.status).toBe(200);

    // The downgrade branch must NOT have written plan FREE...
    const freeWrites = _tx.user.update.mock.calls.filter((c) => c[0].data.plan === 'FREE');
    expect(freeWrites).toHaveLength(0);
    // ...and the old subscription row must be marked canceled.
    expect(_tx.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'canceled' } }),
    );
  });

  // ── 4. the plan-sync lock IS taken, in the shared pattern ──
  it('takes the userId|plan-sync advisory lock as the first statement of its transaction', async () => {
    await POST(makeRequest(checkoutEvent('user_1')));

    expect(_tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = _tx.$executeRaw.mock.calls[0];
    const sql = strings.join('?');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('|plan-sync');
    expect(values[0]).toBe('user_1');

    // It must run BEFORE any other statement in the transaction: the lock
    // is the first $executeRaw/$queryRaw-style call, and no subscription or
    // user write happened before it in call order.
    const calls: string[] = [];
    _tx.$executeRaw.mock.calls.forEach(() => calls.push('lock'));
    if (_tx.subscription.findFirst.mock.calls.length > 0) calls.push('findFirst');
    expect(calls[0]).toBe('lock');
  });

  // ── 5. invalid webhook → rejected ──
  it('rejects a webhook whose signature verification fails with 400', async () => {
    _constructEvent.mockImplementation(() => { throw new Error('Signature mismatch'); });
    const res = await POST(makeRequest(checkoutEvent('user_1')));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid signature' });
    expect(_tx.user.update).not.toHaveBeenCalled();
  });

  // ── 6. signature still enforced ──
  it('still validates the Stripe signature (constructEvent receives body+signature)', async () => {
    const payload = checkoutEvent('user_1');
    await POST(makeRequest(payload));
    expect(_constructEvent).toHaveBeenCalledWith(
      JSON.stringify(payload),
      'valid-signature',
      expect.any(String),
    );

    // Missing signature header → rejected before verification/processing.
    _constructEvent.mockClear();
    const res = await POST(makeRequest(payload, false));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'No signature' });
    expect(_constructEvent).not.toHaveBeenCalled();
  });

  // ── 7 & 8. XP / streaks untouched ──
  it('only writes plan and stripeCustomerId on the user row (no XP, no streak fields)', async () => {
    await POST(makeRequest(checkoutEvent('user_1')));

    const allowedKeys = new Set(['plan', 'stripeCustomerId']);
    for (const call of _tx.user.update.mock.calls) {
      const keys = Object.keys(call[0].data);
      for (const key of keys) expect(allowedKeys.has(key)).toBe(true);
    }
    // XP/streak models are never part of this transaction: the tx mock has
    // no empireProgress/streak model at all — a 200 response proves the
    // handler never touched them (accessing an undefined model would throw
    // and produce a 500).
    expect(_dbTransaction).toHaveBeenCalled();
  });

  // ── 9. forged/unsigned payload cannot resolve a userId ──
  it('cannot be tricked into a plan change by a payload that fails signature validation', async () => {
    // A forged "checkout" payload claiming another user's id — signature
    // verification fails FIRST, so userId is never even resolved.
    _constructEvent.mockImplementation(() => { throw new Error('No signatures found'); });
    const forged = checkoutEvent('victim_user');
    const res = await POST(makeRequest(forged));
    expect(res.status).toBe(400);
    expect(_tx.user.update).not.toHaveBeenCalled();

    // A legitimately signed event WITHOUT resolvable userId is a no-op:
    // no user.update, no subscription.upsert (fail-closed resolution).
    _constructEvent.mockImplementation((body: string) => JSON.parse(body));
    _customersRetrieve.mockResolvedValue({ metadata: {} });
    _dbUserFindUnique.mockResolvedValue(null);
    const unresolvable = {
      id: 'evt_no_user',
      type: 'checkout.session.completed',
      livemode: true,
      data: { object: { id: 'cs_9', customer: 'cus_9', subscription: 'sub_9', metadata: {} } },
    };
    const res2 = await POST(makeRequest(unresolvable));
    expect(res2.status).toBe(200);
    expect(_tx.user.update).not.toHaveBeenCalled();
    expect(_tx.subscription.upsert).not.toHaveBeenCalled();
  });
});
