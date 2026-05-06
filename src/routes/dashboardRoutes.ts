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
 *     tags: [Dashboard]
 */
router.get('/stats', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { region, province } = req.query;
    let query: any = {};

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
