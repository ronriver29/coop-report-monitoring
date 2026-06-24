import express from 'express';
import { parse } from 'csv-parse';
import Papa from 'papaparse';
import Report from '../models/Report.ts';
import { AuditLog } from '../models/AuditLog.ts';
import { protect, restrictTo } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';
import { UserRole, PHILIPPINE_REGIONS, PHILIPPINE_PROVINCES, COOPERATIVE_CLUSTERS } from '../constants.ts';
import { logAction } from '../services/auditService.ts';
import { createNotification, notifyAdmins } from '../services/notificationService.ts';

const router = express.Router();

const getCluster = (coopType: string, specificType?: string) => {
  if (!coopType) return 'Others';
  
  let targetType = coopType.trim();
  if (targetType.toLowerCase() === 'multipurpose' && specificType) {
    targetType = specificType.trim();
  }

  for (const cluster of COOPERATIVE_CLUSTERS) {
     if (cluster.types.some(t => t.toLowerCase() === targetType.toLowerCase())) {
       return cluster.name;
     }
  }
  return 'Others';
};

console.log('✅ Report routes initialized');

/**
 * @swagger
 * /api/reports/{id}/status:
 *   patch:
 *     summary: Update report status
 *     description: Modifies the evaluation review status of a specific cooperative report (e.g., Approved, Pending, Rejected). Restricted to admin or analyst roles.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Report MongoDB ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Approved, Pending, Rejected]
 *                 example: Approved
 *     responses:
 *       200:
 *         description: Report status updated successfully
 *       400:
 *         description: Invalid status value specified
 *       401:
 *         description: Unauthenticated JWT
 *       403:
 *         description: Unauthorized role access
 *       404:
 *         description: Report not found
 *       500:
 *         description: Server evaluation status change error
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
 * /api/reports:
 *   post:
 *     summary: Create a new report record manually
 *     description: Manually registers a cooperative compliance record into the system database. Available for administrators and analysts.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cooperativeName
 *               - registrationNumber
 *             properties:
 *               cooperativeName:
 *                 type: string
 *                 example: Taguig Multi-purpose Cooperative
 *               registrationNumber:
 *                 type: string
 *                 example: COOP-99212
 *               cooperativeType:
 *                 type: string
 *                 example: Multipurpose
 *               specificType:
 *                 type: string
 *                 example: Credit
 *               region:
 *                 type: string
 *                 example: NCR
 *               province:
 *                 type: string
 *                 example: Metro Manila
 *               municipality:
 *                 type: string
 *                 example: Taguig
 *               street:
 *                 type: string
 *               category:
 *                 type: string
 *                 example: Medium
 *               assetSize2025:
 *                 type: string
 *                 example: "12500000"
 *               assetSize2026:
 *                 type: string
 *                 example: "15400000"
 *               status:
 *                 type: string
 *                 enum: [Approved, Pending, Rejected]
 *                 example: Pending
 *     responses:
 *       201:
 *         description: Cooperative record created successfully
 *       400:
 *         description: Missing required properties (Name or Registration)
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden role action
 *       500:
 *         description: Internal recording error
 */
