import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cda_monitoring';

export const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB Connected successfully');

    // Force drop incorrect googleId index if it exists to allow sparse index to take effect
    try {
      const User = mongoose.connection.collection('users');
      // Drop the index to let Mongoose recreate it with 'sparse: true' defined in the schema
      await User.dropIndex('googleId_1');
      console.log('Dropped legacy googleId index for sparse recreation');
    } catch (e) {
      // Safe to ignore if index doesn't exist
    }
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err);
    console.warn('⚠️ Server starting without active database connection. Some features may fail.');
    // Do not process.exit(1) to allow the app to stay "Running" and potentially recover or show error UI
  }
};
