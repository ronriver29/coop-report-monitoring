import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import session from 'express-session';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

dotenv.config();

import { createServer as createViteServer } from 'vite';
import { connectDB } from './src/config/db.ts';
import './src/config/passport.ts';
import { protect } from './src/middleware/auth.ts';
import { verifyEmailConfig } from './src/services/emailService.ts';

// Routes
import authRoutes from './src/routes/authRoutes.ts';
import reportRoutes from './src/routes/reportRoutes.ts';
import dashboardRoutes from './src/routes/dashboardRoutes.ts';
import auditRoutes from './src/routes/auditRoutes.ts';
import settingsRoutes from './src/routes/settingsRoutes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Trust proxy for correct IP identification
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(morgan('dev'));

// Session
app.use(session({
  secret: process.env.JWT_SECRET || 'cda-fallback-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000
  }
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Notifications
app.get('/api/notifications', protect, async (req: any, res) => {
  try {
    const { Notification } = await import('./src/models/Notification.ts');
    const notifications = await Notification.find({ recipient: req.user!._id }).sort({ timestamp: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ recipient: req.user!._id, isRead: false });
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Catch-all API 404
app.use('/api', (req, res) => {
  res.status(404).json({ message: `API route ${req.originalUrl} not found` });
});

// Setup function for Vite or Production Static serving
async function setupFrontend() {
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Start Server Logic
async function startServer() {
  await connectDB();
  await setupFrontend();
  
  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  }
  
  verifyEmailConfig().catch(err => console.error('Email check failed:', err));
}

// Global start
if (process.env.VERCEL !== '1') {
  startServer();
}

export default app;

