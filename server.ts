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

// Trust proxy for session cookies and IP logging
app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(morgan('dev'));

// Static Health Check for verification
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(), 
    env: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL
  });
});

// Session Gateway
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

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50000,
  handler: (req, res) => {
    const clientIp = req.ip;
    res.status(429).json({ 
      message: `Too many requests from this IP (${clientIp}). Please wait 15 minutes.`,
      ip: clientIp
    });
  },
  skip: (req) => req.path === '/notifications' || req.path === '/api/notifications',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Auth Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many authentication attempts, please try again later' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Passport
app.use(passport.initialize());
app.use(passport.session());

// API Root Info
app.get('/api', (req, res) => {
  res.json({ title: 'CDA Cooperative Monitoring API', status: 'operational' });
});

// Swagger
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'CDA Cooperative Monitoring API', version: '1.0.0' },
    servers: [{ url: '/api' }],
  },
  apis: ['./src/routes/*.{ts,js}', './src/routes/*.ts'],
};
let swaggerSpec: any = {};
try {
  swaggerSpec = swaggerJsdoc(swaggerOptions);
} catch (e) {
  console.warn('Swagger documentation failed to initialize:', e);
}
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- API Route Mounts ---
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/settings', settingsRoutes);

// Shared Notifications
app.get('/api/notifications', protect, async (req: any, res) => {
  try {
    const { Notification } = await import('./src/models/Notification.ts');
    const notifications = await Notification.find({ recipient: req.user!._id }).sort({ timestamp: -1 }).limit(50);
    const unreadCount = await Notification.countDocuments({ recipient: req.user!._id, isRead: false });
    res.json({ notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

// standard 404 for undefined API routes
app.use('/api', (req, res) => {
  res.status(404).json({ message: `API Endpoint ${req.originalUrl} not found` });
});

// --- GLOBAL ERROR HANDLER ---
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Global Error Handler]', err);
  
  // If headers already sent, pass to next default handler
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : undefined,
    path: req.url,
    method: req.method
  });
});

// Serve frontend assets
async function initFrontend() {
  if (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // SPA Fallback
    app.get('*', (req, res) => {
      // Don't serve HTML index for missing /api routes
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ message: 'API not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Global Bootstrap
async function bootstrap() {
  if (process.env.VERCEL === '1') {
    // On Vercel, we don't want the background bootstrap to fight with the request handler
    // But we still need to initialize the frontend route if it's the one serving it
    await initFrontend();
    return;
  }

  await connectDB();
  await initFrontend();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CDA Monitoring Server running on port ${PORT}`);
  });
  
  verifyEmailConfig().catch(err => console.error('Bootstrap Email Warning:', err));
}

// Run bootstrap only if not on Vercel (where api/index handles DB)
if (process.env.VERCEL !== '1') {
  bootstrap().catch(err => console.error('Fatal Bootstrap Error:', err));
} else {
  // On Vercel, just ensure frontend routes are registered
  initFrontend().catch(err => console.error('Vercel Frontend Init Error:', err));
}

export default app;


