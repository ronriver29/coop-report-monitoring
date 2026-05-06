import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.ts';
import expressApp from '../server.ts';

let isConnected = false;

export default async (req: any, res: any) => {
  // 0. Environment Validation
  if (!process.env.MONGODB_URI) {
    console.error('[Vercel Handler] CRITICAL: MONGODB_URI is not set in environment variables.');
    return res.status(500).json({
      message: 'Server Configuration Error',
      error: 'Database connection string is missing. Please set MONGODB_URI in Vercel settings.'
    });
  }

  // 1. Log request details
  console.log(`[Vercel Handler] ${req.method} ${req.url}`);
  console.log('[Vercel Handler] Memory Usage:', Math.round(process.memoryUsage().rss / 1024 / 1024), 'MB');

  // 2. Ensure DB Connection
  try {
    const conn = await connectDB();
    const dbConnected = conn?.readyState === 1;
    console.log('[Vercel Handler] DB Connection state:', dbConnected ? 'CONNECTED' : 'NOT CONNECTED');
    if (!dbConnected) {
      console.warn('[Vercel Handler] DB is not in connected state, attempting to proceed anyway.');
    }
  } catch (dbError: any) {
    console.error('[Vercel Handler] Database connection attempt failed:', dbError.message);
    // Continue despite DB error to let Express handle potential recovery or show its own error UI
  }

  // 3. Hand over to Express
  try {
    const pathOnly = req.url?.split('?')[0] || '';
    if (pathOnly === '/') {
       return res.status(200).json({ status: 'cda-api-active', environment: 'vercel-serverless' });
    }

    if (typeof expressApp !== 'function') {
      console.error('[Vercel Handler] Express App is not a function:', typeof expressApp);
      throw new Error('Express app failed to initialize correctly.');
    }
    
    console.log(`[Vercel Handler] Routing to Express: ${req.method} ${req.url}`);
    return expressApp(req, res);
  } catch (error: any) {
    console.error('[Vercel Handler] FATAL ERROR:', error);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      message: 'The Application Server encountered a fatal error during execution.',
      error: error.message || 'Unknown Execution Error',
      path: req.url
    });
  }
};
