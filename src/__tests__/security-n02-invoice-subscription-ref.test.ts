// ═════════════════════════════════════════════════════════════════════
// FASE 17 — N-02: invoice.paid READS THE SUBSCRIPTION ID ACROSS
// STRIPE API GENERATIONS (Basil/Dahlia + legacy fallback)
// ═════════════════════════════════════════════════════════════════════
//
// Verified facts (documented in src/lib/stripe-invoice.ts):
//   - stripe@^22.1.0; SDK bundled default API version '2026-04-22.dahlia'.
//   - src/lib/stripe.ts creates the client WITHOUT apiVersion → outgoing
//     calls speak the SDK default (Dahlia).
//   - The webhook calls constructEvent(body, sig, secret) WITHOUT a version
//     pin → the INCOMING payload shape is set by the webhook endpoint's
//     pinned API version in the Stripe Dashboard, which CANNOT be queried
//     from this environment (no Stripe credentials here). Documented
//     uncertainty — the implementation therefore supports BOTH shapes.
//
// Spec cases covered:
//   1. modern payload with subscription ID  → works (parent.subscription_details)
//   2. legacy payload (pre-Basil)           → works (top-level subscription)
//   3. payload without subscription         → webhook does not break
//   4. invalid/absent subscription ref      → fail-safe (no retrieve/no writes)
//   5. repeated invoice.paid                → idempotent
//   6. renewal                              → period updated + plan restored
//   7. no duplicate benefits (already PREMIUM → no write)
//   8. signature still mandatory
//   9. other events unchanged (invoice.payment_failed still writes nothing)
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';
import type Stripe from 'stripe';

// ─── Unit tests for the extractor itself ──────────────────────────────

import { extractInvoiceSubscriptionId } from '@/lib/stripe-invoice';

const asInvoice = (shape: object) => shape as unknown as Stripe.Invoice;

const modernInvoice = (sub: string | null) =>
  asInvoice({
    parent: {
      type: 'subscription_details',
      quote_details: null,
      subscription_details: { subscription: sub, metadata: null },
    },
  });

const legacyInvoice = (sub: string | null) => asInvoice({ subscription: sub });

describe('extractInvoiceSubscriptionId()', () => {
  it('reads the modern Basil/Dahlia location', () => {
    expect(extractInvoiceSubscriptionId(modernInvoice('sub_modern'))).toBe('sub_modern');
  });

  it('reads the legacy pre-Basil location', () => {
    expect(extractInvoiceSubscriptionId(legacyInvoice('sub_legacy'))).toBe('sub_legacy');
  });

  it('prefers the modern field when both are present', () => {
    const both = asInvoice({
      subscription: 'sub_legacy',
      parent: {
        type: 'subscription_details',
        quote_details: null,
        subscription_details: { subscription: 'sub_modern', metadata: null },
      },
    });
    expect(extractInvoiceSubscriptionId(both)).toBe('sub_modern');
  });

  it('returns null when neither location has a subscription (one-off invoice)', () => {
    expect(extractInvoiceSubscriptionId(asInvoice({}))).toBeNull();
    expect(extractInvoiceSubscriptionId(modernInvoice(null))).toBeNull();
    expect(extractInvoiceSubscriptionId(legacyInvoice(null))).toBeNull();
    expect(extractInvoiceSubscriptionId(asInvoice({ subscription: '' }))).toBeNull();
  });

  it('treats malformed values as absent (fail-safe, never throws)', () => {
    expect(extractInvoiceSubscriptionId(asInvoice({ subscription: 123 }))).toBeNull();
    expect(extractInvoiceSubscriptionId(asInvoice({ subscription: { id: 'sub_obj' } }))).toBeNull();
    expect(
      extractInvoiceSubscriptionId(asInvoice({ parent: { type: 'quote_details', quote_details: {}, subscription_details: null } })),
    ).toBeNull();
  });
});

// ─── Webhook-level behavior for invoice.paid / invoice.payment_failed ──

let _constructEvent: ReturnType<typeof vi.fn>;
let _stripeSubRetrieve: ReturnType<typeof vi.fn>;

vi.mock('@/lib/stripe', () => ({
  stripe: {
    get webhooks() { return { get constructEvent() { return _constructEvent; } }; },
    get subscriptions() { return { get retrieve() { return _stripeSubRetrieve; } }; },
  },
}));

let _tx: Record<string, any>;
let _stripeEventLogCreate: ReturnType<typeof vi.fn>;
let _stripeEventLogDelete: ReturnType<typeof vi.fn>;
let _dbSubFindUnique: ReturnType<typeof vi.fn>;
let _dbTransaction: ReturnType<typeof vi.fn>;

vi.mock('@/lib/db', () => ({
  get db() {
    return {
      get $transaction() { return _dbTransaction; },
      get stripeEventLog() {
        return { get create() { return _stripeEventLogCreate; }, get deleteMany() { return _stripeEventLogDelete; } };
      },
      get subscription() { return { get findUnique() { return _dbSubFindUnique; } }; },
    };
  },
}));

