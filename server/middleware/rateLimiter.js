import { GEMINI_RPM_LIMIT, RATE_LIMIT_WINDOW_MS } from '../config/constants.js';

/**
 * Custom error thrown when the application-level Gemini request budget is exhausted.
 */
export class AppRateLimitError extends Error {
  constructor(retryAfter, message = 'Agent temporarily unavailable due to API request limits.') {
    super(message);
    this.name = 'AppRateLimitError';
    this.statusCode = 429;
    this.retryAfter = retryAfter;
    this.isAppRateLimit = true;
  }
}

/**
 * In-Memory Gemini API Call Rate Limiter & Agent Availability Tracker.
 *
 * Designed to track actual Gemini API calls (Agent 1 + Agent 2 + Retries)
 * against the provider's 15 requests/minute quota.
 */
class GeminiRateLimiter {
  constructor(limit = GEMINI_RPM_LIMIT, windowMs = RATE_LIMIT_WINDOW_MS) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.currentWindowStart = Date.now();
    this.geminiRequestCount = 0;
  }

  /**
   * Resets the current window if the 1-minute duration has passed.
   * @private
   */
  _refreshWindow() {
    const now = Date.now();
    if (now - this.currentWindowStart >= this.windowMs) {
      this.currentWindowStart = now;
      this.geminiRequestCount = 0;
    }
  }

  /**
   * Calculates the remaining seconds in the current 1-minute window.
   * @returns {number} Seconds remaining (minimum 1 second).
   */
  getRetryAfterSeconds() {
    const elapsed = Date.now() - this.currentWindowStart;
    const remainingMs = Math.max(0, this.windowMs - elapsed);
    return Math.max(1, Math.ceil(remainingMs / 1000));
  }

  /**
   * Checks whether Gemini calls are currently permitted.
   * @returns {{ allowed: boolean, count: number, limit: number, retryAfter?: number }}
   */
  checkGeminiAvailability() {
    this._refreshWindow();
    if (this.geminiRequestCount < this.limit) {
      return {
        allowed: true,
        count: this.geminiRequestCount,
        limit: this.limit
      };
    }
    return {
      allowed: false,
      count: this.geminiRequestCount,
      limit: this.limit,
      retryAfter: this.getRetryAfterSeconds()
    };
  }

  /**
   * Atomically checks availability and reserves a Gemini API slot in a single synchronous operation.
   *
   * Flow:
   * 1. Check whether current 1-minute window expired and reset if needed.
   * 2. Check whether geminiRequestCount < limit.
   * 3. If available, synchronously increment counter and reserve slot immediately.
   * 4. If unavailable, throw AppRateLimitError immediately.
   *
   * @returns {number} The updated call count (slot number).
   * @throws {AppRateLimitError} If the limit is reached.
   */
  acquireGeminiSlot() {
    this._refreshWindow();
    if (this.geminiRequestCount >= this.limit) {
      const retryAfter = this.getRetryAfterSeconds();
      throw new AppRateLimitError(retryAfter);
    }
    this.geminiRequestCount += 1;
    return this.geminiRequestCount;
  }

  /**
   * Records an actual Gemini API call by acquiring a slot atomically.
   * Backward-compatible alias for acquireGeminiSlot.
   *
   * @returns {number} The updated call count.
   * @throws {AppRateLimitError} If the limit is reached.
   */
  recordGeminiCall() {
    return this.acquireGeminiSlot();
  }

  /**
   * Returns current global Agent availability status.
   * @returns {{ status: 'Available' | 'Unavailable', retryAfter?: number, currentCount?: number, limit?: number }}
   */
  getAgentStatus() {
    this._refreshWindow();
    if (this.geminiRequestCount < this.limit) {
      return {
        status: 'Available'
      };
    }
    return {
      status: 'Unavailable',
      retryAfter: this.getRetryAfterSeconds()
    };
  }

  /**
   * Resets the limiter state (primarily for tests).
   */
  resetLimiter() {
    this.currentWindowStart = Date.now();
    this.geminiRequestCount = 0;
  }

  /**
   * Dynamically adjust limit (useful during testing).
   * @param {number} newLimit
   */
  setLimit(newLimit) {
    this.limit = newLimit;
  }

  /**
   * Restores default limit from constants.
   */
  restoreDefaultLimit() {
    this.limit = GEMINI_RPM_LIMIT;
  }

  /**
   * Returns current count and limit.
   */
  getMetrics() {
    this._refreshWindow();
    return {
      count: this.geminiRequestCount,
      limit: this.limit,
      windowStart: this.currentWindowStart
    };
  }
}

// Singleton rate limiter instance
export const rateLimiter = new GeminiRateLimiter();

/**
 * Express middleware helper to check agent status on incoming requests if needed.
 */
export function requireAgentAvailability(req, res, next) {
  const availability = rateLimiter.checkGeminiAvailability();
  if (!availability.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Agent temporarily unavailable due to API request limits.',
      retryAfter: availability.retryAfter
    });
  }
  next();
}
