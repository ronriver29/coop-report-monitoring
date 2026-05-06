import mongoose, { Schema, Document } from 'mongoose';
import { UserRole } from '../constants.ts';

export interface IUser extends Document {
  googleId?: string;
  password?: string;
  displayName: string;
  email: string;
  role: UserRole;
  region?: string;
  isActive: boolean;
  mustChangePassword?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    googleId: { type: String, unique: true, sparse: true },
    password: { type: String, select: false },
    displayName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    region: { type: String }, // PSGC Region ID
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.VIEWER,
    },
  },
  { timestamps: true }
);

const User: mongoose.Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
export default User;
