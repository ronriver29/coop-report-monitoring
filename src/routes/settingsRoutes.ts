import express from 'express';
import { Settings, SettingCategory } from '../models/Settings.ts';
import { protect, restrictTo } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { UserRole } from '../constants.ts';
import { logAction } from '../services/auditService.ts';

const router = express.Router();

// Get all settings (restricted to ADMIN)
router.get('/', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const settings = await Settings.find().sort({ category: 1, key: 1 });
    res.json(settings);
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ message: 'Server error fetching settings' });
  }
});

// Update or create a setting (restricted to ADMIN)
router.post('/', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { key, value, category, description } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ message: 'Key and value are required' });
    }

    const setting = await Settings.findOneAndUpdate(
      { key },
      { 
        value, 
        category: category || SettingCategory.GENERAL, 
        description,
        updatedBy: req.user!._id
      },
      { upsert: true, new: true }
    );

    await logAction(
      req.user!._id.toString(),
      'SYSTEM_SETTING_UPDATED',
      `Updated system setting: ${key}`,
      'SYSTEM',
      setting._id.toString()
    );

    res.json(setting);
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ message: 'Server error updating setting' });
  }
});

// Initialize default settings if they don't exist
router.post('/init', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const defaults = [
      { key: 'APP_NAME', value: 'CDA Data Ingestion System', category: SettingCategory.GENERAL, description: 'The name of the application' },
      { key: 'MAINTENANCE_MODE', value: false, category: SettingCategory.GENERAL, description: 'Enable or disable maintenance mode' },
      { key: 'MAX_FILE_SIZE_MB', value: 10, category: SettingCategory.GENERAL, description: 'Maximum allowed CSV file size in MB' },
      { key: 'ALLOW_PUBLIC_REGISTRATION', value: false, category: SettingCategory.SECURITY, description: 'Allow users to register themselves' },
      { key: 'NOTIFY_ON_NEW_REPORT', value: true, category: SettingCategory.NOTIFICATIONS, description: 'Notify admins when a new report is ingested' },
    ];

    for (const d of defaults) {
      await Settings.findOneAndUpdate({ key: d.key }, d, { upsert: true });
    }

    const settings = await Settings.find();
    res.json(settings);
  } catch (error) {
    console.error('Init settings error:', error);
    res.status(500).json({ message: 'Server error initializing settings' });
  }
});

export default router;
