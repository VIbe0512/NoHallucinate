/**
 * Phase 2 Test Script — NoHallucinate
 *
 * Validates the dual-agent pipeline end-to-end:
 *   Test 1: Normal flow   — Agent 1 rewrites → Agent 2 approves
 *   Test 2: Bad output    — Deliberately unsupported metric → Agent 2 rejects
 *
 * Run with:  node testPhase2.js  (from inside server/)
 */

import { generateRewrite, verifyRewrite } from './ai/aiClient.js';

const SEPARATOR = '─'.repeat(60);

function header(title) {
  console.log(`\n${SEPARATOR}`);
  console.log(`  ${title}`);
  console.log(SEPARATOR);
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1: Normal Flow
// Agent 1 generates a rewrite → Agent 2 verifies it
// Expected: approved === true
// ─────────────────────────────────────────────────────────────────────────────
async function runTest1() {
  header('TEST 1: Normal Flow');

  const originalBullet = 'Managed a team of developers to build internal tools.';
  const knownFacts     = 'Team of 5 developers.';

  console.log('\nOriginal Bullet:');
  console.log(' ', originalBullet);
  console.log('\nKnown Facts:');
  console.log(' ', knownFacts);

  // Step 1 — Agent 1 generates the rewrite
  console.log('\n⏳ Agent 1 (Generator) rewriting...');
  let rewrite;
  try {
    rewrite = await generateRewrite(originalBullet, knownFacts);
  } catch (err) {
    console.error('❌ Agent 1 call FAILED:', err.message);
    return false;
  }
  console.log('\nAgent 1 Rewrite:');
  console.log(' ', rewrite);

  // Step 2 — Agent 2 verifies the rewrite
  console.log('\n⏳ Agent 2 (Verifier) verifying...');
  let verdict;
  try {
    verdict = await verifyRewrite(originalBullet, knownFacts, rewrite);
  } catch (err) {
    console.error('❌ Agent 2 call FAILED:', err.message);
    return false;
  }

  console.log('\nAgent 2 Verdict:');
  console.log(`  Approved : ${verdict.approved}`);
  console.log(`  Reason   : ${verdict.reason}`);

  const passed = verdict.approved === true;
  console.log(`\n${passed ? '✅ TEST 1 PASSED' : '⚠️  TEST 1 UNEXPECTED RESULT — expected approved: true'}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2: Deliberate Bad Output
// A rewrite with an invented metric is passed directly to Agent 2
// Expected: approved === false  (verifier must catch the hallucination)
// ─────────────────────────────────────────────────────────────────────────────
async function runTest2() {
  header('TEST 2: Deliberately Bad Rewrite (Invented Metric)');

  const originalBullet     = 'Managed a team of developers to build internal tools.';
  const knownFacts          = 'Team of 5 developers.';
  const badRewrite          = 'Led a team of 5 developers and increased productivity by 40%.';

  console.log('\nOriginal Bullet:');
  console.log(' ', originalBullet);
  console.log('\nKnown Facts:');
  console.log(' ', knownFacts);
  console.log('\nDeliberately Bad Rewrite (sent directly to Agent 2):');
  console.log(' ', badRewrite);
  console.log('  ⚠️  "40%" is NOT in the original bullet or known facts.\n');

  // Agent 2 verifies directly (no Agent 1 call — we inject the bad rewrite)
  console.log('⏳ Agent 2 (Verifier) verifying bad rewrite...');
  let verdict;
  try {
    verdict = await verifyRewrite(originalBullet, knownFacts, badRewrite);
  } catch (err) {
    console.error('❌ Agent 2 call FAILED:', err.message);
    return false;
  }

  console.log('\nAgent 2 Verdict:');
  console.log(`  Approved : ${verdict.approved}`);
  console.log(`  Reason   : ${verdict.reason}`);

  const passed = verdict.approved === false;
  console.log(`\n${passed ? '✅ TEST 2 PASSED — verifier correctly rejected the hallucinated metric' : '❌ TEST 2 FAILED — verifier APPROVED an invented metric (critical failure)'}`);
  return passed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║        NoHallucinate — Phase 2 Validation Tests         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  const results = {};

  try {
    results.test1 = await runTest1();
  } catch (err) {
    console.error('\n[UNHANDLED ERROR in Test 1]', err.message);
    results.test1 = false;
  }

  // Small pause between API calls to be polite to the rate limit
  await new Promise((r) => setTimeout(r, 2000));

  try {
    results.test2 = await runTest2();
  } catch (err) {
    console.error('\n[UNHANDLED ERROR in Test 2]', err.message);
    results.test2 = false;
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  header('PHASE 2 SUMMARY');
  console.log(`  Test 1 (Normal Flow)        : ${results.test1  ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Test 2 (Bad Output Rejected): ${results.test2  ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');

  const allPassed = results.test1 && results.test2;
  if (allPassed) {
    console.log('🎉  PHASE 2 COMPLETE — Both agents work correctly.\n');
  } else {
    console.log('🚨  PHASE 2 INCOMPLETE — One or more tests failed. Review output above.\n');
  }
}

main().catch((err) => {
  console.error('\n[Fatal error]', err);
  process.exit(1);
});
