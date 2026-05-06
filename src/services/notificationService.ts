import { Notification } from '../models/Notification.ts';
import User from '../models/User.ts';
import { UserRole } from '../constants.ts';

export const createNotification = async (
  recipientId: string,
  title: string,
  message: string,
  type: 'STATUS_CHANGE' | 'NEW_REPORT' | 'SYSTEM' = 'STATUS_CHANGE',
  relatedId?: string
) => {
  try {
    await Notification.create({
      recipient: recipientId,
      title,
      message,
      type,
      relatedId,
    });
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
};

export const notifyAdmins = async (title: string, message: string, relatedId?: string) => {
  try {
    const admins = await User.find({ role: UserRole.ADMIN });
    const notifications = admins.map(admin => ({
      recipient: admin._id,
      title,
      message,
      type: 'SYSTEM',
      relatedId,
    }));
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (error) {
    console.error('Failed to notify admins:', error);
  }
};
