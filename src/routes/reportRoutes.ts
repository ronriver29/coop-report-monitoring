import express from 'express';
import { parse } from 'csv-parse';
import Papa from 'papaparse';
import Report from '../models/Report.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { protect, restrictTo } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { UserRole, PHILIPPINE_REGIONS, PHILIPPINE_PROVINCES } from '../constants.ts';
import { logAction } from '../services/auditService.ts';
import { createNotification, notifyAdmins } from '../services/notificationService.ts';

const router = express.Router();

console.log('✅ Report routes initialized');

/**
 * @swagger
 * /api/reports/:id/status:
 *   patch:
 *     summary: Update report status
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/status', protect, restrictTo(UserRole.ADMIN, UserRole.ANALYST, UserRole.REGIONAL_ANALYST), async (req: AuthRequest, res) => {
  try {
    const { status } = req.body;
    const reportId = req.params.id;

    if (!['Approved', 'Pending', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const report = await Report.findByIdAndUpdate(
      reportId,
      { $set: { status } },
      { new: true, runValidators: false }
    );

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Log the action
    await logAction(
      req.user!._id.toString(),
      'REPORT_STATUS_UPDATED',
      `Updated report ${report.cooperativeName} status to ${status}`,
      'REPORT',
      reportId
    );

    // Notify the uploader
    await createNotification(
      report.uploadedBy.toString(),
      'Report Status Updated',
      `Your report for "${report.cooperativeName}" has been updated to "${status}".`,
      'STATUS_CHANGE',
      reportId
    );

    res.json({ message: 'Report status updated successfully', report });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/reports/:id:
 *   patch:
 *     summary: Update report details
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id', protect, restrictTo(UserRole.ADMIN, UserRole.ANALYST, UserRole.REGIONAL_ANALYST), async (req: AuthRequest, res) => {
  try {
    const reportId = req.params.id;
    const { complianceStatus, complianceDate, evaluationRemarks, status, parsedData } = req.body;

    const updateData: any = {};
    if (complianceStatus !== undefined) {
      updateData.complianceStatus = complianceStatus;
      // Auto-set main status to Issued COC if compliance status is Issued COC
      if (complianceStatus === 'Issued COC') {
        updateData.status = 'Issued COC';
      }
    }
    if (complianceDate !== undefined) updateData.complianceDate = complianceDate;
    if (evaluationRemarks !== undefined) updateData.evaluationRemarks = evaluationRemarks;
    if (status !== undefined) updateData.status = status;
    if (parsedData !== undefined) updateData.parsedData = parsedData;

    const report = await Report.findByIdAndUpdate(
      reportId,
      { $set: updateData },
      { new: true, runValidators: false } // Disable runValidators to bypass missing required fields in existing docs
    );

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    await logAction(
      req.user!._id.toString(),
      'REPORT_UPDATED',
      `Updated report ${report.cooperativeName} details: Status=${complianceStatus}, Date=${complianceDate}, Remarks=${evaluationRemarks || 'None'}`,
      'REPORT',
      reportId
    );

    res.json({ message: 'Report updated successfully', report });
  } catch (error: any) {
    console.error('Update report error:', error);
    res.status(500).json({ 
      message: 'Server error during report update',
      error: error.message 
    });
  }
});

/**
 * @swagger
 * /api/reports/:id/history:
 *   get:
 *     summary: Get report update history
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/history', protect, async (req: AuthRequest, res) => {
  try {
    const reportId = req.params.id;
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    // Regional Analysts can only see history for reports in their region
    const user = req.user!;
    if (user.role === UserRole.REGIONAL_ANALYST) {
      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === user.region || r.code === user.region);
      let isAuthorized = false;
      
      if (regionInfo) {
        const plainName = regionInfo.name.split(' (')[0];
        const reportRegion = report.region;
        isAuthorized = (
          reportRegion === regionInfo.id || 
          reportRegion === regionInfo.code || 
          reportRegion === plainName ||
          (typeof reportRegion === 'string' && reportRegion.toLowerCase() === plainName.toLowerCase())
        );
      } else {
        isAuthorized = report.region === user.region;
      }

      if (!isAuthorized) {
        return res.status(403).json({ message: 'Access denied to this report history' });
      }
    }

    const logs = await AuditLog.find({
      targetType: 'REPORT',
      targetId: reportId
    }).sort({ timestamp: -1 }).populate('user', 'displayName email');

    res.json({ logs });
  } catch (error) {
    console.error('Fetch report history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/reports/ingest:
 *   post:
 *     summary: Ingest CSV reports
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 */
router.post('/ingest', protect, restrictTo(UserRole.ADMIN, UserRole.ANALYST, UserRole.REGIONAL_ANALYST), async (req: AuthRequest, res) => {
  try {
    const { csvData, mapping } = req.body; 

    if (!csvData) {
      return res.status(400).json({ message: 'No CSV data provided' });
    }

    const records: any[] = [];
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    parser.on('readable', function(){
      let record;
      while ((record = parser.read()) !== null) {
        records.push(record);
      }
    });

    parser.on('error', function(err){
      console.error(err.message);
      if (!res.headersSent) {
        res.status(500).json({ message: 'Error parsing CSV' });
      }
    });

    parser.on('end', async function(){
      const user = req.user!;
      const reportsToSave = records.map(rec => {
        // Dynamic mapping if provided, else fallback to common patterns
        const getVal = (field: string, fallbacks: string[]) => {
          if (mapping && mapping[field]) return rec[mapping[field]];
          for (const f of fallbacks) {
            if (rec[f] !== undefined) return rec[f];
          }
          return null;
        };

        const coopName = getVal('cooperativeName', ['Cooperative Name ', 'Cooperative Name', 'Name']) || 'Unknown';
        const regNo = getVal('registrationNumber', ['Registration Number', 'Reg No']) || 'N/A';
        const rawDate = getVal('submissionDate', ['Date Report Submitted (MM/DD/YYYY)', 'Date Report Submitted', 'Submission Date']);
        const status = getVal('status', ['Status']) || 'Pending';
        const rawRegion = getVal('region', ['Region Code', 'Region', 'Regional Office']) || user.region;
        const province = getVal('province', ['Province']);
        const reportType = getVal('reportType', ['Cooperative Type', 'Type']) || 'General';
        
        const statusDetails = getVal('statusDetails', ['Status Details']);
        const rawStatus = getVal('status', ['Status']); // Already handled above as 'status' but just to be sure
        const municipality = getVal('municipality', ['Municipality', 'City']);
        const street = getVal('street', ['Street', 'Address']);
        const category = getVal('category', ['Category']);
        const assetSize2025 = getVal('assetSize2025', ['Asset Size 2025']);
        const assetSize2026 = getVal('assetSize2026', ['Asset Size 2026']);
        const statusOfCompliance = getVal('statusOfCompliance', ['Status of Compliance']);

        let normalizedRegion = rawRegion;
        
        if (rawRegion) {
          const upperRaw = String(rawRegion).toUpperCase().trim();
          const match = PHILIPPINE_REGIONS.find(r => 
            r.id === upperRaw || 
            r.code === upperRaw || 
            r.name.toUpperCase().includes(upperRaw) ||
            upperRaw.includes(r.id)
          );
          if (match) normalizedRegion = match.id;
        }

        return {
          cooperativeName: String(coopName).trim(),
          registrationNumber: String(regNo).trim(),
          reportType: String(reportType).trim(), 
          submissionDate: rawDate ? new Date(rawDate) : new Date(),
          status: String(rawStatus || status).trim(),
          region: normalizedRegion,
          province: province,
          municipality: municipality,
          street: street,
          category: category,
          cooperativeType: String(reportType).trim(),
          assetSize2025: assetSize2025,
          assetSize2026: assetSize2026,
          statusOfCompliance: statusOfCompliance,
          statusDetails: statusDetails,
          parsedData: rec,
          uploadedBy: user._id,
        };
      });

      try {
        await Report.insertMany(reportsToSave);
        
        await logAction(
          user._id.toString(),
          'REPORT_INGESTION',
          `Ingested ${reportsToSave.length} reports via CSV upload`,
          'REPORT'
        );

        res.status(201).json({ message: `Successfully ingested ${reportsToSave.length} reports` });
      } catch (err) {
        console.error('Insert error:', err);
        res.status(500).json({ message: 'Failed to save reports to database' });
      }
    });

    parser.write(csvData);
    parser.end();

  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error during ingestion' });
    }
  }
});

