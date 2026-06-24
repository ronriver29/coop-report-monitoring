import express from 'express';
import Report from '../models/Report.ts';
import { protect } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { UserRole, PHILIPPINE_REGIONS, PHILIPPINE_PROVINCES } from '../constants.ts';

const router = express.Router();

/**
 * @swagger
 * /api/dashboard/stats:
 *   get:
 *     summary: Get dashboard statistics filtered by user role/region
 *     description: Computes high-level aggregated metrics such as total reports, compliance ratings, combined asset sizes, status divisions, regional offsets, and lists the 5 most recent uploads.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: region
 *         in: query
 *         schema:
 *           type: string
 *         description: Code/ID of region. For Regional Analyst, this is auto-restricted to their own region.
 *       - name: province
 *         in: query
 *         schema:
 *           type: string
 *         description: Name/ID of province.
 *       - name: cooperativeType
 *         in: query
 *         schema:
 *           type: string
 *         description: General cooperative type filter.
 *       - name: cooperativeCluster
 *         in: query
 *         schema:
 *           type: string
 *         description: Cooperative cluster functional group.
 *     responses:
 *       200:
 *         description: Dashboard statistics computed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalReports:
 *                   type: integer
 *                   example: 154
 *                 complianceRating:
 *                   type: string
 *                   example: "94.2"
 *                 totalAssetsValue:
 *                   type: number
 *                   example: 12400000000
 *                 statusDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       count:
 *                         type: integer
 *                 regionDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                 provinceDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                 cooperativeTypeDistribution:
 *                   type: array
 *                   items:
 *                     type: object
 *                 latestReports:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthenticated JSON token
 *       403:
 *         description: Forbidden (Regional bound mismatch)
 *       500:
 *         description: Server error aggregating stats
 */
router.get('/stats', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { region, province, cooperativeType, cooperativeCluster } = req.query;
    let query: any = {};

    if (cooperativeType) query.cooperativeType = cooperativeType;
    if (cooperativeCluster) query.cooperativeCluster = cooperativeCluster;

    // Robust region filtering logic for shared stats querying
    let regionFilter: any = null;

    // Stricter filtering for regional roles (forced)
    if (user.role === UserRole.REGIONAL_ANALYST) {
      if (!user.region) {
        return res.status(403).json({ message: 'Regional assignment required' });
      }

      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === user.region || r.code === user.region);
      if (regionInfo) {
        const plainName = regionInfo.name.split(' (')[0];
        regionFilter = {
          $or: [
            { region: regionInfo.id },
            { region: regionInfo.code },
            { region: plainName },
            { region: { $regex: `^${plainName.replace('.', '\\.')}$`, $options: 'i' } }
          ]
        };
      } else {
        regionFilter = { region: user.region };
      }
    } 
    // Optional filtering for other roles (e.g., Admins choosing a region)
    else if (region) {
      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === region || r.code === region);
      if (regionInfo) {
        const plainName = regionInfo.name.split(' (')[0];
        regionFilter = {
          $or: [
            { region: regionInfo.id },
            { region: regionInfo.code },
            { region: plainName },
            { region: { $regex: `^${plainName.replace('.', '\\.')}$`, $options: 'i' } }
          ]
        };
      } else {
        regionFilter = { region: region };
      }
    }

    if (regionFilter) {
      query = { ...query, ...regionFilter };
    }
    
    if (province) {
      const provinceInfo = PHILIPPINE_PROVINCES.find(p => p.id === province || p.name === province);
      if (provinceInfo) {
        const provinceOr = [
          { province: provinceInfo.id },
          { province: provinceInfo.name },
          { province: { $regex: `^${provinceInfo.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, $options: 'i' } }
        ];
        
        if (query.$or) {
           const existingOr = query.$or;
           delete query.$or;
           query.$and = [{ $or: existingOr }, { $or: provinceOr }];
        } else {
           query.$or = provinceOr;
        }
      } else {
        query.province = province;
      }
    }

    const totalReports = await Report.countDocuments(query);
    
    // Calculate compliance rating: (Complied + Approved) / Total
    const compliantCount = await Report.countDocuments({
      ...query,
      status: { $in: ['Approved', 'Complied', 'Success'] }
    });
    const complianceRating = totalReports > 0 ? ((compliantCount / totalReports) * 100).toFixed(1) : '0.0';

    // Calculate total assets (requires stripping 'P', 'B', 'M' etc if stored as strings, but assuming we want to sum numerical parts)
    // For now, let's aggregate based on a simulated logic if assets are stubs, or use real data if they exist.
    // Let's assume we want a dynamic number that scales with the reports.
    const reportsWithAssets = await Report.find(query).select('assetSize2026');
    const totalAssetsValue = reportsWithAssets.reduce((acc, r) => {
      if (!r.assetSize2026) return acc;
      const num = parseFloat(r.assetSize2026.replace(/[^0-9.]/g, ''));
      return acc + (isNaN(num) ? 0 : num);
    }, 0);

    const reportsByStatus = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const reportsByRegion = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$region', count: { $sum: 1 } } }
    ]);

    const reportsByType = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$cooperativeType', count: { $sum: 1 } } }
    ]);

    const reportsByProvince = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$province', count: { $sum: 1 } } }
    ]);

    const latestReports = await Report.find(query)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('uploadedBy', 'displayName');

    res.json({
      totalReports,
      complianceRating,
      totalAssetsValue,
      statusDistribution: reportsByStatus,
      regionDistribution: reportsByRegion,
      provinceDistribution: reportsByProvince,
      cooperativeTypeDistribution: reportsByType,
      latestReports
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching stats' });
  }
});

export default router;
