import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// Ensure env variables are loaded (this is fallback, main server.js should also do it)
const apiKey = process.env.GEMINI_API_KEY;

let genAI = null;
let model = null;

if (apiKey && apiKey.trim() !== '') {
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
  } catch (err) {
    console.error('Failed to initialize GoogleGenerativeAI client:', err.message);
  }
} else {
  console.warn('GEMINI_API_KEY is not defined or is empty in environment variables. Client initialization skipped.');
}

/**
 * Verifies connectivity to the Gemini API by making a simple prompt call.
 * This is used during Phase 1 validation.
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function verifyConnection() {
  if (!apiKey || apiKey.trim() === '') {
    return {
      success: false,
      message: 'GEMINI_API_KEY is missing or empty in .env.'
    };
  }

  if (!genAI || !model) {
    return {
      success: false,
      message: 'GoogleGenerativeAI client failed to initialize.'
    };
  }

  try {
    // A minimal test prompt as specified by the PRD
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Respond with the word "Verified" only.' }] }]
    });

    const text = result.response.text().trim();
    return {
      success: true,
      message: `Successfully connected. Gemini response: "${text}"`
    };
  } catch (err) {
    return {
      success: false,
      message: `Gemini API call failed: ${err.message}`
    };
  }
}

// Future implementation slots (to be filled in Phase 2)
export async function generateRewrite() {
  throw new Error('generateRewrite() not implemented in Phase 1.');
}

export async function verifyRewrite() {
  throw new Error('verifyRewrite() not implemented in Phase 1.');
}
