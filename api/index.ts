import { connectDB } from '../src/config/db';

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

  // 1. Log request for Vercel logs visibility
  console.log(`[Vercel Handler] ${req.method} ${req.url}`);

  // 2. Ensure DB Connection (Singleton style)
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
      console.log('[Vercel Handler] Database connected successfully');
    } catch (dbError: any) {
      console.error('[Vercel Handler] Database Connection Error:', dbError);
      // We don't return early here to let Express handle the response, 
      // but the app will likely fail on DB queries.
    }
  }

  // 3. Hand over to Express
  try {
    const { default: expressApp } = await import('../server');
    return expressApp(req, res);
  } catch (error: any) {
    console.error('[Vercel Handler] Express Execution Crash:', error);
    res.status(500).json({
      message: 'Serverless Function Execution Failed',
      error: error.message || 'Unknown Error'
    });
  }
};
