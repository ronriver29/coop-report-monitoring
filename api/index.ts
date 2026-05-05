import { connectDB } from '../src/config/db';
import expressApp from '../server';

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
  console.log(`[Vercel Handler] ${req.method} ${req.url} (Path: ${req.path || 'n/a'})`);

  // 2. Ensure DB Connection
  try {
    await connectDB();
  } catch (dbError: any) {
    console.error('[Vercel Handler] Database connection attempt failed:', dbError.message);
  }

  // 3. Hand over to Express
  try {
    if (typeof expressApp !== 'function') {
      console.error('[Vercel Handler] Express App is not a function:', typeof expressApp);
      throw new Error('Express app failed to initialize correctly.');
    }
    
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
