// ═════════════════════════════════════════════════════════════════════
// FASE 17 — N-01: PLATFORM BI IS ADMIN-ONLY (NOT PREMIUM-ONLY)
// ═════════════════════════════════════════════════════════════════════
//
// GET /api/analytics/insights used `plan === 'PREMIUM'` as its gate, so
// every paying customer could read platform-wide DAU, retention, funnel
// and feature ranking. Fix: server-side admin allowlist (ADMIN_EMAILS env
// via src/lib/admin.ts), fail-closed.
//
// Spec cases covered:
//   1. normal PREMIUM user        → 403
//   2. normal FREE user           → 403
//   3. unauthenticated            → 401
//   4. authorized admin           → 200 with full BI payload
//   5. manipulated identity       → 403 (exact-match; client data ignored;
//                                    substring/case games don't leak access)
//   6. no admin config            → fail-closed 403 (even for PREMIUM)
//   7. no authorization info exposed in any response body
//   8. BI content unchanged for a valid admin (same aggregate shape)
// ═════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

let _groupBy: ReturnType<typeof vi.fn>;
let _count: ReturnType<typeof vi.fn>;
let _queryRaw: ReturnType<typeof vi.fn>;

vi.mock('@/lib/db', () => ({
  get db() {
    return {
      analyticsEvent: {
        get groupBy() { return _groupBy; },
        get count() { return _count; },
      },
      get $queryRaw() { return _queryRaw; },
    };
  },
}));

let _getAuthUser: ReturnType<typeof vi.fn>;
vi.mock('@/lib/auth', () => ({
  get getAuthUser() { return _getAuthUser; },
}));

import { GET } from '@/app/api/analytics/insights/route';
import { isAdminEmail, getAdminEmails } from '@/lib/admin';

function makeRequest(authHeader?: string, url = 'http://localhost/api/analytics/insights') {
  const headers = new Headers();
  if (authHeader) headers.set('Authorization', authHeader);
  return { headers, url } as unknown as NextRequest;
}

const ADMIN = 'owner@vitazen.cc';

