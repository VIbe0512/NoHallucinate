import express from 'express';
import { validateInput } from '../middleware/validateInput.js';
import { orchestrateRewrite } from '../services/rewriteService.js';

const router = express.Router();

/**
 * POST /api/rewrite
 * Initiates the dual-agent resume bullet rewrite & verification flow.
 */
router.post('/rewrite', validateInput, async (req, res, next) => {
  try {
    const { originalBullet, knownFacts } = req.body;
    const result = await orchestrateRewrite(originalBullet, knownFacts);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
