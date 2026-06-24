import express from 'express';
import { AuditLog } from '../models/AuditLog.ts';
import { protect, restrictTo } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { UserRole } from '../constants.ts';

const router = express.Router();

/**
 * @swagger
 * /api/audit:
 *   get:
 *     summary: Retrieve personnel action audit logs (Admin Only)
 *     description: Fetches a structured, chronological list of security event logs, action audits, database modifications, and user state toggles. Secured by JWT validation and ADMIN restriction.
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page offset index
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Log item limit per page
 *     responses:
 *       200:
 *         description: Audit logs list matched and retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 pages:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Not authorized (requires ADMIN role)
 *       500:
 *         description: Server database query retrieval error
 */
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
