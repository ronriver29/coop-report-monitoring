import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IReport extends Document {
  cooperativeName: string;
  registrationNumber: string;
  reportType: string;
  submissionDate: Date;
  status: string;
  complianceStatus?: string;
  complianceDate?: string;
  evaluationRemarks?: string;
  region?: string;
  province?: string;
  municipality?: string;
  street?: string;
  category?: string;
  cooperativeType?: string;
  secondaryCooperativeType?: string;
  specificType?: string;
  cooperativeCluster?: string;
  secondaryCooperativeCluster?: string;
  assetSize2025?: string;
  assetSize2026?: string;
  dateCompliedToOTCOrSCO?: string;
  dateInspected?: Date;
  inspectionStatus?: string;
  dateIssuedRecommended?: Date;
  dateCompliedToOTCandSCO?: Date;
  parsedData: any; // Raw document content from CSV
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema: Schema = new Schema(
  {
    cooperativeName: { type: String, required: true },
    registrationNumber: { type: String, required: true },
    reportType: { type: String, required: true },
    submissionDate: { type: Date, required: true },
    status: { type: String, required: true, default: 'Pending' },
    complianceStatus: { type: String },
    complianceDate: { type: String },
    evaluationRemarks: { type: String },
    region: { type: String },
    province: { type: String },
    municipality: { type: String },
    street: { type: String },
    category: { type: String },
    cooperativeType: { type: String },
    secondaryCooperativeType: { type: String },
    specificType: { type: String },
    cooperativeCluster: { type: String },
    secondaryCooperativeCluster: { type: String },
    assetSize2025: { type: String },
    assetSize2026: { type: String },
    statusOfCompliance: { type: String },
    statusDetails: { type: String },
    dateInspected: { type: Date },
    inspectionStatus: { type: String },
    dateIssuedRecommended: { type: Date },
    dateCompliedToOTCandSCO: { type: Date },
    parsedData: { type: Schema.Types.Mixed },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Indexes for faster dashboard lookups
ReportSchema.index({ cooperativeName: 'text', registrationNumber: 1 });
ReportSchema.index({ submissionDate: -1 });

const Report: Model<IReport> = mongoose.models.Report || mongoose.model<IReport>('Report', ReportSchema);
export default Report;
