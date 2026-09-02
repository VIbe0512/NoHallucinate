import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import 'dotenv/config';
import {
  SYSTEM_PROMPT_GENERATOR,
  getGeneratorUserPrompt,
  SYSTEM_PROMPT_VERIFIER,
  getVerifierUserPrompt
} from './prompts.js';
import { GEMINI_TIMEOUT_MS } from '../config/constants.js';
import { rateLimiter, AppRateLimitError } from '../middleware/rateLimiter.js';
import { parseVerifierJsonSafely } from '../utils/parseJsonSafely.js';

// ────────────────────────────────────────────────────────────────────────────
// Custom Error Definitions
// ────────────────────────────────────────────────────────────────────────────
export class GeminiProviderRateLimitError extends Error {
  constructor(message = 'Gemini provider rate limit hit, please wait a moment.') {
    super(message);
    this.name = 'GeminiProviderRateLimitError';
    this.statusCode = 429;
    this.isProviderRateLimit = true;
  }
}

export class GeminiTimeoutError extends Error {
  constructor(message = 'Gemini request timed out after 15 seconds.') {
    super(message);
    this.name = 'GeminiTimeoutError';
    this.statusCode = 504;
    this.isTimeout = true;
  }
}

export class GeminiProviderError extends Error {
  constructor(message = 'Gemini API call failed.') {
    super(message);
    this.name = 'GeminiProviderError';
    this.statusCode = 502;
    this.isProviderError = true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Initialization
// ────────────────────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'gemini-3.5-flash';

let genAI = null;
let generatorModel = null;
let verifierModel = null;

if (apiKey && apiKey.trim() !== '') {
  try {
    genAI = new GoogleGenerativeAI(apiKey);

    // Agent 1: Generator — plain text response
    generatorModel = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_PROMPT_GENERATOR,
    });

    // Agent 2: Verifier — structured JSON response enforced at the API level
    verifierModel = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: SYSTEM_PROMPT_VERIFIER,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            approved: { type: SchemaType.BOOLEAN },
            reason:   { type: SchemaType.STRING  },
          },
          required: ['approved', 'reason'],
        },
      },
    });
  } catch (err) {
    console.error('Failed to initialize GoogleGenerativeAI client:', err.message);
  }
} else {
  console.warn('GEMINI_API_KEY is not defined or is empty in environment variables. Client initialization skipped.');
}

// ────────────────────────────────────────────────────────────────────────────
// Call Execution Wrapper (Rate limiting + 15s Timeout + Error Classification)
// ────────────────────────────────────────────────────────────────────────────
async function executeGeminiCall(apiCallFn) {
  // 1. Atomically check and reserve a Gemini call slot (synchronous check-and-reserve)
  rateLimiter.acquireGeminiSlot();

  // 2. Wrap in 15-second timeout and execute asynchronous Gemini API call
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new GeminiTimeoutError('Gemini request timed out after 15 seconds.'));
    }, GEMINI_TIMEOUT_MS);
  });

  try {
    const result = await Promise.race([apiCallFn(), timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);

    // If it is our internal rate limiter error or timeout, rethrow directly
    if (err instanceof AppRateLimitError || err instanceof GeminiTimeoutError) {
      throw err;
    }

    // Inspect Gemini API error details for provider 429
    const errMessage = err.message || '';
    const errStatus = err.status || (err.response && err.response.status);
    if (
      errStatus === 429 ||
      errMessage.includes('429') ||
      errMessage.includes('RESOURCE_EXHAUSTED') ||
      errMessage.includes('quota') ||
      errMessage.includes('rate limit')
    ) {
      throw new GeminiProviderRateLimitError('Gemini provider rate limit hit, please wait a moment.');
    }

    // Wrap any other generic Gemini SDK errors
    throw new GeminiProviderError(`Gemini API call failed: ${errMessage}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Connectivity check (Phase 1 helper)
// ────────────────────────────────────────────────────────────────────────────
export async function verifyConnection() {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, message: 'GEMINI_API_KEY is missing or empty in .env.' };
  }
  if (!genAI || !generatorModel) {
    return { success: false, message: 'GoogleGenerativeAI client failed to initialize.' };
  }
  try {
    const result = await executeGeminiCall(() =>
      generatorModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Respond with the word "Verified" only.' }] }],
      })
    );
    const text = result.response.text().trim();
    return { success: true, message: `Successfully connected. Gemini response: "${text}"` };
  } catch (err) {
    return { success: false, message: `Gemini API call failed: ${err.message}` };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Agent 1: Generator
// ────────────────────────────────────────────────────────────────────────────
/**
 * Generates an improved resume bullet point using the Generator agent.
 * This is the ONLY function in the application that calls Gemini for generation.
 *
 * @param {string} originalBullet    - The original resume bullet to improve.
 * @param {string} [knownFacts='']   - Optional known facts (metrics, technologies, etc.).
 * @param {string} [previousFeedback=null] - Optional rejection feedback from verifier for retry.
 * @returns {Promise<string>} The rewritten bullet point text.
 * @throws {AppRateLimitError | GeminiTimeoutError | GeminiProviderRateLimitError | GeminiProviderError}
 */
export async function generateRewrite(originalBullet, knownFacts = '', previousFeedback = null) {
  if (!generatorModel) {
    throw new GeminiProviderError('Generator model is not initialized. Check GEMINI_API_KEY in .env.');
  }

  const userPrompt = getGeneratorUserPrompt(originalBullet, knownFacts, previousFeedback);

  const result = await executeGeminiCall(() =>
    generatorModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    })
  );

  return result.response.text().trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Agent 2: Verifier
// ────────────────────────────────────────────────────────────────────────────
/**
 * Independently verifies a rewritten resume bullet point against the three PRD hard rules.
 * This is the ONLY function in the application that calls Gemini for verification.
 * Structured JSON output is enforced via responseMimeType + responseSchema and defensively parsed.
 *
 * @param {string} originalBullet   - The original resume bullet.
 * @param {string} knownFacts       - Known facts provided by the user.
 * @param {string} rewrittenBullet  - The rewrite produced by Agent 1.
 * @returns {Promise<{approved: boolean, reason: string}>}
 * @throws {AppRateLimitError | GeminiTimeoutError | GeminiProviderRateLimitError | GeminiProviderError}
 */
export async function verifyRewrite(originalBullet, knownFacts, rewrittenBullet) {
  if (!verifierModel) {
    throw new GeminiProviderError('Verifier model is not initialized. Check GEMINI_API_KEY in .env.');
  }

  const userPrompt = getVerifierUserPrompt(originalBullet, knownFacts, rewrittenBullet);

  const result = await executeGeminiCall(() =>
    verifierModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    })
  );

  const rawText = result.response.text().trim();

  // Defensive JSON parsing as safety net (handles any malformed formatting cleanly)
  return parseVerifierJsonSafely(rawText);
}
