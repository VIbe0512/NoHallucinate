import { AppRateLimitError } from './rateLimiter.js';
import {
  GeminiProviderRateLimitError,
  GeminiTimeoutError,
  GeminiProviderError
} from '../ai/aiClient.js';

/**
 * Centralized Express error handler middleware.
 * Sanitizes errors, sets appropriate HTTP status codes, and prevents leaking API keys or stack traces.
 */
export function errorHandler(err, req, res, next) {
  // 1. Application-level Gemini Rate Limit reached (internal budget exhausted)
  if (err instanceof AppRateLimitError || err.isAppRateLimit) {
    return res.status(429).json({
      success: false,
      error: err.message || 'Agent temporarily unavailable due to API request limits.',
      retryAfter: err.retryAfter || 60
    });
  }

  // 2. Gemini Provider's own 429 Rate Limit error
  if (err instanceof GeminiProviderRateLimitError || err.isProviderRateLimit) {
    return res.status(429).json({
      success: false,
      error: 'Gemini provider rate limit hit, please wait a moment.'
    });
  }

  // 3. Gemini API Request Timeout (15s exceeded)
  if (err instanceof GeminiTimeoutError || err.isTimeout) {
    return res.status(504).json({
      success: false,
      error: 'Gemini request timed out after 15 seconds.'
    });
  }

  // 4. Gemini Provider Service / Connectivity failure
  if (err instanceof GeminiProviderError || err.isProviderError) {
    // Sanitize any potential API keys from the error message string
    const sanitizedMessage = (err.message || 'Gemini API call failed.').replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=***');
    return res.status(502).json({
      success: false,
      error: sanitizedMessage
    });
  }

  // 5. Custom status code attached to error (e.g. 400 Bad Request)
  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message || 'Bad Request'
    });
  }

  // 6. Generic / Unexpected Internal Server Error
  console.error('[Unhandled Server Error]:', err);
  return res.status(500).json({
    success: false,
    error: 'An unexpected internal server error occurred.'
  });
}
