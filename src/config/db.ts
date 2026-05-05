import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cda_monitoring';

let isConnected = false;

export const connectDB = async () => {
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    isConnected = true;
    console.log('MongoDB Connected to:', mongoose.connection.host);

    // Only drop index on true connection establishment, and not in every serverless hit if possible
    if (mongoose.connection.readyState === 1) {
      try {
        const User = mongoose.connection.collection('users');
        await User.dropIndex('googleId_1');
        console.log('Dropped legacy googleId index for sparse recreation');
      } catch (e) {
        // Safe to ignore if index doesn't exist
      }
    }
    return db;
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    console.warn('⚠️ Server starting without active database connection. Some features may fail.');
    // Do not process.exit(1) to allow the app to stay "Running" and potentially recover or show error UI
  }
};
