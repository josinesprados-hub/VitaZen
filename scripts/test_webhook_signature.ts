/**
 * VITAZEN — Stripe Webhook Signature Verification Test
 * 
 * This script PROVES the fix works by simulating the exact scenario
 * that was failing: a TEST-mode event sent to the production endpoint.
 * 
 * It uses the Stripe SDK's own constructEvent/generateTestHeaderString
 * to demonstrate that the dual-secret loop correctly accepts events
 * signed with EITHER secret.
 */

import Stripe from 'stripe';

// ─── Mock secrets (simulating real Stripe webhook secrets) ────────────
const LIVE_SECRET = 'whsec_live_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const TEST_SECRET = 'whsec_test_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

// ─── Mock webhook payload (simplified checkout.session.completed) ─────
const MOCK_EVENT = {
  id: 'evt_test_12345',
  object: 'event',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: {
    object: {
      id: 'cs_test_123',
      object: 'checkout.session',
      customer: 'cus_test_123',
      metadata: { userId: 'user_abc' },
      subscription: 'sub_test_123',
      mode: 'subscription',
    },
  },
  livemode: false, // This is a TEST mode event
  pending_webhooks: 1,
  request: { id: null, idempotency_key: null },
};

const payload = JSON.stringify(MOCK_EVENT);

// ─── Simulate the OLD code (with !isProduction gate) ──────────────────
function oldCodeVerification(
  body: string, 
  signature: string, 
  liveSecret: string | undefined, 
  testSecret: string | undefined,
  nodeEnv: string
): { success: boolean; error?: string; secretUsed?: string } {
  const isProduction = nodeEnv === 'production';
  
  try {
    const event = new Stripe(liveSecret!, { apiVersion: '2026-04-22.dahlia' })
      .webhooks.constructEvent(body, signature, liveSecret!);
    return { success: true, secretUsed: 'live' };
  } catch (liveErr) {
    const useTestFallback = testSecret && !isProduction;
    if (useTestFallback) {
      try {
        const event = new Stripe(testSecret, { apiVersion: '2026-04-22.dahlia' })
          .webhooks.constructEvent(body, signature, testSecret);
        return { success: true, secretUsed: 'test' };
      } catch (testErr) {
        return { success: false, error: 'Both secrets failed' };
      }
    }
    return { success: false, error: `Live secret failed. Test fallback BLOCKED by !isProduction (NODE_ENV=${nodeEnv})` };
  }
}

// ─── Simulate the NEW code (dual-secret loop, no gate) ────────────────
function newCodeVerification(
  body: string,
  signature: string,
  liveSecret: string | undefined,
  testSecret: string | undefined,
): { success: boolean; error?: string; secretUsed?: string } {
  let secretUsed: 'live' | 'test' | null = null;
  
  const secrets: [string, string | undefined][] = [
    ['live', liveSecret],
    ['test', testSecret],
  ];

  for (const [label, secret] of secrets) {
    if (!secret) continue;
    try {
      new Stripe(secret, { apiVersion: '2026-04-22.dahlia' })
        .webhooks.constructEvent(body, signature, secret);
      secretUsed = label as 'live' | 'test';
      break;
    } catch {
      // This secret didn't match — try next
    }
  }

  if (!secretUsed) {
    return { success: false, error: 'No matching secret' };
  }
  return { success: true, secretUsed };
}

// ─── Generate signature for TEST event ────────────────────────────────
// A real TEST mode event would be signed with the TEST secret
const testSignature = new Stripe(TEST_SECRET, { apiVersion: '2026-04-22.dahlia' })
  .webhooks.generateTestHeaderString({
    payload,
    secret: TEST_SECRET,
  });

// ─── Generate signature for LIVE event ────────────────────────────────
const livePayload = JSON.stringify({ ...MOCK_EVENT, livemode: true });
const liveSignature = new Stripe(LIVE_SECRET, { apiVersion: '2026-04-22.dahlia' })
  .webhooks.generateTestHeaderString({
    payload: livePayload,
    secret: LIVE_SECRET,
  });

