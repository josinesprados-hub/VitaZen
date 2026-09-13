// ═════════════════════════════════════════════════════════════════════
// VITAZEN — ADMIN ALLOWLIST (FASE 17, N-01)
// ═════════════════════════════════════════════════════════════════════
//
// PROBLEM (N-01): GET /api/analytics/insights gated platform business
// intelligence (DAU, retention, conversion funnel, feature ranking, unique
// users) on `plan === 'PREMIUM'`. PREMIUM is a SUBSCRIPTION TIER, not a
// role — every paying customer could read platform-wide metrics. The User
// model has no role field, and adding one would require a schema migration
// (explicitly out of scope for N-01).
//
// SOLUTION: the minimal administrative authorization primitive that fits
// the current architecture — a server-side allowlist of admin emails read
// from the ADMIN_EMAILS environment variable (comma-separated list).
//
// Properties (all deliberate, all security-relevant):
//   - Fail-closed: if ADMIN_EMAILS is unset or yields no valid entries,
//     there are NO administrators and EVERY request is rejected —
//     including PREMIUM users. A missing configuration can never open the
//     panel, only close it.
//   - Exact match: whole-string equality after trim + lowercase. No
//     substring, prefix, or pattern matching. `admin@vitazen.cc` in the
//     allowlist does NOT authorize `evil-admin@vitazen.cc` or
//     `admin@vitazen.cc.attacker.tld`.
//   - Case-insensitive: email local parts are compared case-insensitively
//     because email delivery is case-preserving but routing is
//     case-insensitive; the DB lookup paths in this codebase already
//     normalize with email.toLowerCase().trim().
//   - Server-only: the list is read from process.env at call time — never
//     from request body, query, headers, or the DB. There is no endpoint
//     to read it, and authorization failures return the same generic
//     'Forbidden' body the route used before (no allowlist details,
//     no enumeration of who is or is not an admin).
//   - Client data is irrelevant: the route derives the email from the DB
//     user row resolved by a verified Firebase ID token (getAuthUser), so
//     anything the client sends (body/query like role=ADMIN) is ignored
//     by construction.
//
// OPERATOR USAGE: set in the deployment environment (e.g. Vercel project
// env), NOT in any committed file:
//   ADMIN_EMAILS="owner@vitazen.cc,ops@vitazen.cc"
// ═════════════════════════════════════════════════════════════════════

/**
 * Parse the ADMIN_EMAILS environment variable into a normalized allowlist.
 *
 * - Comma-separated; surrounding whitespace on each entry is ignored.
 * - Entries are lowercased for case-insensitive comparison.
 * - Empty entries and entries without '@' are dropped (typos like
 *   `ADMIN_EMAILS=",,,"` fail closed rather than matching something odd).
 *
 * Read at call time (not module load) so deployments that add the variable
 * don't require a rebuild, and so tests can stub the environment.
 */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0 && entry.includes('@'));
}

/**
 * Whether the given email is explicitly authorized as an administrator.
 *
 * Fail-closed: returns false when no allowlist is configured, when the
 * email is missing, or when it is not an EXACT (case-insensitive,
 * trimmed) member of the allowlist.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = getAdminEmails();
  if (admins.length === 0) return false;
  const normalized = email.trim().toLowerCase();
  return admins.includes(normalized);
}
