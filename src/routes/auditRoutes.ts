import express from 'express';
import { AuditLog } from '../models/AuditLog';
import { protect, restrictTo } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';
import { UserRole } from '../constants';

const router = express.Router();

// Get audit logs - Admin only
router.get('/', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    const total = await AuditLog.countDocuments();
    const logs = await AuditLog.find()
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'displayName email');

    res.json({
      logs,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Fetch audit logs error:', error);
    res.status(500).json({ message: 'Server error fetching audit logs' });
  }
});

export default router;
