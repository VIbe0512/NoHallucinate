import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { verifyConnection } from './ai/aiClient.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Simple health/hello-world endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'NoHallucinate backend is running',
    timestamp: new Date().toISOString()
  });
});

// Start the server
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