// ─── RUN TESTS ────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════');
console.log('VITAZEN STRIPE WEBHOOK SIGNATURE VERIFICATION TEST');
console.log('═══════════════════════════════════════════════════════════\n');

// Test 1: OLD code with TEST event in production (THE BUG)
console.log('── TEST 1: OLD CODE — TEST event + NODE_ENV=production ──');
const oldResult = oldCodeVerification(payload, testSignature, LIVE_SECRET, TEST_SECRET, 'production');
console.log(`  Result: ${oldResult.success ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Secret used: ${oldResult.secretUsed || 'none'}`);
console.log(`  Error: ${oldResult.error || '(none)'}\n`);

// Test 2: NEW code with TEST event in production (THE FIX)
console.log('── TEST 2: NEW CODE — TEST event (any NODE_ENV) ──');
const newTestResult = newCodeVerification(payload, testSignature, LIVE_SECRET, TEST_SECRET);
console.log(`  Result: ${newTestResult.success ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Secret used: ${newTestResult.secretUsed || 'none'}`);
console.log(`  Error: ${newTestResult.error || '(none)'}\n`);

// Test 3: NEW code with LIVE event
console.log('── TEST 3: NEW CODE — LIVE event ──');
const newLiveResult = newCodeVerification(livePayload, liveSignature, LIVE_SECRET, TEST_SECRET);
console.log(`  Result: ${newLiveResult.success ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  Secret used: ${newLiveResult.secretUsed || 'none'}`);
console.log(`  Error: ${newLiveResult.error || '(none)'}\n`);

// Test 4: NEW code with WRONG signature (should fail)
console.log('── TEST 4: NEW CODE — WRONG signature ──');
const wrongResult = newCodeVerification(payload, 't=123,v1=wrong', LIVE_SECRET, TEST_SECRET);
console.log(`  Result: ${wrongResult.success ? '❌ FAIL (should have rejected!)' : '✅ PASS (correctly rejected)'}`);
console.log(`  Error: ${wrongResult.error || '(none)'}\n`);

// Test 5: NEW code with ONLY live secret set (test secret missing)
console.log('── TEST 5: NEW CODE — Only live secret, TEST event ──');
const onlyLiveResult = newCodeVerification(payload, testSignature, LIVE_SECRET, undefined);
console.log(`  Result: ${onlyLiveResult.success ? '✅ PASS' : '❌ FAIL (expected — no test secret)'}`);
console.log(`  Error: ${onlyLiveResult.error || '(none)'}\n`);

// Test 6: NEW code with ONLY test secret set (live secret missing)
console.log('── TEST 6: NEW CODE — Only test secret, LIVE event ──');
const onlyTestResult = newCodeVerification(livePayload, liveSignature, undefined, TEST_SECRET);
console.log(`  Result: ${onlyTestResult.success ? '✅ PASS' : '❌ FAIL (expected — no live secret)'}`);
console.log(`  Error: ${onlyTestResult.error || '(none)'}\n`);

// Summary
console.log('═══════════════════════════════════════════════════════════');
console.log('SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
const allPassed = oldResult.success === false 
  && newTestResult.success === true 
  && newLiveResult.success === true 
  && wrongResult.success === false
  && onlyLiveResult.success === false
  && onlyTestResult.success === false;

console.log(`  Old code (BUG): TEST event fails in production: ${!oldResult.success ? '✅ CONFIRMED' : '❌'}`);
console.log(`  New code (FIX): TEST event works in production: ${newTestResult.success ? '✅ CONFIRMED' : '❌'}`);
console.log(`  New code (FIX): LIVE event still works:        ${newLiveResult.success ? '✅ CONFIRMED' : '❌'}`);
console.log(`  Security: Invalid signature rejected:          ${!wrongResult.success ? '✅ CONFIRMED' : '❌'}`);
console.log(`  Missing test secret: gracefully fails:         ${!onlyLiveResult.success ? '✅ CONFIRMED' : '❌'}`);
console.log(`  Missing live secret: gracefully fails:         ${!onlyTestResult.success ? '✅ CONFIRMED' : '❌'}`);
console.log(`\n  ALL TESTS PASSED: ${allPassed ? '✅ YES' : '❌ NO'}`);