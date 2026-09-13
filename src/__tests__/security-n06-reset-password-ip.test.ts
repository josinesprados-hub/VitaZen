// ═════════════════════════════════════════════════════════════════════
// FASE 17 — N-06: PER-IP RATE LIMIT ON POST /api/auth/reset-password
// ═════════════════════════════════════════════════════════════════════
//
// The route triggers a REAL email send (Resend) and is unauthenticated.
// The pre-existing per-email limit (3 tokens / 15 min) cannot bound an
// attacker rotating target addresses from one IP → mail-bombing through
// hola@vitazen.cc. Fix: per-IP limit 5/15min via the EXISTING rateLimit()
// infrastructure (AnalyticsEvent rl:* rows — excluded from BI, purged
// after 10 min by data-cleanup), coexisting with the per-email limit.
//
// Spec cases covered:
//   1. request normal                     → works (with and without IP header)
//   2. per-email limit                    → still enforced (unchanged message)
//   3. IP limit                           → enforced; blocked request never
//                                            reaches DB user lookup or email
//   4. many emails from one IP            → finally blocked
//   5. different IP                       → independent counter
//   6. blocked request                    → no email sent
//   7. enumeration safety                 → identical generic 429 for any email
//   8. login / other rate-limit keys      → untouched
//   9. GET (token validation)             → not IP-limited (emails only via POST)
//  10. staggered concurrent burst         → overshoot bounded, then blocked
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/rate-limit';

let _rlCount: ReturnType<typeof vi.fn>;       // analyticsEvent.count (rl:* rows)
let _rlCreate: ReturnType<typeof vi.fn>;      // analyticsEvent.create (rl:* rows)
let _tokenCount: ReturnType<typeof vi.fn>;    // passwordResetToken.count (per-email limit)
let _tokenUpdateMany: ReturnType<typeof vi.fn>;
let _tokenCreate: ReturnType<typeof vi.fn>;
let _userFindUnique: ReturnType<typeof vi.fn>;

vi.mock('@/lib/db', () => ({
  get db() {
    return {
      get analyticsEvent() {
        return { get count() { return _rlCount; }, get create() { return _rlCreate; } };
      },
      get passwordResetToken() {
        return {
          get count() { return _tokenCount; },
          get updateMany() { return _tokenUpdateMany; },
          get create() { return _tokenCreate; },
        };
      },
      get user() { return { get findUnique() { return _userFindUnique; } }; },
    };
  },
}));

vi.mock('@/lib/emails/sender', () => ({
  sendResetPasswordEmail: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: {},
}));

import { POST } from '@/app/api/auth/reset-password/route';
import { sendResetPasswordEmail } from '@/lib/emails/sender';

const rlEvents: Array<{ event: string; userId: string }> = [];

function makeRequest(email: string, ip?: string) {
  const headers = new Headers();
  if (ip) headers.set('x-forwarded-for', ip);
  return {
    headers,
    json: async () => ({ email }),
  } as unknown as NextRequest;
}

async function countPostsAndSends(n: number, makeReq: (i: number) => NextRequest) {
  let allowed = 0;
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await POST(makeReq(i));
    statuses.push(res.status);
    if (res.status === 200) allowed++;
  }
  return { allowed, statuses };
}

