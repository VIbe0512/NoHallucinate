import { MIN_WORD_COUNT, MAX_WORD_COUNT } from '../config/constants.js';
import { countWords } from '../utils/wordCount.js';

/**
 * Express middleware to validate resume bullet input before AI invocation.
 * Rejects invalid requests with 400 Bad Request before any Gemini calls occur.
 */
export function validateInput(req, res, next) {
  const { originalBullet, knownFacts } = req.body || {};

  if (!originalBullet || typeof originalBullet !== 'string' || originalBullet.trim() === '') {
    return res.status(400).json({
      success: false,
      error: `Resume bullet is required and must contain between ${MIN_WORD_COUNT} and ${MAX_WORD_COUNT} words.`
    });
  }

  const wordCount = countWords(originalBullet);
  if (wordCount < MIN_WORD_COUNT || wordCount > MAX_WORD_COUNT) {
    return res.status(400).json({
      success: false,
      error: `Resume bullet must contain between ${MIN_WORD_COUNT} and ${MAX_WORD_COUNT} words.`
    });
  }

  if (knownFacts !== undefined && knownFacts !== null && typeof knownFacts !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Known facts must be a string if provided.'
    });
  }

  next();
}
