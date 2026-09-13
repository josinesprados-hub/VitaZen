// ═════════════════════════════════════════════════════════════════════
// VITAZEN — INVOICE → SUBSCRIPTION REFERENCE (FASE 17, N-02)
// ═════════════════════════════════════════════════════════════════════
//
// PROBLEM (N-02): the Stripe webhook read the subscription reference from
// an Invoice with `(invoice as unknown as { subscription?: ... }).subscription`.
// In Stripe API Basil (2025-03-31.basil) and later (Dahlia), that top-level
// field no longer exists on Invoice objects — the reference moved to
// `invoice.parent.subscription_details.subscription`. If the webhook
// endpoint is pinned to a Basil+ API version, the legacy read always
// yields undefined → the handler bails out early → renewal-driven period
// updates and plan re-sync never run through invoice.paid.
//
// FACTS VERIFIED IN THIS REPO (FASE 17):
//   - package.json: stripe@^22.1.0 (installed 22.1.0).
//   - The SDK's bundled default API version is '2026-04-22.dahlia'
//     (node_modules/stripe/esm/apiVersion.d.ts). src/lib/stripe.ts creates
//     the client WITHOUT an apiVersion override, so OUTGOING API calls
//     (e.g. stripe.subscriptions.retrieve) speak Dahlia.
//   - The webhook verifies signatures with
//     stripe.webhooks.constructEvent(body, sig, secret) — NO version pin.
//     The shape of the INCOMING event payload is therefore determined by
//     the API version pinned on the webhook ENDPOINT in the Stripe
//     Dashboard. ⚠️ UNCERTAINTY (documented, not invented): the Dashboard
//     endpoint version cannot be queried from this environment (no Stripe
//     credentials here). The fallback below covers both possibilities.
//   - stripe@22 types Invoice.Parent (Invoices.d.ts) with fields
//     quote_details / subscription_details / type — so the MODERN read is
//     fully typed; only the LEGACY read needs a narrow, runtime-validated
//     access.
//
// STRATEGY: prefer the modern field; fall back to the legacy field for
// endpoints still pinned to a pre-Basil version. Every read is validated
// as a non-empty string. Returns null when no subscription reference
// exists — callers already treat null as "nothing to do" (non-subscription
// invoices, e.g. one-off payments, must never be invented into
// subscription IDs). No plan semantics are decided here.
// ═════════════════════════════════════════════════════════════════════

import type Stripe from 'stripe';

/**
 * Extract the subscription ID an Invoice belongs to, across Stripe API
 * payload generations. Fails closed with null when no reliable reference
 * exists (never throws, never invents IDs).
 *
 * Order of preference:
 *   1. Modern (Basil+): invoice.parent.subscription_details.subscription
 *      — only when invoice.parent.type === 'subscription_details'.
 *   2. Legacy (pre-Basil): invoice.subscription — top-level field removed
 *      from the v22 typed Invoice; accessed through a narrow structural
 *      view and strictly runtime-validated (typeof + non-empty) instead
 *      of a blind cast.
 *
 * A non-string or empty value in either location is treated as absent:
 * malformed payloads degrade to null (fail-safe), and genuinely invalid
 * IDs are rejected later by stripe.subscriptions.retrieve, whose failure
 * path is already handled by the caller.
 */
export function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // 1. Modern (Basil+): typed access through the discriminated union.
  const parent = invoice.parent;
  if (parent && parent.type === 'subscription_details') {
    const subscription = parent.subscription_details?.subscription;
    if (typeof subscription === 'string' && subscription.length > 0) {
      return subscription;
    }
  }

  // 2. Legacy (pre-Basil): top-level `subscription` string. The v22 SDK
  //    no longer declares it on Invoice — this narrow, validated read is
  //    the documented fallback for endpoints pinned to older API versions.
  const legacy = (invoice as { subscription?: unknown }).subscription;
  if (typeof legacy === 'string' && legacy.length > 0) {
    return legacy;
  }

  // 3. No reliable subscription reference (one-off invoice, malformed
  //    payload, or genuinely non-subscription invoice) → fail closed.
  return null;
}
