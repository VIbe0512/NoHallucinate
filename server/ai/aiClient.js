import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import 'dotenv/config';
import {
  SYSTEM_PROMPT_GENERATOR,
  getGeneratorUserPrompt,
  SYSTEM_PROMPT_VERIFIER,
  getVerifierUserPrompt
} from './prompts.js';

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
// Connectivity check (Phase 1 helper — kept intact)
// ────────────────────────────────────────────────────────────────────────────
export async function verifyConnection() {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, message: 'GEMINI_API_KEY is missing or empty in .env.' };
  }
  if (!genAI || !generatorModel) {
    return { success: false, message: 'GoogleGenerativeAI client failed to initialize.' };
  }
  try {
    const result = await generatorModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Respond with the word "Verified" only.' }] }],
    });
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
 * @param {string} originalBullet  - The original resume bullet to improve.
 * @param {string} [knownFacts=''] - Optional known facts (metrics, technologies, etc.).
 * @returns {Promise<string>} The rewritten bullet point text.
 * @throws {Error} If the Gemini call fails or the client is not initialized.
 */
export async function generateRewrite(originalBullet, knownFacts = '') {
  if (!generatorModel) {
    throw new Error('Generator model is not initialized. Check GEMINI_API_KEY in .env.');
  }

  const userPrompt = getGeneratorUserPrompt(originalBullet, knownFacts);

  try {
    const result = await generatorModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });
    const text = result.response.text().trim();
    return text;
  } catch (err) {
    throw new Error(`Agent 1 (Generator) Gemini call failed: ${err.message}`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Agent 2: Verifier
// ────────────────────────────────────────────────────────────────────────────
/**
 * Independently verifies a rewritten resume bullet point against the three PRD hard rules.
 * This is the ONLY function in the application that calls Gemini for verification.
 * Structured JSON output is enforced via responseMimeType + responseSchema at the API level.
 *
 * @param {string} originalBullet   - The original resume bullet.
 * @param {string} knownFacts       - Known facts provided by the user.
 * @param {string} rewrittenBullet  - The rewrite produced by Agent 1.
 * @returns {Promise<{approved: boolean, reason: string}>}
 * @throws {Error} If the Gemini call fails or the client is not initialized.
 */
export async function verifyRewrite(originalBullet, knownFacts, rewrittenBullet) {
  if (!verifierModel) {
    throw new Error('Verifier model is not initialized. Check GEMINI_API_KEY in .env.');
  }

  const userPrompt = getVerifierUserPrompt(originalBullet, knownFacts, rewrittenBullet);

  try {
    const result = await verifierModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    });
    const rawText = result.response.text().trim();

    // Primary: Gemini returns valid JSON via responseMimeType + responseSchema
    const parsed = JSON.parse(rawText);

    if (typeof parsed.approved !== 'boolean' || typeof parsed.reason !== 'string') {
      throw new Error('Verifier JSON response is missing required fields: approved (boolean), reason (string).');
    }

    return { approved: parsed.approved, reason: parsed.reason };
  } catch (err) {
    throw new Error(`Agent 2 (Verifier) Gemini call failed: ${err.message}`);
  }
}
