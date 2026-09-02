import dotenv from 'dotenv';
dotenv.config();

export const MIN_WORD_COUNT = 5;
export const MAX_WORD_COUNT = 40;
export const MAX_RETRIES = 2;

// 15 requests per minute by default for Gemini free tier (gemini-3.5-flash)
export const GEMINI_RPM_LIMIT = parseInt(process.env.GEMINI_RPM_LIMIT, 10) || 15;

// 15 seconds timeout for Gemini API calls
export const GEMINI_TIMEOUT_MS = parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 15000;

// Rate limit sliding window (1 minute = 60,000 ms)
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
