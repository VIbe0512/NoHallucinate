import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyConnection } from './ai/aiClient.js';
import rewriteRoutes from './routes/rewrite.routes.js';
import auditLogRoutes from './routes/auditLog.routes.js';
import agentStatusRoutes from './routes/agentStatus.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Standard Middleware
app.use(cors());
app.use(express.json());

// Phase 1 Health Endpoint (Preserved)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'NoHallucinate backend is running',
    timestamp: new Date().toISOString()
  });
});

// Phase 3 API Routes
app.use('/api', rewriteRoutes);
app.use('/api', auditLogRoutes);
app.use('/api', agentStatusRoutes);

// Centralized Error Handling Middleware (Registered LAST)
app.use(errorHandler);

// Start the server only when executed directly as main script
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Verifying Gemini API provider connection...');

    const verification = await verifyConnection();
    if (verification.success) {
      console.log(`[Gemini OK] ${verification.message}`);
    } else {
      console.warn(`[Gemini FAILED] Provider verification could not be completed.`);
      console.warn(`Reason: ${verification.message}`);
      console.warn(`Please set a valid GEMINI_API_KEY in server/.env to resolve this.`);
    }
  });
}

export default app;
