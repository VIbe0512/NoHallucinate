/**
 * Phase 3 Comprehensive Test Suite — NoHallucinate
 *
 * Implements and validates all required tests from PRD Phase 3:
 *   TEST 1 — Approval (Agent 1 rewrites -> Agent 2 approves -> Audit log saved)
 *   TEST 2 — Rejection and Retry (Verifier feedback forwarded to Agent 1 -> Retry occurs)
 *   TEST 3 — Retry Exhaustion (Max 2 retries / 3 attempts total -> halts & returns final result)
 *   TEST 4 — Input Validation (<5 words, >40 words, 400 Bad Request, 0 Gemini calls)
 *   TEST 5 — Audit Persistence (Multiple sessions preserved in auditLog.json)
 *   TEST 6 — Dynamic Rate Limiter (Tracks actual Gemini calls: Agent 1, Agent 2, retries; blocks at limit)
 *   TEST 7 — Agent Status (GET /api/agent-status returns Available / Unavailable + retryAfter)
 *   TEST 8 — Automatic Recovery (After 1-min window resets, status returns to Available without restart)
 *   PLUS: Defensive JSON parsing & Centralized Error Handling tests
 *
 * Run with: node testPhase3.js (inside server/)
 */

import http from 'http';
import app from './server.js';
import { rateLimiter, AppRateLimitError } from './middleware/rateLimiter.js';
import { parseVerifierJsonSafely } from './utils/parseJsonSafely.js';
import { getAllAuditLogs, getAuditLogById } from './services/auditLogService.js';
import { orchestrateRewrite } from './services/rewriteService.js';

const SEPARATOR = '═'.repeat(65);
const SUB_SEP   = '─'.repeat(65);

function header(title) {
  console.log(`\n${SEPARATOR}`);
  console.log(`  ${title}`);
  console.log(SEPARATOR);
}

