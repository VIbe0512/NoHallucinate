import { MAX_RETRIES } from '../config/constants.js';
import { generateRewrite, verifyRewrite } from '../ai/aiClient.js';
import { saveAuditEntry } from './auditLogService.js';

/**
 * Orchestrates the full dual-agent rewrite and verification pipeline,
 * including verifier feedback loop and max 2 retries.
 *
 * @param {string} originalBullet - Validated original resume bullet.
 * @param {string} [knownFacts=''] - Optional known facts.
 * @returns {Promise<Object>} The final rewrite response structure.
 */
export async function orchestrateRewrite(originalBullet, knownFacts = '') {
  const attempts = [];
  let currentFeedback = null;
  let finalVerdict = 'rejected';
  let finalRewrite = '';
  let finalReason = '';
  let retriesUsed = 0;

  try {
    // Total attempts allowed = Initial attempt (1) + MAX_RETRIES (2) = 3 attempts maximum
    const maxTotalAttempts = 1 + MAX_RETRIES;

    for (let attemptIndex = 0; attemptIndex < maxTotalAttempts; attemptIndex++) {
      const attemptNumber = attemptIndex + 1;
      const isRetry = attemptIndex > 0;

      // 1. Agent 1: Generate rewrite (passes previous feedback if this is a retry)
      const rewrite = await generateRewrite(originalBullet, knownFacts, currentFeedback);
      finalRewrite = rewrite;

      // 2. Agent 2: Independently verify rewrite against the 3 PRD hard rules
      const verdict = await verifyRewrite(originalBullet, knownFacts, rewrite);
      finalReason = verdict.reason;

      // 3. Track attempt history
      attempts.push({
        attemptNumber,
        rewrite,
        approved: verdict.approved,
        reason: verdict.reason
      });

      // 4. Decision logic
      if (verdict.approved) {
        finalVerdict = isRetry ? 'approved_after_retry' : 'approved';
        retriesUsed = attemptIndex;
        break; // Flow approved, exit loop
      }

      // If rejected and retries remain, feed verifier feedback to next attempt
      if (attemptIndex < MAX_RETRIES) {
        currentFeedback = verdict.reason;
      } else {
        // Max retries exhausted
        finalVerdict = 'rejected';
        retriesUsed = MAX_RETRIES;
      }
    }

    // 5. Persist completed session to Audit Log
    const auditRecord = await saveAuditEntry({
      originalBullet,
      knownFacts,
      attempts,
      finalVerdict,
      finalRewrite,
      retriesUsed,
      reason: finalReason
    });

    // 6. Return structured response to client
    return {
      success: true,
      id: auditRecord.id,
      finalVerdict,
      finalRewrite,
      reason: finalReason,
      retriesUsed,
      attempts
    };
  } catch (err) {
    // On unexpected pipeline failure (timeout, rate limit, provider error), log failure
    try {
      await saveAuditEntry({
        originalBullet,
        knownFacts,
        attempts,
        finalVerdict: 'error',
        finalRewrite,
        retriesUsed,
        reason: err.message || 'Pipeline execution failed.'
      });
    } catch (logErr) {
      console.error('Failed to record error in audit log:', logErr.message);
    }

    // Re-throw so Express centralized error handler handles HTTP status and response formatting
    throw err;
  }
}
