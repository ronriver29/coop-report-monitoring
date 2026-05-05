import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.ts';
import type { IUser } from '../models/User.ts';
import { UserRole } from '../constants.ts';

export interface AuthRequest extends express.Request {
  user?: IUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'cda-fallback-secret-key-2026';

export const generateToken = (id: string) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: '7d', // Increased for better user experience
  });
};

export const protect = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    req.user = (await User.findById(decoded.id)) || undefined;
    
    if (!req.user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }
    
    if (!req.user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }
    
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      const expiredAt = error.expiredAt;
      console.warn(`Token expired at ${expiredAt}. User session reached limit.`);
      return res.status(401).json({ 
        message: 'Token expired', 
        expired: true,
        code: 'TOKEN_EXPIRED' 
      });
    }
    console.error('Auth Middleware Error:', error.message);
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

export const restrictTo = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action',
      });
    }
    next();
  };
};