vi.mock('@/lib/observability/server-logger', () => ({
  serverLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from '@/app/api/stripe/webhook/route';

const P2002 = () => Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

function makeRequest(payload: object) {
  const headers = new Headers();
  headers.set('stripe-signature', 'valid-signature');
  return { text: async () => JSON.stringify(payload), headers } as unknown as NextRequest;
}

function invoicePaidEvent(invoiceShape: object, eventId = 'evt_invoice_1') {
  return {
    id: eventId,
    type: 'invoice.paid',
    livemode: true,
    data: { object: { id: 'in_1', amount_paid: 500, currency: 'eur', ...invoiceShape } },
  };
}

const ACTIVE_SUB = {
  status: 'active',
  items: { data: [{ current_period_start: 1800000000, current_period_end: 1802592000 }] },
};

describe('N-02 — invoice.paid webhook behavior', () => {
  let savedSecret: string | undefined;

  beforeEach(() => {
    // The route 400s WITHOUT calling constructEvent if no webhook secret
    // is present in env — set it so the verification path is exercised.
    savedSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

    _constructEvent = vi.fn((body: string) => JSON.parse(body));
    _stripeSubRetrieve = vi.fn().mockResolvedValue(ACTIVE_SUB);
    _tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      subscription: { update: vi.fn().mockResolvedValue({}) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user_1', plan: 'FREE' }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    _dbTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(_tx));
    _stripeEventLogCreate = vi.fn().mockResolvedValue({});
    _stripeEventLogDelete = vi.fn().mockResolvedValue({ count: 0 });
    _dbSubFindUnique = vi.fn().mockResolvedValue({ userId: 'user_1' });
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = savedSecret;
  });

  // ── 1. modern payload → renewal processed ──
  it('processes a modern (Basil/Dahlia) payload end-to-end', async () => {
    const res = await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_modern'))));
    expect(res.status).toBe(200);
    expect(_stripeSubRetrieve).toHaveBeenCalledWith('sub_modern');
    expect(_tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: 'sub_modern' },
        data: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  // ── 2. legacy payload still supported ──
  it('processes a legacy (pre-Basil) payload through the fallback', async () => {
    const res = await POST(makeRequest(invoicePaidEvent(legacyInvoice('sub_legacy'))));
    expect(res.status).toBe(200);
    expect(_stripeSubRetrieve).toHaveBeenCalledWith('sub_legacy');
    expect(_tx.subscription.update).toHaveBeenCalled();
  });

  // ── 3. payload without subscription → webhook does not break ──
  it('does not break when the invoice has no subscription reference', async () => {
    const res = await POST(makeRequest(invoicePaidEvent(asInvoice({}))));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(_stripeSubRetrieve).not.toHaveBeenCalled();
    expect(_dbTransaction).not.toHaveBeenCalled();
  });

  // ── 4. subscription unknown to our DB → fail-safe, no writes ──
  it('fails safe when the subscription is not in our DB (no invented writes)', async () => {
    _dbSubFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_unknown'))));
    expect(res.status).toBe(200);
    expect(_dbTransaction).not.toHaveBeenCalled();
    expect(_tx.user.update).not.toHaveBeenCalled();

    // Stripe retrieve failure also degrades to a no-op, never a 500.
    _stripeSubRetrieve.mockRejectedValueOnce(new Error('No such subscription'));
    const res2 = await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_gone'), 'evt_invoice_2')));
    expect(res2.status).toBe(200);
    expect(_dbTransaction).not.toHaveBeenCalled();
  });

  // ── 5. repeated invoice.paid → idempotent ──
  it('is idempotent for repeated deliveries of the same event', async () => {
    await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_1'))));
    expect(_tx.subscription.update).toHaveBeenCalledTimes(1);

    _stripeEventLogCreate.mockRejectedValueOnce(P2002());
    const res2 = await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_1'))));
    expect((await res2.json()).deduplicated).toBe(true);
    expect(_tx.subscription.update).toHaveBeenCalledTimes(1);
  });

  // ── 6. renewal keeps/updates plan ──
  it('restores the user to PREMIUM on successful renewal when they were FREE', async () => {
    _tx.user.findUnique.mockResolvedValue({ id: 'user_1', plan: 'FREE' });
    await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_1'))));
    expect(_tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { plan: 'PREMIUM' } }),
    );
  });

  // ── 7. no duplicate benefits ──
  it('does not write anything when the user is already PREMIUM (period still updated)', async () => {
    _tx.user.findUnique.mockResolvedValue({ id: 'user_1', plan: 'PREMIUM' });
    await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_1'))));
    expect(_tx.user.update).not.toHaveBeenCalled();
    expect(_tx.subscription.update).toHaveBeenCalledTimes(1); // period dates still refreshed
  });

  // ── 8. signature still mandatory ──
  it('still enforces webhook signature validation', async () => {
    _constructEvent.mockImplementation(() => { throw new Error('Signature mismatch'); });
    const res = await POST(makeRequest(invoicePaidEvent(modernInvoice('sub_1'))));
    expect(res.status).toBe(400);
    expect(_stripeSubRetrieve).not.toHaveBeenCalled();
    expect(_dbTransaction).not.toHaveBeenCalled();
  });

  // ── 9. other events unchanged ──
  it('leaves invoice.payment_failed write-free (as before)', async () => {
    const event = {
      id: 'evt_pf_1',
      type: 'invoice.payment_failed',
      livemode: true,
      data: { object: { id: 'in_2', attempt_count: 2, ...{ subscription: 'sub_1' } } },
    };
    const res = await POST(makeRequest(event));
    expect(res.status).toBe(200);
    expect(_dbTransaction).not.toHaveBeenCalled();
    expect(_stripeSubRetrieve).not.toHaveBeenCalled();
    expect(_tx.user.update).not.toHaveBeenCalled();
  });
});