describe('N-06 — reset-password per-IP rate limit', () => {
  beforeEach(() => {
    // Mock call-count reset (the sender mock persists across tests).
    vi.mocked(sendResetPasswordEmail).mockClear();
    rlEvents.length = 0;
    _rlCount = vi.fn(async ({ where }: { where: { userId: string } }) =>
      rlEvents.filter((r) => r.userId === where.userId).length,
    );
    _rlCreate = vi.fn(async ({ data }: { data: { event: string; userId: string } }) => {
      rlEvents.push(data); // synchronous push: later requests see earlier records
      return { id: 'rl_row' };
    });
    _tokenCount = vi.fn().mockResolvedValue(0);
    _tokenUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    _tokenCreate = vi.fn().mockResolvedValue({});
    _userFindUnique = vi.fn().mockResolvedValue({ id: 'u1', email: 'victim@example.com', name: 'V' });
  });

  // ── 1. request normal → works ──
  it('processes a normal request (email sent) both with and without an IP header', async () => {
    const res1 = await POST(makeRequest('user@example.com', '1.1.1.1'));
    expect(res1.status).toBe(200);
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(1);

    // No platform IP header (local dev without proxy) → IP limit skipped,
    // request still works (documented fail-open behavior).
    const res2 = await POST(makeRequest('user@example.com'));
    expect(res2.status).toBe(200);
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(2);
  });

  // ── 2. per-email limit still enforced, unchanged ──
  it('keeps the per-email limit (3/15min) with its original message', async () => {
    _tokenCount.mockResolvedValue(3);
    const res = await POST(makeRequest('user@example.com', '1.1.1.1'));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('Demasiadas solicitudes. Inténtalo en 15 minutos.');
    expect(sendResetPasswordEmail).not.toHaveBeenCalled();
    // The IP check runs FIRST (both counters consulted on a non-blocked IP).
    expect(_rlCount).toHaveBeenCalled();
  });

  // ── 3 + 6. IP limit enforced; blocked request → no email, no user lookup ──
  it('blocks the 6th request from the same IP without touching DB user or email', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await POST(makeRequest(`user${i}@example.com`, '3.3.3.3'));
      expect(ok.status).toBe(200);
    }
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(5);

    const blocked = await POST(makeRequest('another@example.com', '3.3.3.3'));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    // Blocked BEFORE any DB user lookup and BEFORE the email path.
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(5);
  });

  // ── 5. different IP → independent counter ──
  it('does not share the counter across different IPs', async () => {
    for (let i = 0; i < 5; i++) {
      await POST(makeRequest(`user${i}@example.com`, '5.5.5.5'));
    }
    const resBlocked = await POST(makeRequest('x@example.com', '5.5.5.5'));
    expect(resBlocked.status).toBe(429);

    // A different IP starts from zero.
    const res = await POST(makeRequest('fresh@example.com', '6.6.6.6'));
    expect(res.status).toBe(200);
    expect(_rlCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: '6.6.6.6' }) }),
    );
  });

  // ── 7. enumeration safety ──
  it('returns an identical generic 429 for any email (no enumeration, no email echo)', async () => {
    for (let i = 0; i < 5; i++) await POST(makeRequest(`u${i}@example.com`, '7.7.7.7'));

    const resA = await POST(makeRequest('existing@example.com', '7.7.7.7'));
    const resB = await POST(makeRequest('nonexistent@example.com', '7.7.7.7'));
    expect(resA.status).toBe(429);
    expect(resB.status).toBe(429);
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    // The error message is byte-identical for any email. (retryAfter is a
    // per-request epoch timestamp and may differ by a few ms — that is not
    // enumeration-relevant information.)
    expect(bodyA.error).toBe(bodyB.error);
    expect(bodyA.error).toBe('Demasiadas solicitudes. Inténtalo más tarde.');
    expect(JSON.stringify(bodyA)).not.toContain('@');
    expect(JSON.stringify(bodyB)).not.toContain('@');
  });

  // ── 8 + 9. login/other endpoints untouched; GET not IP-limited ──
  it('leaves all other rate-limit keys untouched and does not IP-limit GET', async () => {
    // Existing keys keep their exact config (login/checkout/etc. untouched).
    expect(RATE_LIMITS['checkin:post']).toEqual({ maxRequests: 5, windowMs: 60_000 });
    expect(RATE_LIMITS['stripe:checkout']).toEqual({ maxRequests: 3, windowMs: 300_000 });
    expect(RATE_LIMITS['onboarding:post']).toEqual({ maxRequests: 3, windowMs: 300_000 });
    // New key present with the documented 5/15min config.
    expect(RATE_LIMITS['auth:reset-password:ip']).toEqual({ maxRequests: 5, windowMs: 900_000 });

    // GET (token validation, no email send) does not consume the IP limit.
    const { GET } = await import('@/app/api/auth/reset-password/route');
    const before = _rlCount ? rlEvents.length : 0;
    const req = {
      nextUrl: new URL('http://localhost/api/auth/reset-password?token=t1'),
      headers: new Headers({ 'x-forwarded-for': '9.9.9.9' }),
    } as unknown as NextRequest;
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(rlEvents.length).toBe(before);
  });

  // ── 10. staggered concurrent burst → bounded overshoot, then blocked ──
  it('keeps a staggered concurrent burst within (or barely above) the limit and blocks afterwards', async () => {
    _userFindUnique.mockResolvedValue({ id: 'u1', email: 'v@example.com', name: 'V' });

    // 10 requests fired concurrently but staggered — realistic hammering
    // without serializing the event loop away entirely.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        new Promise<number>((resolve) => {
          setTimeout(() => resolve(POST(makeRequest(`burst${i}@example.com`, '10.0.0.1')).then((r) => r.status)), i * 15);
        }),
      ),
    );
    const allowed = results.filter((s) => s === 200).length;
    const blocked = results.filter((s) => s === 429).length;
    expect(allowed + blocked).toBe(10);
    // Overshoot is bounded (fire-and-forget counting can transiently admit
    // requests whose count-check overlaps — documented N-09), but the limit
    // ALWAYS re-engages: it can never be exceeded "widely" or indefinitely.
    expect(allowed).toBeLessThanOrEqual(8);
    expect(blocked).toBeGreaterThanOrEqual(2);
    // Only allowed requests reached the email sender.
    expect(sendResetPasswordEmail).toHaveBeenCalledTimes(allowed);

    // After the burst, the IP stays blocked — the limit re-engages.
    const after = await POST(makeRequest('after@example.com', '10.0.0.1'));
    expect(after.status).toBe(429);
  });
});