router.post('/', protect, restrictTo(UserRole.ADMIN, UserRole.ANALYST, UserRole.REGIONAL_ANALYST), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const reportData = req.body;

    if (!reportData.cooperativeName || !reportData.registrationNumber) {
      return res.status(400).json({ message: 'Cooperative Name and Registration Number are required' });
    }

    // Calculate cluster if not provided but coop type exists
    if (!reportData.cooperativeCluster && reportData.cooperativeType) {
        reportData.cooperativeCluster = getCluster(reportData.cooperativeType, reportData.specificType);
    }

    const report = new Report({
      ...reportData,
      submissionDate: reportData.submissionDate || new Date(),
      status: reportData.status || 'Pending',
      uploadedBy: user._id,
      reportType: reportData.reportType || 'Annual Report'
    });

    await report.save();

    await logAction(
      user._id.toString(),
      'REPORT_CREATED',
      `Manually created report for ${report.cooperativeName}`,
      'REPORT',
      report._id.toString()
    );

    res.status(201).json({ message: 'Cooperative record created successfully', report });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/reports/{id}:
 *   patch:
 *     summary: Update report details
 *     description: Selectively modifies regulatory details, inspection dates, and compliance states of an ingested cooperative.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Report MongoDB ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               complianceStatus:
 *                 type: string
 *                 example: Issued COC
 *               complianceDate:
 *                 type: string
 *                 format: date-time
 *               evaluationRemarks:
 *                 type: string
 *               status:
 *                 type: string
 *               dateInspected:
 *                 type: string
 *                 format: date-time
 *               inspectionStatus:
 *                 type: string
 *               dateIssuedRecommended:
 *                 type: string
 *                 format: date-time
 *               dateCompliedToOTCandSCO:
 *                 type: string
 *                 format: date-time
 *               cooperativeType:
 *                 type: string
 *               specificType:
 *                 type: string
 *               cooperativeCluster:
 *                 type: string
 *     responses:
 *       200:
 *         description: Report updated successfully
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Report not found
 *       500:
 *         description: Server error during details update
 */
router.patch('/:id', protect, restrictTo(UserRole.ADMIN, UserRole.ANALYST, UserRole.REGIONAL_ANALYST), async (req: AuthRequest, res) => {
  try {
    const reportId = req.params.id;
    const { 
      complianceStatus, 
      complianceDate, 
      evaluationRemarks, 
      status, 
      parsedData, 
      dateInspected, 
      inspectionStatus, 
      dateIssuedRecommended, 
      dateCompliedToOTCandSCO,
      cooperativeType,
      specificType,
      cooperativeCluster 
    } = req.body;
 
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
    if (dateInspected !== undefined) updateData.dateInspected = dateInspected;
    if (inspectionStatus !== undefined) updateData.inspectionStatus = inspectionStatus;
    if (dateIssuedRecommended !== undefined) updateData.dateIssuedRecommended = dateIssuedRecommended;
    if (dateCompliedToOTCandSCO !== undefined) updateData.dateCompliedToOTCandSCO = dateCompliedToOTCandSCO;
    if (cooperativeType !== undefined) updateData.cooperativeType = cooperativeType;
    if (specificType !== undefined) updateData.specificType = specificType;
    
    // Auto-update cluster if type or specificType is changed
    if (cooperativeType !== undefined || specificType !== undefined) {
      const currentReport = await Report.findById(reportId);
      if (currentReport) {
        const finalType = cooperativeType !== undefined ? cooperativeType : currentReport.cooperativeType;
        let finalSpecific = specificType !== undefined ? specificType : currentReport.specificType;
        
        // If changing to a non-multipurpose type, clear specificType
        if (finalType && finalType.toLowerCase() !== 'multipurpose') {
          finalSpecific = '';
          updateData.specificType = '';
        }
        
        updateData.cooperativeCluster = getCluster(finalType || '', finalSpecific);
      }
    } else if (cooperativeCluster !== undefined) {
      updateData.cooperativeCluster = cooperativeCluster;
    }

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
 * /api/reports/{id}/history:
 *   get:
 *     summary: Get report update history
 *     description: Retrieve historic audit trail changes applied to a specific report record. Regional Analysts are restricted to their regional scope.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: Report MongoDB ID
 *     responses:
 *       200:
 *         description: History audit trail retrieved successfully
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Access Denied (out of region bounds)
 *       404:
 *         description: Report not found
 *       500:
 *         description: Server tracking fetch error
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
 *     description: Bulks import cooperative record lists by receiving raw CSV rows parsing contents into structured MongoDB report records.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - csvData
 *             properties:
 *               csvData:
 *                 type: string
 *                 description: Raw string contents of uploadable CSV
 *                 example: "Cooperative Name,Registration Number,Cooperative Type\nMy Cooperative,COOP-123,Credit"
 *               mapping:
 *                 type: object
 *                 description: Explicit custom CSV field mapper bindings (Optional)
 *     responses:
 *       201:
 *         description: Cooperative records ingested successfully
 *       400:
 *         description: No CSV data provided
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden role access
 *       500:
 *         description: Ingestion failed due to file parsing deviation
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
        const specificType = getVal('specificType', ['Specific Type', 'Specific Cooperative Type']);
        
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
          specificType: specificType ? String(specificType).trim() : undefined,
          cooperativeCluster: getCluster(String(reportType), specificType ? String(specificType) : undefined),
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
 *     description: Compiles database records aligned to search filters and produces download-ready CSV stream file with computed delays and penalty rates.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *       - name: complianceStatus
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeType
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeCluster
 *         in: query
 *         schema:
 *           type: string
 *       - name: region
 *         in: query
 *         schema:
 *           type: string
 *       - name: province
 *         in: query
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File stream attachment containing CSV
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthenticated token
 *       500:
 *         description: CSV compilation error
 */
router.get('/export', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let query: any = {};
    const { status, complianceStatus, cooperativeType, cooperativeCluster, region, province, sortBy, sortOrder, search } = req.query;

    if (status) query.status = status;
    if (complianceStatus) query.complianceStatus = complianceStatus;
    if (cooperativeType) query.cooperativeType = cooperativeType;
    if (cooperativeCluster) query.cooperativeCluster = cooperativeCluster;
    
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
        'Date Inspected': report.dateInspected ? new Date(report.dateInspected).toLocaleDateString() : 'N/A',
        'Inspection Status': report.inspectionStatus || 'N/A',
        'Date Issued/Recommended': report.dateIssuedRecommended ? new Date(report.dateIssuedRecommended).toLocaleDateString() : 'N/A',
        'Date Complied to OTC/SCO': report.dateCompliedToOTCandSCO ? new Date(report.dateCompliedToOTCandSCO).toLocaleDateString() : 'N/A',
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
 * /api/reports/map-points:
 *   get:
 *     summary: Retrieve lightweight cooperative coordinates and status for maps
 *     description: Returns location markers and status codes for all filtered cooperatives matching the query.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *       - name: complianceStatus
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeType
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeCluster
 *         in: query
 *         schema:
 *           type: string
 *       - name: region
 *         in: query
 *         schema:
 *           type: string
 *       - name: province
 *         in: query
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of lightweight cooperative items
 *       401:
 *         description: Unauthenticated
 *       500:
 *         description: Server error fetching map points
 */
router.get('/map-points', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let query: any = {};
    const { status, complianceStatus, cooperativeType, cooperativeCluster, region, province, search } = req.query;

    if (status) query.status = status;
    if (complianceStatus) query.complianceStatus = complianceStatus;
    if (cooperativeType) query.cooperativeType = cooperativeType;
    if (cooperativeCluster) query.cooperativeCluster = cooperativeCluster;
    
    // Robust region filtering logic
    let regionFilter: any = null;
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
    } else if (region) {
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
        const existingOr = query.$or;
        delete query.$or;
        query.$and = [{ $or: existingOr }, searchFilter];
      } else {
        query = { ...query, ...searchFilter };
      }
    }

    const points = await Report.find(query, {
      cooperativeName: 1,
      registrationNumber: 1,
      cooperativeType: 1,
      cooperativeCluster: 1,
      status: 1,
      complianceStatus: 1,
      region: 1,
      province: 1,
      municipality: 1,
      street: 1,
      category: 1,
      assetSize2025: 1,
      assetSize2026: 1
    }).limit(1000);

    return res.json(points);
  } catch (error) {
    console.error('Error fetching map points:', error);
    return res.status(500).json({ message: 'Error fetching map points' });
  }
});

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Get all reports (filtered by region for regional roles)
 *     description: Fetches a structured, paginated, and query-filtered list of cooperative records.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *       - name: complianceStatus
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeType
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeCluster
 *         in: query
 *         schema:
 *           type: string
 *       - name: region
 *         in: query
 *         schema:
 *           type: string
 *       - name: province
 *         in: query
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *       - name: sortBy
 *         in: query
 *         schema:
 *           type: string
 *       - name: sortOrder
 *         in: query
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Array of paginated cooperative reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reports:
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
 *       500:
 *         description: Server query execution error
 */
router.get('/', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    let query: any = {};
    const { status, complianceStatus, cooperativeType, cooperativeCluster, region, province, sortBy, sortOrder, search } = req.query;

    if (status) query.status = status;
    if (complianceStatus) query.complianceStatus = complianceStatus;
    if (cooperativeType) query.cooperativeType = cooperativeType;
    if (cooperativeCluster) query.cooperativeCluster = cooperativeCluster;
    
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

/**
 * @swagger
 * /api/reports/stats:
 *   get:
 *     summary: Get aggregate stats for reports matching filters
 *     description: Generates grouped statistics mapping compliance rates, cluster classifications, and regional weightings based on search conditions.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *       - name: complianceStatus
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeType
 *         in: query
 *         schema:
 *           type: string
 *       - name: cooperativeCluster
 *         in: query
 *         schema:
 *           type: string
 *       - name: region
 *         in: query
 *         schema:
 *           type: string
 *       - name: province
 *         in: query
 *         schema:
 *           type: string
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Grouped statistics metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 complianceStats:
 *                   type: array
 *                   items:
 *                     type: object
 *                 clusterStats:
 *                   type: array
 *                   items:
 *                     type: object
 *                 regionStats:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthenticated
 *       500:
 *         description: Analytics compilation error
 * /api/reports/maintenance/sync-clusters:
 *   post:
 *     summary: Re-apply clustering to all reports based on their type
 *     description: System utility loop checking all cooperatives and remapping them to their correct functional cluster groupings. Admin-only.
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Remapping operation completed successfully
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Unauthorized (Admin only)
 *       500:
 *         description: Cluster alignment loop failure
 */
router.post('/maintenance/sync-clusters', protect, restrictTo(UserRole.ADMIN), async (req: AuthRequest, res) => {
  try {
    const reports = await Report.find({});
    let updatedCount = 0;

    for (const report of reports) {
      const newCluster = getCluster(report.cooperativeType || '', report.specificType);
      if (report.cooperativeCluster !== newCluster) {
        report.cooperativeCluster = newCluster;
        await report.save();
        updatedCount++;
      }
    }

    await logAction(
      req.user!._id.toString(),
      'MAINTENANCE_SYNC_CLUSTERS',
      `Synchronized clusters for ${updatedCount} reports`,
      'SYSTEM'
    );

    res.json({ message: `Successfully updated ${updatedCount} reports`, total: reports.length });
  } catch (error) {
    console.error('Maintenance sync error:', error);
    res.status(500).json({ message: 'Server error during maintenance sync' });
  }
});

router.get('/stats', protect, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    let query: any = {};
    const { status, complianceStatus, cooperativeType, cooperativeCluster, region, province, search } = req.query;

    if (status) query.status = status;
    if (complianceStatus) query.complianceStatus = complianceStatus;
    if (cooperativeType) query.cooperativeType = cooperativeType;
    if (cooperativeCluster) query.cooperativeCluster = cooperativeCluster;
    
    let regionFilter: any = null;
    if (user.role === UserRole.REGIONAL_ANALYST) {
      if (!user.region) return res.status(403).json({ message: 'Regional assignment required' });
      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === user.region || r.code === user.region);
      if (regionInfo) {
        const plainName = regionInfo.name.split(' (')[0];
        regionFilter = { $or: [ { region: regionInfo.id }, { region: regionInfo.code }, { region: plainName }, { region: { $regex: `^${plainName.replace('.', '\\.')}$`, $options: 'i' } } ] };
      } else { regionFilter = { region: user.region }; }
    } else if (region) {
      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === region || r.code === region);
      if (regionInfo) {
        const plainName = regionInfo.name.split(' (')[0];
        regionFilter = { $or: [ { region: regionInfo.id }, { region: regionInfo.code }, { region: plainName }, { region: { $regex: `^${plainName.replace('.', '\\.')}$`, $options: 'i' } } ] };
      } else { regionFilter = { region: region }; }
    }
    if (regionFilter) query = { ...query, ...regionFilter };
    if (province) {
      const provinceInfo = PHILIPPINE_PROVINCES.find(p => p.id === province || p.name === province);
      if (provinceInfo) {
        const provinceOr = [ { province: provinceInfo.id }, { province: provinceInfo.name }, { province: { $regex: `^${provinceInfo.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, $options: 'i' } } ];
        if (query.$or) {
           const existingOr = query.$or; delete query.$or;
           query.$and = [{ $or: existingOr }, { $or: provinceOr }];
        } else { query.$or = provinceOr; }
      } else { query.province = province; }
    }
    if (search) {
      const searchFilter = { $or: [ { cooperativeName: { $regex: search, $options: 'i' } }, { registrationNumber: { $regex: search, $options: 'i' } } ] };
      if (query.$or) {
        const existingOr = query.$or; delete query.$or;
        query.$and = [{ $or: existingOr }, searchFilter];
      } else { query = { ...query, ...searchFilter }; }
    }

    const complianceStats = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$complianceStatus', value: { $sum: 1 } } },
      { $project: { name: { $ifNull: ['$_id', 'No Status'] }, value: 1, _id: 0 } }
    ]);

    const clusterStats = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$cooperativeCluster', value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $project: { name: { $ifNull: ['$_id', 'Uncategorized'] }, value: 1, _id: 0 } }
    ]);

    const regionStats = await Report.aggregate([
      { $match: query },
      { $group: { _id: '$region', value: { $sum: 1 } } },
      { $sort: { value: -1 } },
      { $limit: 10 },
      { $project: { regionId: '$_id', value: 1, _id: 0 } }
    ]);

    // Map region IDs to names
    const mappedRegionStats = regionStats.map(stat => {
      const regionInfo = PHILIPPINE_REGIONS.find(r => r.id === stat.regionId || r.code === stat.regionId);
      return {
        name: regionInfo ? regionInfo.name.split(' (')[0] : stat.regionId || 'Unknown',
        value: stat.value
      };
    });

    res.json({
      complianceStats,
      clusterStats,
      regionStats: mappedRegionStats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
