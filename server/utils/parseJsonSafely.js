/**
 * Safely parses raw AI output expecting { approved: boolean, reason: string }.
 *
 * Requirements:
 * - Accept raw AI output.
 * - Remove markdown code fences if present.
 * - Attempt JSON.parse().
 * - Validate required fields (approved as boolean, reason as string).
 * - If parsing fails or fields are invalid, defensively return { approved: false, reason: "verifier response malformed" }
 *
 * @param {string} rawText - Raw string from verifier model.
 * @returns {{ approved: boolean, reason: string }}
 */
export function parseVerifierJsonSafely(rawText) {
  const fallback = {
    approved: false,
    reason: 'verifier response malformed'
  };

  if (!rawText || typeof rawText !== 'string') {
    return fallback;
  }

  try {
    let cleaned = rawText.trim();

    // Strip markdown code fences if present (e.g. ```json ... ``` or ``` ... ```)
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    const parsed = JSON.parse(cleaned);

    if (typeof parsed !== 'object' || parsed === null) {
      return fallback;
    }

    if (typeof parsed.approved !== 'boolean' || typeof parsed.reason !== 'string') {
      return fallback;
    }

    return {
      approved: parsed.approved,
      reason: parsed.reason.trim()
    };
  } catch (err) {
    return fallback;
  }
}
