import app from '../server.ts';
import { connectDB } from '../src/config/db.ts';

// Vercel Serverless Function entry point
// Ensures DB is connected if it isn't already
export default async (req: any, res: any) => {
  await connectDB();
  return app(req, res);
};
