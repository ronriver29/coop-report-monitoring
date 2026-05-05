import mongoose, { Schema, Document, Model } from 'mongoose';

export const SettingCategory = {
  GENERAL: 'GENERAL',
  INTEGRATIONS: 'INTEGRATIONS',
  NOTIFICATIONS: 'NOTIFICATIONS',
  SECURITY: 'SECURITY'
} as const;

export type SettingCategory = typeof SettingCategory[keyof typeof SettingCategory];

export interface ISettings extends Document {
  key: string;
  value: any;
  category: SettingCategory;
  description?: string;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  value: {
    type: Schema.Types.Mixed,
    required: true
  },
  category: {
    type: String,
    enum: Object.values(SettingCategory),
    default: SettingCategory.GENERAL
  },
  description: String,
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

const Settings: Model<ISettings> = mongoose.models.Settings || mongoose.model<ISettings>('Settings', settingsSchema);
export { Settings };
export default Settings;