describe('N-01 — GET /api/analytics/insights admin allowlist', () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAILS;
    _groupBy = vi.fn();
    _count = vi.fn();
    _queryRaw = vi.fn();
    _getAuthUser = vi.fn();
  });

  afterEach(() => {
    if (savedEnv === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = savedEnv;
    vi.restoreAllMocks();
  });

  // ── 1. normal PREMIUM user → 403 (PREMIUM is not ADMIN) ──
  it('rejects a normal PREMIUM user with 403', async () => {
    process.env.ADMIN_EMAILS = ADMIN;
    _getAuthUser.mockResolvedValue({ id: 'u_premium', email: 'customer@example.com', plan: 'PREMIUM' });

    const res = await GET(makeRequest('Bearer valid-token'));
    expect(res.status).toBe(403);
  });

  // ── 2. normal FREE user → 403 ──
  it('rejects a normal FREE user with 403', async () => {
    process.env.ADMIN_EMAILS = ADMIN;
    _getAuthUser.mockResolvedValue({ id: 'u_free', email: 'free@example.com', plan: 'FREE' });

    const res = await GET(makeRequest('Bearer valid-token'));
    expect(res.status).toBe(403);
  });

  // ── 3. unauthenticated → 401 ──
  it('rejects unauthenticated requests with 401 before any admin check', async () => {
    process.env.ADMIN_EMAILS = ADMIN;

    const res = await GET(makeRequest(undefined));
    expect(res.status).toBe(401);
    expect(_getAuthUser).not.toHaveBeenCalled();
  });

  // ── 4. authorized admin → 200 with BI payload ──
  it('allows an explicitly authorized admin (allowlist, case-insensitive) with 200', async () => {
    process.env.ADMIN_EMAILS = ADMIN;
    _getAuthUser.mockResolvedValue({ id: 'u_admin', email: 'OWNER@vitazen.cc', plan: 'FREE' });

    // Deterministic aggregates for the 200 path (call order in route):
    _groupBy.mockResolvedValue([{ event: 'daily_session', _count: { id: 10, userId: 4 } }]);
    _queryRaw
      .mockResolvedValueOnce([{ event: 'daily_session', unique_users: BigInt(3) }])   // unique per event
      .mockResolvedValueOnce([{ day: '2026-01-01', dau: BigInt(2) }])                 // DAU trend
      .mockResolvedValueOnce([{ count: BigInt(5) }])                                  // total unique users
      .mockResolvedValueOnce([{ count: BigInt(3) }]);                                 // retention
    _count.mockResolvedValue(10);

    const res = await GET(makeRequest('Bearer valid-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalEvents).toBe(10);
    expect(body.uniqueUsers).toBe(5);
    expect(body.eventCounts['daily_session']).toBe(10);
    expect(body.dauTrend).toEqual([{ date: '2026-01-01', dau: 2 }]);
    expect(body.retention.stillActive).toBe(3);
    expect(body.funnel.registered).toBe(0);
  });

  // ── 5. manipulated identity / client data is ignored ──
  it('never lets client data or fuzzy emails grant admin (exact match only)', async () => {
    process.env.ADMIN_EMAILS = ADMIN;

    // Substring lookalike of the admin email
    _getAuthUser.mockResolvedValue({ id: 'u_evil', email: 'xowner@vitazen.cc.evil.tld', plan: 'PREMIUM' });
    const res1 = await GET(makeRequest('Bearer tok', 'http://localhost/api/analytics/insights?days=7&role=ADMIN&isAdmin=true&admin=1'));
    expect(res1.status).toBe(403);

    // Even if the client sends a body trying to look like an admin, the
    // gate only reads the DB user row — extra body/query keys are ignored.
    _getAuthUser.mockResolvedValue({ id: 'u_evil2', email: 'free@example.com', plan: 'FREE' });
    const res2 = await GET(makeRequest('Bearer tok', 'http://localhost/api/analytics/insights?email=owner%40vitazen.cc&role=ADMIN'));
    expect(res2.status).toBe(403);
  });

  // ── 6. fail-closed when admin config missing/empty ──
  it('fails closed when ADMIN_EMAILS is unset or empty', async () => {
    _getAuthUser.mockResolvedValue({ id: 'u_admin', email: ADMIN, plan: 'PREMIUM' });

    const res1 = await GET(makeRequest('Bearer tok')); // unset
    expect(res1.status).toBe(403);

    process.env.ADMIN_EMAILS = ' , ,, ';
    const res2 = await GET(makeRequest('Bearer tok'));
    expect(res2.status).toBe(403);
  });

  // ── 7. no authorization info leaked in responses ──
  it('does not expose any authorization/allowlist information', async () => {
    process.env.ADMIN_EMAILS = ADMIN;
    _getAuthUser.mockResolvedValue({ id: 'u_free', email: 'free@example.com', plan: 'FREE' });

    const res = await GET(makeRequest('Bearer tok'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  // ── allowlist unit behavior: exact matching semantics ──
  describe('allowlist semantics (src/lib/admin.ts)', () => {
    it('matches exactly, trims entries, is case-insensitive, drops invalid entries', () => {
      process.env.ADMIN_EMAILS = ' Owner@VitaZen.cc , ops@vitazen.cc ,not-an-email, ';
      expect(getAdminEmails()).toEqual(['owner@vitazen.cc', 'ops@vitazen.cc']);
      expect(isAdminEmail('owner@vitazen.cc')).toBe(true);
      expect(isAdminEmail('  OWNER@vitazen.cc  ')).toBe(true);
      expect(isAdminEmail('owner@vitazen.cc.evil.tld')).toBe(false);
      expect(isAdminEmail('sowner@vitazen.cc')).toBe(false);
      expect(isAdminEmail('ops@vitazen')).toBe(false);
      expect(isAdminEmail('')).toBe(false);
      expect(isAdminEmail(null)).toBe(false);
      expect(isAdminEmail(undefined)).toBe(false);
    });
  });
});
