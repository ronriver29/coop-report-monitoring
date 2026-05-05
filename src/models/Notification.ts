import mongoose, { Schema, Document, Model } from 'mongoose';

export interface INotification extends Document {
  recipient: mongoose.Types.ObjectId;
  title: string;
  message: string;
  type: 'STATUS_CHANGE' | 'NEW_REPORT' | 'SYSTEM';
  relatedId?: string;
  isRead: boolean;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema({
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['STATUS_CHANGE', 'NEW_REPORT', 'SYSTEM'],
    default: 'STATUS_CHANGE',
  },
  relatedId: {
    type: String, // ID of the report or relevant entity
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

const Notification: Model<INotification> = mongoose.models.Notification || mongoose.model<INotification>('Notification', notificationSchema);
export { Notification };
export default Notification;