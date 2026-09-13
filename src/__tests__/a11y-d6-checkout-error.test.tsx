// @vitest-environment jsdom
// ═════════════════════════════════════════════════════════════════════
// E-9 — D-6: CHECKOUT / PORTAL REDIRECT ERRORS BECOME VISIBLE
// ═════════════════════════════════════════════════════════════════════
//
// E-8 confirmed: the subscription flow redirects with ?error=checkout,
// ?error=connection (pricing) and ?error=portal, ?error=connection
// (ajustes) when Stripe checkout/portal fails — but nothing consumed the
// param, so the user got ZERO feedback.
//
// FIX (E-9): pricing + ajustes consume the param once on mount, render a
// fixed user-safe message through the app's accessible alert pattern
// (role="alert" + Cerrar, same card-accent style as the existing ajustes
// error), and strip the param from the URL with
// window.history.replaceState (no reload, no loop, no state loss).
//
// Covered here (spec cases 1–10):
//   1. ?error=checkout   → correct message
//   2. ?error=connection → correct message
//   3. ?error=portal     → correct message (mapping is shared with ajustes)
//   4. unknown code      → generic safe message
//   5. no param          → no alert at all
//   6. checkout success leaves no error param → no alert (URL w/o ?error,
//      including URLs with unrelated params)
//   7. alert is accessible: role="alert" + dismiss labelled "Cerrar"
//   8. no technical/sensitive details (exact fixed strings asserted)
//   9. re-render does not duplicate the message (exactly one alert)
//   10. subscription state untouched: no /api/stripe call on mount, the
//       plan-driven button still renders, URL stripped
// ═════════════════════════════════════════════════════════════════════

import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PricingPage from '@/app/(dashboard)/pricing/page';
import { getCheckoutErrorMessage, CHECKOUT_ERROR_MESSAGES } from '@/lib/checkout-errors';

// ─── Mocks (hoisted) ─────────────────────────────────────────

const H = vi.hoisted(() => {
  const apiFetch = vi.fn();
  const routerPush = vi.fn();
  const routerReplace = vi.fn();
  return { apiFetch, routerPush, routerReplace };
});

vi.mock('@/hooks/useApi', () => ({ useApi: () => ({ apiFetch: H.apiFetch }) }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Test', plan: 'FREE' } }),
}));
vi.mock('@/context/ScreenshotModeContext', () => ({
  useScreenshotMode: () => ({ displayUser: null, isActive: () => false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: H.routerPush, replace: H.routerReplace, prefetch: vi.fn() }),
}));

// ─── Helpers ──────────────────────────────────────────────────

function goto(path: string) {
  window.history.replaceState(null, '', path);
}

async function renderPricing() {
  const view = render(<PricingPage />);
  // The mount effect reads window.location.search and settles its state.
  await screen.findByRole('heading', { name: 'Mirar la vida más despacio' });
  return view;
}

beforeEach(() => {
  H.apiFetch.mockClear();
  H.routerPush.mockClear();
  H.routerReplace.mockClear();
  goto('/');
});

afterEach(() => {
  cleanup();
});

// ─── 1–4, 8 — message mapping (shared by pricing AND ajustes) ──

describe('getCheckoutErrorMessage — fixed, user-safe mapping', () => {
  it('maps checkout / connection / portal to their fixed messages', () => {
    expect(getCheckoutErrorMessage('checkout')).toBe(CHECKOUT_ERROR_MESSAGES.checkout);
    expect(getCheckoutErrorMessage('connection')).toBe(CHECKOUT_ERROR_MESSAGES.connection);
    expect(getCheckoutErrorMessage('portal')).toBe(CHECKOUT_ERROR_MESSAGES.portal);
  });

  it('falls back to the generic message for unknown or missing codes', () => {
    const generic = 'No hemos podido completar la operación. Inténtalo de nuevo en unos momentos.';
    expect(getCheckoutErrorMessage('something_else')).toBe(generic);
    expect(getCheckoutErrorMessage('')).toBe(generic);
    expect(getCheckoutErrorMessage(null)).toBe(generic);
    expect(getCheckoutErrorMessage(undefined)).toBe(generic);
  });

  it('CASE 8 — messages never contain technical or sensitive details', () => {
    for (const code of ['checkout', 'connection', 'portal', 'unknown', null]) {
      const msg = getCheckoutErrorMessage(code);
      expect(msg).not.toMatch(/http|stripe|api|error|stack|trace|id[=:]|token|\.com|\/api\//i);
    }
  });
});

// ─── 1–10 — pricing page integration ──────────────────────────

describe('PricingPage — consumes ?error= (D-6)', () => {
  it('CASE 1 — ?error=checkout renders the checkout message', async () => {
    goto('/pricing?error=checkout');
    await renderPricing();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(CHECKOUT_ERROR_MESSAGES.checkout)).toBeTruthy();
  });

  it('CASE 2 — ?error=connection renders the connection message', async () => {
    goto('/pricing?error=connection');
    await renderPricing();
    expect(within(screen.getByRole('alert')).getByText(CHECKOUT_ERROR_MESSAGES.connection)).toBeTruthy();
  });

  it('CASE 3 — ?error=portal renders the portal message (same mapping as ajustes)', async () => {
    goto('/pricing?error=portal');
    await renderPricing();
    expect(within(screen.getByRole('alert')).getByText(CHECKOUT_ERROR_MESSAGES.portal)).toBeTruthy();
  });

  it('CASE 4 — unknown code renders the generic safe message', async () => {
    goto('/pricing?error=mystery');
    await renderPricing();
    expect(
      within(screen.getByRole('alert')).getByText(
        'No hemos podido completar la operación. Inténtalo de nuevo en unos momentos.'
      )
    ).toBeTruthy();
  });

  it('CASE 5 — no error param → no alert rendered', async () => {
    goto('/pricing');
    await renderPricing();
    expect(screen.queryByRole('alert')).not.toBeTruthy();
  });

  it('CASE 6 — checkout success (no ?error in URL, unrelated params present) → no alert', async () => {
    goto('/pricing?from=stripe_success');
    await renderPricing();
    expect(screen.queryByRole('alert')).not.toBeTruthy();
  });

  it('CASE 7 — the alert is accessible: role="alert" with a labelled Cerrar button', async () => {
    goto('/pricing?error=checkout');
    await renderPricing();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Cerrar' })).toBeTruthy();
  });

  it('CASE 9 — re-render does not duplicate the message (exactly one alert)', async () => {
    goto('/pricing?error=checkout');
    const view = await renderPricing();
    view.rerender(<PricingPage />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('CASE 10 — subscription state untouched: no stripe API call, plan button intact, URL stripped', async () => {
    goto('/pricing?error=checkout');
    const view = await renderPricing();
    // Mounting the page with an error must not touch the subscription flow…
    expect(H.apiFetch).not.toHaveBeenCalled();
    // …the FREE user still sees the plan CTA…
    expect(screen.getByRole('button', { name: 'Explorar Élite' })).toBeTruthy();
    // …and the URL no longer carries the error param (replaceState, no reload).
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/pricing');
    // Dismissing removes the alert entirely.
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('alert')).not.toBeTruthy();
    view.unmount();
  });

  it('the URL is cleaned even for unknown codes, without navigation side effects', async () => {
    goto('/pricing?error=mystery');
    await renderPricing();
    expect(window.location.search).toBe('');
    expect(H.routerPush).not.toHaveBeenCalled();
    expect(H.routerReplace).not.toHaveBeenCalled();
  });
});
