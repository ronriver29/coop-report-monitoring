import mongoose from 'mongoose';

export const SettingCategory = {
  GENERAL: 'GENERAL',
  INTEGRATIONS: 'INTEGRATIONS',
  NOTIFICATIONS: 'NOTIFICATIONS',
  SECURITY: 'SECURITY'
} as const;

export type SettingCategory = typeof SettingCategory[keyof typeof SettingCategory];

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  category: {
    type: String,
    enum: Object.values(SettingCategory),
    default: SettingCategory.GENERAL
  },
  description: String,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

export const Settings = mongoose.model('Settings', settingsSchema);
