import express from 'express';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * GET /api/agent-status
 * Returns the current availability state of the Agent (Available / Unavailable)
 * and countdown seconds (retryAfter) if rate-limited.
 */
router.get('/agent-status', (req, res) => {
  const status = rateLimiter.getAgentStatus();
  return res.status(200).json(status);
});

export default router;
