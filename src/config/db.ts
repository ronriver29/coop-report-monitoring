import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cda_monitoring';

let isConnected = false;

export const connectDB = async () => {
  const readyState = mongoose.connection.readyState;
  if (readyState === 1 || readyState === 2) {
    return mongoose.connection;
  }

  try {
    console.log('[DB] Attempting to connect to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    isConnected = true;
    console.log('[DB] MongoDB Connected successfully');

    // Only drop index on true connection establishment
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
    }
    return mongoose.connection;
  } catch (err: any) {
    console.error('❌ MongoDB Connection Error:', err.message || err);
    console.warn('⚠️ Server starting without active database connection.');
    throw err; // Throwing so the caller knows it failed
  }
};