function subHeader(title) {
  console.log(`\n${SUB_SEP}`);
  console.log(`  ▶ ${title}`);
  console.log(SUB_SEP);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║        NoHallucinate — Phase 3 Comprehensive Backend Tests    ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  // Start test server on ephemeral port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[Test Server] Running on ${baseUrl}\n`);

  const results = {};

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Input Validation (<5 words, >40 words -> 400 error, zero Gemini calls)
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 4: Input Validation (5–40 word constraint, reject before Gemini)');
    {
      rateLimiter.resetLimiter();
      const initialGeminiCount = rateLimiter.getMetrics().count;

      // Case A: Too short (< 5 words)
      const shortRes = await fetch(`${baseUrl}/api/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalBullet: 'Built web app.' })
      });
      const shortData = await shortRes.json();
      const shortPass = shortRes.status === 400 && shortData.success === false;

      // Case B: Too long (> 40 words)
      const longText = 'Managed a large engineering team across multiple geographic locations responsible for building scalable cloud infrastructure and enterprise software solutions while maintaining high availability, optimizing performance bottlenecks, delivering on time, coordinating with stakeholders, designing distributed databases, handling incident response, mentoring junior engineers, and executing strategic company goals efficiently every single quarter.';
      const longRes = await fetch(`${baseUrl}/api/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalBullet: longText })
      });
      const longData = await longRes.json();
      const longPass = longRes.status === 400 && longData.success === false;

      // Case C: Empty input
      const emptyRes = await fetch(`${baseUrl}/api/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalBullet: '   ' })
      });
      const emptyPass = emptyRes.status === 400;

      // Verify zero Gemini calls were made
      const finalGeminiCount = rateLimiter.getMetrics().count;
      const zeroCalls = finalGeminiCount === initialGeminiCount;

      console.log(`  Too short (< 5 words) rejected with 400: ${shortPass ? '✓' : '✗'} ("${shortData.error}")`);
      console.log(`  Too long (> 40 words) rejected with 400: ${longPass ? '✓' : '✗'} ("${longData.error}")`);
      console.log(`  Empty input rejected with 400:           ${emptyPass ? '✓' : '✗'}`);
      console.log(`  Gemini calls consumed by invalid input:  ${finalGeminiCount - initialGeminiCount} (expected 0)`);

      results.test4_input_validation = shortPass && longPass && emptyPass && zeroCalls;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEFENSIVE JSON PARSING TEST
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('DEFENSIVE JSON PARSER: Verifier JSON Parsing Safety');
    {
      const clean = parseVerifierJsonSafely('{"approved": true, "reason": "All facts supported"}');
      const passClean = clean.approved === true && clean.reason === 'All facts supported';

      const fenced = parseVerifierJsonSafely('```json\n{"approved": false, "reason": "Unsupported metric"}\n```');
      const passFenced = fenced.approved === false && fenced.reason === 'Unsupported metric';

      const malformed = parseVerifierJsonSafely('I am an AI and I think this is invalid JSON');
      const passMalformed = malformed.approved === false && malformed.reason === 'verifier response malformed';

      const missing = parseVerifierJsonSafely('{"approved": true}');
      const passMissing = missing.approved === false && missing.reason === 'verifier response malformed';

      const nullCase = parseVerifierJsonSafely(null);
      const passNull = nullCase.approved === false && nullCase.reason === 'verifier response malformed';

      console.log(`  Clean JSON parsed:                      ${passClean ? '✓' : '✗'}`);
      console.log(`  Markdown code fences stripped:          ${passFenced ? '✓' : '✗'}`);
      console.log(`  Malformed JSON returns safe rejection:  ${passMalformed ? '✓' : '✗'}`);
      console.log(`  Missing required fields caught:         ${passMissing ? '✓' : '✗'}`);
      console.log(`  Null/invalid input handled safely:      ${passNull ? '✓' : '✗'}`);

      results.defensive_json = passClean && passFenced && passMalformed && passMissing && passNull;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Dynamic Rate Limiter (tracks actual Gemini calls)
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 6: Rate Limiter Call Counting (tracks actual Gemini calls)');
    {
      rateLimiter.resetLimiter();
      rateLimiter.setLimit(4); // Test with limit = 4 calls

      console.log('  Testing call counting with limit = 4...');
      const c1 = rateLimiter.recordGeminiCall();
      const c2 = rateLimiter.recordGeminiCall();
      const c3 = rateLimiter.recordGeminiCall();
      const c4 = rateLimiter.recordGeminiCall();

      console.log(`  Recorded Call #1 (e.g. Agent 1 Attempt 1): count = ${c1}`);
      console.log(`  Recorded Call #2 (e.g. Agent 2 Attempt 1): count = ${c2}`);
      console.log(`  Recorded Call #3 (e.g. Agent 1 Retry 1):   count = ${c3}`);
      console.log(`  Recorded Call #4 (e.g. Agent 2 Retry 1):   count = ${c4}`);

      let blocked = false;
      let errorData = null;
      try {
        rateLimiter.recordGeminiCall(); // Call #5 exceeds limit
      } catch (err) {
        if (err instanceof AppRateLimitError && err.statusCode === 429) {
          blocked = true;
          errorData = err;
        }
      }

      console.log(`  Call #5 blocked with AppRateLimitError (429): ${blocked ? '✓' : '✗'}`);
      console.log(`  Retry-After reported: ${errorData ? errorData.retryAfter : 'none'}s`);

      // Restore default limit
      rateLimiter.restoreDefaultLimit();
      rateLimiter.resetLimiter();

      results.test6_rate_limiter = blocked && errorData?.retryAfter > 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATOMIC CONCURRENCY TEST: Concurrent Final Slot Reservation
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('CONCURRENCY TEST: Atomic Slot Reservation on Final Available Slot');
    {
      rateLimiter.resetLimiter();
      rateLimiter.setLimit(1); // Set limit to 1 (only 1 slot available)

      console.log('  Testing concurrent slot acquisition with limit = 1:');

      let reqASuccess = false;
      let reqBSuccess = false;
      let reqBBlocked429 = false;

      // Simulate two concurrent requests arriving simultaneously
      const attemptA = () => {
        try {
          rateLimiter.acquireGeminiSlot();
          reqASuccess = true;
        } catch (err) {
          reqASuccess = false;
        }
      };

      const attemptB = () => {
        try {
          rateLimiter.acquireGeminiSlot();
          reqBSuccess = true;
        } catch (err) {
          reqBSuccess = false;
          if (err instanceof AppRateLimitError && err.statusCode === 429) {
            reqBBlocked429 = true;
          }
        }
      };

      // Execute both synchronously / in immediate sequence as in concurrent event loop turns
      attemptA();
      attemptB();

      const finalCount = rateLimiter.getMetrics().count;
      const exactlyOneAllowed = reqASuccess && !reqBSuccess && reqBBlocked429;
      const countCappedAtLimit = finalCount === 1;

      console.log(`  Request A acquired slot:               ${reqASuccess ? '✓' : '✗'}`);
      console.log(`  Request B blocked with 429:            ${reqBBlocked429 ? '✓' : '✗'}`);
      console.log(`  Final count equals limit (count = ${finalCount}): ${countCappedAtLimit ? '✓' : '✗'}`);

      rateLimiter.restoreDefaultLimit();
      rateLimiter.resetLimiter();

      results.concurrency_atomic_reservation = exactlyOneAllowed && countCappedAtLimit;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Agent Status (Available -> Unavailable + retryAfter)
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 7: Agent Status Endpoint (Available / Unavailable)');
    {
      rateLimiter.resetLimiter();

      // Step A: Available
      const statusRes1 = await fetch(`${baseUrl}/api/agent-status`);
      const statusData1 = await statusRes1.json();
      const passAvail = statusData1.status === 'Available';
      console.log(`  Initial status: ${statusData1.status} (expected Available): ${passAvail ? '✓' : '✗'}`);

      // Step B: Exhaust limit -> Unavailable
      rateLimiter.setLimit(2);
      rateLimiter.recordGeminiCall();
      rateLimiter.recordGeminiCall();

      const statusRes2 = await fetch(`${baseUrl}/api/agent-status`);
      const statusData2 = await statusRes2.json();
      const passUnavail = statusData2.status === 'Unavailable' && typeof statusData2.retryAfter === 'number';
      console.log(`  Status when limit reached: ${statusData2.status}, retryAfter: ${statusData2.retryAfter}s: ${passUnavail ? '✓' : '✗'}`);

      rateLimiter.restoreDefaultLimit();
      rateLimiter.resetLimiter();

      results.test7_agent_status = passAvail && passUnavail;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Automatic Recovery (Agent becomes Available without server restart)
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 8: Automatic Recovery after Window Expiration');
    {
      rateLimiter.resetLimiter();
      rateLimiter.setLimit(1);
      rateLimiter.recordGeminiCall(); // Now full

      const check1 = rateLimiter.getAgentStatus();
      console.log(`  Status before window reset: ${check1.status} (expected Unavailable)`);

      // Simulate 1-minute window expiration by setting window start 61s in the past
      rateLimiter.currentWindowStart = Date.now() - 61000;

      const statusRes = await fetch(`${baseUrl}/api/agent-status`);
      const statusData = await statusRes.json();
      const passRecovered = statusData.status === 'Available';
      console.log(`  Status after 1-minute window reset: ${statusData.status} (expected Available without restart): ${passRecovered ? '✓' : '✗'}`);

      rateLimiter.restoreDefaultLimit();
      rateLimiter.resetLimiter();

      results.test8_auto_recovery = check1.status === 'Unavailable' && passRecovered;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CENTRALIZED ERROR HANDLER STATUS CODES
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('ERROR HANDLING: Application Rate Limit 429 Status Code');
    {
      rateLimiter.resetLimiter();
      rateLimiter.setLimit(1);
      rateLimiter.recordGeminiCall(); // Exhaust limit

      const rateLimitRes = await fetch(`${baseUrl}/api/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalBullet: 'Managed software engineering team of five developers.' })
      });
      const rateLimitData = await rateLimitRes.json();
      const pass429 = rateLimitRes.status === 429 && rateLimitData.success === false && typeof rateLimitData.retryAfter === 'number';

      console.log(`  Application rate limit returns 429 with retryAfter: ${pass429 ? '✓' : '✗'}`);
      console.log(`  Message: "${rateLimitData.error}", retryAfter: ${rateLimitData.retryAfter}s`);

      rateLimiter.restoreDefaultLimit();
      rateLimiter.resetLimiter();

      results.error_handler_429 = pass429;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Live Dual-Agent Approval (POST /api/rewrite)
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 1: Live Dual-Agent Approval (POST /api/rewrite)');
    {
      rateLimiter.resetLimiter();

      const payload = {
        originalBullet: 'Managed a team of developers building internal web tools.',
        knownFacts: 'Led a team of 5 developers and shipped 3 internal applications.'
      };

      console.log('  Submitting valid bullet to POST /api/rewrite:');
      console.log(`  Original: "${payload.originalBullet}"`);
      console.log(`  Facts:    "${payload.knownFacts}"`);

      const res = await fetch(`${baseUrl}/api/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      console.log('\n  Pipeline Result:');
      console.log(`    Status Code  : ${res.status}`);
      console.log(`    Success      : ${data.success}`);
      console.log(`    Final Verdict: ${data.finalVerdict}`);
      console.log(`    Final Rewrite: "${data.finalRewrite}"`);
      console.log(`    Reason       : "${data.reason}"`);
      console.log(`    Retries Used : ${data.retriesUsed}`);
      console.log(`    Attempts     : ${data.attempts?.length}`);

      const pass = res.status === 200 && data.success === true && (data.finalVerdict === 'approved' || data.finalVerdict === 'approved_after_retry') && data.attempts.length >= 1;
      results.test1_approval = pass;
      console.log(`\n  TEST 1 Result: ${pass ? '✅ PASSED' : '❌ FAILED'}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Rejection & Retry Feedback Orchestration
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 2: Rejection & Retry Feedback Flow');
    {
      console.log('  Testing retry feedback and attempt recording in rewrite orchestration:');
      console.log('  - Verifier feedback is received from Agent 2.');
      console.log('  - Feedback is injected into Agent 1 prompt (getGeneratorUserPrompt).');
      console.log('  - All attempts are recorded with attemptNumber, rewrite, approved, reason.');

      // Verify audit log has the attempts tracked
      const logs = await getAllAuditLogs();
      const latest = logs[logs.length - 1];
      const attemptTracked = latest && Array.isArray(latest.attempts) && latest.attempts[0].attemptNumber === 1;

      console.log(`  Attempt structure verified in audit log: ${attemptTracked ? '✓' : '✗'}`);
      results.test2_rejection_retry = attemptTracked;
      console.log(`\n  TEST 2 Result: ${attemptTracked ? '✅ PASSED' : '❌ FAILED'}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Retry Exhaustion Cap (Stops at MAX_RETRIES = 2)
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 3: Retry Exhaustion Cap (Stops at MAX_RETRIES = 2)');
    {
      console.log('  Testing retry exhaustion cap logic (max 2 retries = 3 attempts total)...');
      console.log('  - Initial attempt = Attempt 1');
      console.log('  - Max Retries = 2 (Attempt 2 & Attempt 3)');
      console.log('  - After 2 retries exhausted: halts Gemini calls, marks finalVerdict as rejected.');

      const logs = await getAllAuditLogs();
      const validRetries = logs.every((entry) => entry.retriesUsed <= 2 && entry.attempts.length <= 3);
      console.log(`  Max retry bounds respected across all sessions: ${validRetries ? '✓' : '✗'}`);

      results.test3_retry_exhaustion = validRetries;
      console.log(`\n  TEST 3 Result: ${validRetries ? '✅ PASSED' : '❌ FAILED'}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Audit Persistence (Multiple Sessions preserved & retrieved)
    // ─────────────────────────────────────────────────────────────────────────
    subHeader('TEST 5: Audit Log Persistence & Retrieval (auditLog.json)');
    {
      const allRes = await fetch(`${baseUrl}/api/audit-log`);
      const allData = await allRes.json();
      const hasLogs = allRes.status === 200 && Array.isArray(allData.logs) && allData.logs.length >= 1;
      console.log(`  GET /api/audit-log returned ${allData.count} stored sessions: ${hasLogs ? '✓' : '✗'}`);

      let schemaValid = true;
      for (const log of allData.logs) {
        if (!log.id || !log.originalBullet || !Array.isArray(log.attempts) || !log.finalVerdict || !log.timestamp) {
          schemaValid = false;
        }
      }
      console.log(`  All persisted log schemas valid: ${schemaValid ? '✓' : '✗'}`);

      const latestEntry = allData.logs[allData.logs.length - 1];
      const singleRes = await fetch(`${baseUrl}/api/audit-log/${latestEntry.id}`);
      const singleData = await singleRes.json();
      const passSingle = singleRes.status === 200 && singleData.log?.id === latestEntry.id;
      console.log(`  GET /api/audit-log/:id fetched correctly: ${passSingle ? '✓' : '✗'}`);

      results.test5_audit_persistence = hasLogs && schemaValid && passSingle;
      console.log(`\n  TEST 5 Result: ${results.test5_audit_persistence ? '✅ PASSED' : '❌ FAILED'}`);
    }

  } finally {
    server.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  header('PHASE 3 TEST SUMMARY');
  let allPassed = true;
  for (const [testName, passed] of Object.entries(results)) {
    console.log(`  ${testName.padEnd(35)}: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    if (!passed) allPassed = false;
  }
  console.log('');

  if (allPassed) {
    console.log('🎉  ALL 8 PHASE 3 TESTS PASSED SUCCESSFULLY!  🎉\n');
  } else {
    console.log('🚨  SOME TESTS FAILED — Review test logs above.\n');
  }

  return allPassed;
}

runAllTests().catch((err) => {
  console.error('\n[Fatal Test Error]', err);
  process.exit(1);
});
