import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from './src/config/db.ts';
import User from './src/models/User.ts';
import { UserRole } from './src/constants.ts';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  await connectDB();
  
  const adminEmail = 'admin@cda.gov.ph';
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const existing = await User.findOne({ email: adminEmail });
  
  if (!existing) {
    await User.create({
      displayName: 'System Administrator',
      email: adminEmail,
      role: UserRole.ADMIN,
      password: hashedPassword,
      mustChangePassword: false,
      isActive: true
    });
    console.log('✅ Admin user created successfully.');
  } else {
    existing.password = hashedPassword;
    await existing.save();
    console.log('ℹ️ Admin user password reset to admin123.');
  }
  
  process.exit();
}

seed();
