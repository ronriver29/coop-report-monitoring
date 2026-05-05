import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
  },
  details: {
    type: String,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
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

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
