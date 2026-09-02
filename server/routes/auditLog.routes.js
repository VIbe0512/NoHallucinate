import express from 'express';
import { getAllAuditLogs, getAuditLogById } from '../services/auditLogService.js';

const router = express.Router();

/**
 * GET /api/audit-log
 * Retrieves all stored rewrite session records.
 */
router.get('/audit-log', async (req, res, next) => {
  try {
    const logs = await getAllAuditLogs();
    return res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/audit-log/:id
 * Retrieves a single rewrite session record by ID.
 */
router.get('/audit-log/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const log = await getAuditLogById(id);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: `Audit log entry with ID "${id}" was not found.`
      });
    }

    return res.status(200).json({
      success: true,
      log
    });
  } catch (err) {
    next(err);
  }
});

export default router;
