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

async function startServer() {
  await connectDB();
  
  // Verify email configuration non-blocking
  verifyEmailConfig().catch(err => console.error('Background Email Check Failed:', err));

  const app = express();
  const PORT = 3000;

  // Trust proxy for correct IP identification behind Cloud Run/Nginx
  // This is CRITICAL for Secure: true cookies and Google OAuth
  app.set('trust proxy', 1);

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(cors());
  app.use(helmet({
    contentSecurityPolicy: false, // For local dev and Swagger
  }));
  app.use(morgan('dev'));

  // Log all request paths to debug route matching
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // AI Studio Iframe Authentication Support
  app.use(session({
    secret: process.env.JWT_SECRET || 'cda-fallback-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      secure: true,      // Required for SameSite=None
      sameSite: 'none',  // Required for cross-origin iframe
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
  }));

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50000, // Extremely high limit to prevent 429s in normal multi-tab usage
    handler: (req, res) => {
      const clientIp = req.ip;
      console.warn(`Rate limit exceeded for IP: ${clientIp} on path: ${req.path}`);
      res.status(429).json({ 
        message: `Too many requests from this IP (${clientIp}). Please wait 15 minutes.`,
        ip: clientIp
      });
    },
    skip: (req) => {
      // Skip rate limiting for notification polling to keep UI responsive
      return req.path === '/notifications' || req.path === '/api/notifications';
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);

  // Stricter limit for auth routes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100, // 100 requests per 15 mins for auth is plenty
    message: { message: 'Too many authentication attempts, please try again later' }
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // Passport initialization
  app.use(passport.initialize());
  app.use(passport.session());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV
    });
  });

  app.get('/api', (req, res) => {
    res.json({ message: 'CDA Monitoring API' });
  });

  // Swagger Documentation
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'CDA Cooperative Monitoring API',
        version: '1.0.0',
        description: 'API for Cooperative Report Monitoring and Compliance',
      },
      servers: [{ url: '/api' }],
    },
    apis: ['./src/routes/*.ts'],
  };
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // --- API Routes ---
  app.get('/api/notifications', protect, async (req: any, res) => {
    try {
      const { Notification } = await import('./src/models/Notification.ts');
      const notifications = await Notification.find({ recipient: req.user!._id })
        .sort({ timestamp: -1 })
        .limit(50);
      const unreadCount = await Notification.countDocuments({ 
        recipient: req.user!._id, 
        isRead: false 
      });
      res.json({ notifications, unreadCount });
    } catch (error) {
      console.error('Direct fetch notifications error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.patch('/api/notifications/:id/read', protect, async (req: any, res) => {
    try {
      const { Notification } = await import('./src/models/Notification.ts');
      const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, recipient: req.user!._id },
        { isRead: true },
        { new: true }
      );
      if (!notification) return res.status(404).json({ message: 'Notification not found' });
      res.json(notification);
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.patch('/api/notifications/read-all', protect, async (req: any, res) => {
    try {
      const { Notification } = await import('./src/models/Notification.ts');
      await Notification.updateMany(
        { recipient: req.user!._id, isRead: false },
        { isRead: true }
      );
      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/settings', settingsRoutes);

  // Catch-all for undefined API routes
  app.use('/api', (req, res) => {
    console.warn(`404 API Route Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      message: `API route ${req.originalUrl} not found`,
      method: req.method,
      path: req.path,
      baseUrl: req.baseUrl
    });
  });

  // Error Handling
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
      message: err.message || 'Internal Server Error',
      error: process.env.NODE_ENV === 'development' ? err : {},
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📄 Swagger docs at http://localhost:${PORT}/api-docs`);
  });
}

startServer();
