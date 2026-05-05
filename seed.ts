import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from './src/config/db';
import User from './src/models/User';
import { UserRole } from './src/constants';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  await connectDB();
  
  const adminEmail = 'admin@cda.gov.ph';
  const existing = await User.findOne({ email: adminEmail });
  
  if (!existing) {
    const hashedPassword = await bcrypt.hash('CDA-Admin-2026!', 10);
    await User.create({
      displayName: 'System Administrator',
      email: adminEmail,
      role: UserRole.ADMIN,
      password: hashedPassword,
      mustChangePassword: true
    });
    console.log('✅ Admin user created successfully.');
  } else {
    console.log('ℹ️ Admin user already exists.');
  }
  
  process.exit();
}

seed();
