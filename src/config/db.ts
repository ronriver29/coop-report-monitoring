import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../models/User.ts';
import { UserRole } from '../constants.ts';
import path from 'path';

dotenv.config({ override: true, path: path.resolve(process.cwd(), '.env') });

const getMongoDBURI = () => process.env.MONGODB_URI || 'mongodb://localhost:27017/cda_monitoring';

let mongoServerInstance: any = null;

export const connectDB = async () => {
  const readyState = mongoose.connection.readyState;
  if (readyState === 1 || readyState === 2) {
    return mongoose.connection;
  }

  try {
    console.log('[DB] Attempting to connect to MongoDB...');
    
    const uri = getMongoDBURI();
    // If local localhost-like host is specified (usually ECONNREFUSED in sandbox environment),
    // skip wait and directly fall back to memory server.
    const isLocalhost = uri.includes('localhost') || uri.includes('127.0.0.1');
    if (isLocalhost) {
      throw new Error('Connection to localhost/127.0.0.1 skipped — using local sandbox in-memory MongoDB instead.');
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log('[DB] MongoDB Connected successfully to remote database');
  } catch (err: any) {
    console.warn('[DB] Connection to direct MongoDB failed:', err.message || err);
    
    // If the error is an authentication error from Atlas, DO NOT fall back to memory server.
    // The user explicitly wants to use Atlas, but their credentials are bad.
    if (err.message && err.message.toLowerCase().includes('bad auth')) {
      console.error('[DB] FATAL ERROR: Authentication to MongoDB Atlas failed. Please check your username and password.');
      throw err; // Propagate the error so the user knows they need to fix credentials
    }
    
    console.log('[DB] Falling back to automated in-memory MongoDB (MongoMemoryServer)...');
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      if (!mongoServerInstance) {
        mongoServerInstance = await MongoMemoryServer.create();
      }
      const uri = mongoServerInstance.getUri();
      console.log(`[DB] MongoMemoryServer instance available at: ${uri}`);

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
      console.log('[DB] Connected to in-memory fallback successfully.');
    } catch (memErr: any) {
      console.error('[DB] Fallback in-memory MongoDB failed:', memErr.message || memErr);
      throw memErr;
    }
  }

  // Perform index setup & initial seeding if connection successfully open
  if (mongoose.connection.readyState === 1) {
    try {
      const usersCollection = mongoose.connection.collection('users');
      if (usersCollection) {
        await usersCollection.dropIndex('googleId_1');
        console.log('[DB] Dropped legacy googleId index');
      }
    } catch (e) {
      // Safe to ignore if index doesn't exist
    }

    // Auto-seed default admin credentials if they don't exist
    try {
      const adminEmail = 'admin@cda.gov.ph';
      const existing = await User.findOne({ email: adminEmail });
      if (!existing) {
        const hashedPassword = await bcrypt.hash('CDA-Admin-2026!', 10);
        await User.create({
          displayName: 'System Administrator',
          email: adminEmail,
          role: UserRole.ADMIN,
          password: hashedPassword,
          mustChangePassword: true,
          isActive: true
        });
        console.log('[DB Seed Setup] Default System Administrator account seeded successfully.');
      } else {
        console.log('[DB Seed Setup] Admin account already present.');
      }
    } catch (seedErr: any) {
      console.error('[DB Seed Setup] Seeding error:', seedErr.message || seedErr);
    }
  }

  return mongoose.connection;
};

