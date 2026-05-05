import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAuditLog extends Document {
  action: string;
  details: string;
  user: mongoose.Types.ObjectId;
  targetType: 'USER' | 'REPORT' | 'SYSTEM';
  targetId?: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema({
  action: {
    type: String,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  targetType: {
    type: String,
    enum: ['USER', 'REPORT', 'SYSTEM'],
    required: true,
  },
  targetId: {
    type: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

const AuditLog: Model<IAuditLog> = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
export { AuditLog };
export default AuditLog;