/**
 * @swagger
 * /api/reports/export:
 *   get:
 *     summary: Export filtered reports to CSV
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 */
router.get('/export', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let query: any = {};
    const { status, complianceStatus, cooperativeType, region, province, sortBy, sortOrder, search } = req.query;

    if (status) query.status = status;
    if (complianceStatus) query.complianceStatus = complianceStatus;
    if (cooperativeType) query.cooperativeType = cooperativeType;
    
    // Robust region filtering logic
    let regionFilter: any = null;
    if (user.role === UserRole.REGIONAL_ANALYST) {
      if (!user.region) {
        return res.status(403).json({ message: 'Regional assignment required' });
      }
      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === user.region || r.code === user.region);
      if (regionInfo) {
        const plainName = regionInfo.name.split(' (')[0];
        regionFilter = { $or: [ { region: regionInfo.id }, { region: regionInfo.code }, { region: plainName }, { region: { $regex: `^${plainName.replace('.', '\\.')}$`, $options: 'i' } } ] };
      } else {
        regionFilter = { region: user.region };
      }
    } else if (region) {
      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === region || r.code === region);
      if (regionInfo) {
        const plainName = regionInfo.name.split(' (')[0];
        regionFilter = { $or: [ { region: regionInfo.id }, { region: regionInfo.code }, { region: plainName }, { region: { $regex: `^${plainName.replace('.', '\\.')}$`, $options: 'i' } } ] };
      } else {
        regionFilter = { region: region };
      }
    }
    if (regionFilter) query = { ...query, ...regionFilter };
    
    if (province) {
      const provinceInfo = PHILIPPINE_PROVINCES.find(p => p.id === province || p.name === province);
      if (provinceInfo) {
        const provinceOr = [ { province: provinceInfo.id }, { province: provinceInfo.name }, { province: { $regex: `^${provinceInfo.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, $options: 'i' } } ];
        if (query.$or) {
           const existingOr = query.$or; delete query.$or;
           query.$and = [{ $or: existingOr }, { $or: provinceOr }];
        } else {
           query.$or = provinceOr;
        }
      } else { query.province = province; }
    }

    if (search) {
      const searchFilter = { $or: [ { cooperativeName: { $regex: search, $options: 'i' } }, { registrationNumber: { $regex: search, $options: 'i' } } ] };
      if (query.$or) {
        const existingOr = query.$or; delete query.$or;
        query.$and = [{ $or: existingOr }, searchFilter];
      } else {
        query = { ...query, ...searchFilter };
      }
    }

    let sort: any = { createdAt: -1 };
    if (sortBy) {
      const order = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'submissionDate') sort = { submissionDate: order };
      if (sortBy === 'cooperativeName') sort = { cooperativeName: order };
      if (sortBy === 'province') sort = { province: order };
      if (sortBy === 'cooperativeType') sort = { cooperativeType: order };
    }

    const rawReports = await Report.find(query).sort(sort).populate('uploadedBy', 'displayName email');

    // Transform reports for CSV
    const data = rawReports.map(report => {
      const deadline = new Date('2026-05-30');
      deadline.setHours(0, 0, 0, 0);
      const now = new Date(); now.setHours(0, 0, 0, 0);
      let stopDate = new Date(now);
      if (report.complianceStatus === 'Issued COC' && report.complianceDate) {
        stopDate = new Date(report.complianceDate); stopDate.setHours(0, 0, 0, 0);
      }
      
      let daysDelayed = 0;
      let penaltyAmount = 0;
      if (stopDate > deadline) {
        const isApprovedByDeadline = report.status === 'Approved' && report.complianceDate && new Date(report.complianceDate) <= deadline;
        if (!isApprovedByDeadline) {
          const diffTime = stopDate.getTime() - deadline.getTime();
          daysDelayed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
          penaltyAmount = daysDelayed * 100;
        }
      }

      return {
        'Cooperative Name': report.cooperativeName,
        'Registration Number': report.registrationNumber,
        'Type': report.cooperativeType,
        'Region': report.region,
        'Province': report.province,
        'Municipality': report.municipality,
        'Submission Date': report.submissionDate ? new Date(report.submissionDate).toLocaleDateString() : 'N/A',
        'Main Status': report.status,
        'Compliance Status': report.complianceStatus || 'N/A',
        'Compliance Date': report.complianceDate ? new Date(report.complianceDate).toLocaleDateString() : 'N/A',
        'Days Delayed': daysDelayed,
        'Penalty Amount': penaltyAmount.toFixed(2),
        'Uploaded By': (report.uploadedBy as any)?.displayName || (report.uploadedBy as any)?.email || 'System'
      };
    });

    const csv = Papa.unparse(data);
    
    await logAction(
      user._id.toString(),
      'REPORT_EXPORT',
      `Exported ${data.length} reports to CSV`,
      'REPORT'
    );

    res.header('Content-Type', 'text/csv');
    res.attachment('reports-export.csv');
    return res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ message: 'Server error during export' });
  }
});

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Get all reports (filtered by region for regional roles)
 *     tags: [Reports]
 */
router.get('/', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    let query: any = {};
    const { status, complianceStatus, cooperativeType, region, province, sortBy, sortOrder, search } = req.query;

    if (status) query.status = status;
    if (complianceStatus) query.complianceStatus = complianceStatus;
    if (cooperativeType) query.cooperativeType = cooperativeType;
    
    // Robust region filtering logic
    let regionFilter: any = null;
    
    // If it's a regional analyst, we force their assigned region
    if (user.role === UserRole.REGIONAL_ANALYST) {
      if (!user.region) {
        return res.status(403).json({ message: 'Regional assignment required for this action' });
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
    // If it's not a regional analyst and a region is requested through filters
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

    if (search) {
      const searchFilter = {
        $or: [
          { cooperativeName: { $regex: search, $options: 'i' } },
          { registrationNumber: { $regex: search, $options: 'i' } }
        ]
      };
      
      if (query.$or) {
        // Combine existing $or with search $or using $and
        const existingOr = query.$or;
        delete query.$or;
        query.$and = [{ $or: existingOr }, searchFilter];
      } else {
        query = { ...query, ...searchFilter };
      }
    }

    let sort: any = { createdAt: -1 };
    if (sortBy) {
      const order = sortOrder === 'asc' ? 1 : -1;
      if (sortBy === 'submissionDate') sort = { submissionDate: order };
      if (sortBy === 'cooperativeName') sort = { cooperativeName: order };
      if (sortBy === 'province') sort = { province: order };
      if (sortBy === 'cooperativeType') sort = { cooperativeType: order };
    }

    const total = await Report.countDocuments(query);
    const rawReports = await Report.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('uploadedBy', 'displayName email');

    // Compute penalties on the fly
    const reports = rawReports.map(report => {
      const reportObj = report.toObject();
      const deadline = new Date('2026-05-30');
      deadline.setHours(0, 0, 0, 0);
      
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      
      // We assume complianceDate is the stop date if Issued COC
      let stopDate = new Date(now);
      const isIssuedCOC = report.complianceStatus === 'Issued COC';
      
      if (isIssuedCOC && report.complianceDate) {
        stopDate = new Date(report.complianceDate);
        stopDate.setHours(0, 0, 0, 0);
      }

      // Penalty logic: Starts after May 30
      // Rate: 100 pesos daily
      
      let daysDelayed = 0;
      let penaltyAmount = 0;

      if (stopDate > deadline) {
        // Only calculate if it wasn't approved by May 30
        const isApprovedByDeadline = report.status === 'Approved' && report.complianceDate && new Date(report.complianceDate) <= deadline;
        
        if (!isApprovedByDeadline) {
          const diffTime = stopDate.getTime() - deadline.getTime();
          daysDelayed = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
          penaltyAmount = daysDelayed * 100;
        }
      }

      reportObj.parsedData = {
        ...(reportObj.parsedData || {}),
        "Number of days delayed": daysDelayed,
        "Amount of penalty": penaltyAmount.toFixed(2)
      };

      return reportObj;
    });

    res.json({
      reports,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Fetch reports error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
