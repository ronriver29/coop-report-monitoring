import { AuditLog } from '../models/AuditLog.ts';

export const logAction = async (
  userId: string,
  action: string,
  details: string,
  targetType: 'USER' | 'REPORT' | 'SYSTEM',
  targetId?: string
) => {
  try {
    await AuditLog.create({
      user: userId,
      action,
      details,
      targetType,
      targetId,
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
};
