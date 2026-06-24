import express from 'express';
import { Settings, SettingCategory } from '../models/Settings.ts';
import { protect, restrictTo } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { UserRole } from '../constants.ts';
import { logAction } from '../services/auditService.ts';

import { getEmailStatus, verifyEmailConfig } from '../services/emailService.ts';

const router = express.Router();

/**
 * @swagger
 * /api/settings/email-status:
 *   get:
 *     summary: Get email service status (Admin Only)
 *     description: Checks whether SMTP is successfully configured and active, returning connection health metrics.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection status response
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden (Admin only)
 *       500:
 *         description: Verification check failed
 */
router.get('/email-status', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const status = await getEmailStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching email status' });
  }
});

/**
 * @swagger
 * /api/settings/email-verify:
 *   post:
 *     summary: Trigger an SMTP connection re-verification (Admin Only)
 *     description: Pings the configured SMTP host using active credentials to test and confirm immediate status delivery.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dynamic status verification result
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Verification error
 */
router.post('/email-verify', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const success = await verifyEmailConfig();
    const status = await getEmailStatus();
    res.json({ success, status });
  } catch (error) {
    res.status(500).json({ message: 'Error verifying email' });
  }
});

/**
 * @swagger
 * /api/settings/smtp:
 *   post:
 *     summary: Update or create SMTP settings (Admin Only)
 *     description: Stores SMTP configurations such as Host, Port, secure protocol flag, username, and password in settings.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               host:
 *                 type: string
 *               port:
 *                 type: string
 *               user:
 *                 type: string
 *               pass:
 *                 type: string
 *               from:
 *                 type: string
 *               secure:
 *                 type: string
 *               service:
 *                 type: string
 *     responses:
 *       200:
 *         description: Configuration updated and re-verified successfully
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Invalid parameters or configuration error
 */
router.post('/smtp', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const { host, port, user, pass, from } = req.body;

    const updates = [
      { key: 'EMAIL_HOST', value: host || '', category: SettingCategory.NOTIFICATIONS, description: 'SMTP Host Server' },
      { key: 'EMAIL_PORT', value: port || '587', category: SettingCategory.NOTIFICATIONS, description: 'SMTP Port Number' },
      { key: 'EMAIL_USER', value: user || '', category: SettingCategory.NOTIFICATIONS, description: 'SMTP Username/Email address' },
      { key: 'EMAIL_FROM', value: from || '', category: SettingCategory.NOTIFICATIONS, description: 'SMTP Sender Email' },
    ];

    // If password is not provided or is masked '••••••••', don't update it!
    if (pass && pass !== '••••••••' && pass.trim() !== '') {
      updates.push({
        key: 'EMAIL_PASS',
        value: pass,
        category: SettingCategory.NOTIFICATIONS,
        description: 'SMTP Password'
      });
    }

    for (const item of updates) {
      await Settings.findOneAndUpdate(
        { key: item.key },
        {
          value: item.value,
          category: item.category,
          description: item.description,
          updatedBy: req.user!._id
        },
        { upsert: true, new: true }
      );
    }

    await logAction(
      req.user!._id.toString(),
      'SYSTEM_SETTING_UPDATED',
      'Updated system SMTP settings from Dashboard',
      'SYSTEM'
    );

    // Dynamic verification immediately
    const success = await verifyEmailConfig();
    const status = await getEmailStatus();

    res.json({ success, status });
  } catch (error: any) {
    console.error('Update SMTP settings error:', error);
    res.status(500).json({ message: 'Server error updating SMTP settings', error: error.message });
  }
});

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get all settings (Admin Only)
 *     description: Returns a comprehensive list of all system-wide environment variables and configurations.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of system configurations
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server retrieve error
 */
router.get('/', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const settings = await Settings.find().sort({ category: 1, key: 1 });
    res.json(settings);
  } catch (error) {
    console.error('Fetch settings error:', error);
    res.status(500).json({ message: 'Server error fetching settings' });
  }
});

/**
 * @swagger
 * /api/settings:
 *   post:
 *     summary: Update or create a custom setting (Admin Only)
 *     description: Saves a specific environment setting category and value in the database cache.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - value
 *             properties:
 *               key:
 *                 type: string
 *               value:
 *                 type: string
 *               category:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Setting updated successfully
 *       400:
 *         description: Missing key or value
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Update failure
 */
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

/**
 * @swagger
 * /api/settings/init:
 *   post:
 *     summary: Initialize default settings if they do not exist (Admin Only)
 *     description: Resets or seeds basic settings like APP_NAME, MAINTENANCE_MODE, allow user registration, and notification flags.
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default configurations successfully seeded
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Seeding error
 */
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
