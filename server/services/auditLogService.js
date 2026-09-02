import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'auditLog.json');

/**
 * Ensures the data directory and audit log JSON file exist.
 * If auditLog.json is missing or corrupted/empty, initializes it with [].
 */
async function ensureAuditLogFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const content = await fs.readFile(AUDIT_LOG_FILE, 'utf-8');
      if (!content || content.trim() === '') {
        await fs.writeFile(AUDIT_LOG_FILE, '[]', 'utf-8');
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        await fs.writeFile(AUDIT_LOG_FILE, '[]', 'utf-8');
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('Error ensuring audit log file exists:', err.message);
    throw err;
  }
}

/**
 * Reads and parses all audit log entries from disk.
 * @returns {Promise<Array<Object>>}
 */
export async function getAllAuditLogs() {
  await ensureAuditLogFile();
  try {
    const raw = await fs.readFile(AUDIT_LOG_FILE, 'utf-8');
    if (!raw || raw.trim() === '') {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading audit log:', err.message);
    return [];
  }
}

/**
 * Retrieves a single audit log entry by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getAuditLogById(id) {
  const logs = await getAllAuditLogs();
  return logs.find((entry) => entry.id === id) || null;
}

/**
 * Appends a new session record to auditLog.json.
 *
 * @param {Object} sessionData
 * @param {string} sessionData.originalBullet
 * @param {string} [sessionData.knownFacts='']
 * @param {Array<Object>} sessionData.attempts
 * @param {string} sessionData.finalVerdict - 'approved' | 'approved_after_retry' | 'rejected' | 'error'
 * @param {string} [sessionData.finalRewrite='']
 * @param {number} sessionData.retriesUsed
 * @param {string} [sessionData.reason='']
 * @returns {Promise<Object>} The saved audit log entry.
 */
export async function saveAuditEntry({
  id = crypto.randomUUID(),
  originalBullet,
  knownFacts = '',
  attempts = [],
  finalVerdict,
  finalRewrite = '',
  retriesUsed = 0,
  reason = ''
}) {
  await ensureAuditLogFile();

  const entry = {
    id,
    originalBullet,
    knownFacts: knownFacts || '',
    attempts,
    finalVerdict,
    finalRewrite,
    retriesUsed,
    reason,
    timestamp: new Date().toISOString()
  };

  const logs = await getAllAuditLogs();
  logs.push(entry);

  await fs.writeFile(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  return entry;
}
