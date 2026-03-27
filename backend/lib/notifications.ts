import { v4 as uuidv4 } from 'uuid';
import { dynamoDb, TableNames } from './dynamodb';

export type NotificationType =
  | 'promo_mention'
  | 'challenge_received'
  | 'match_scheduled'
  | 'announcement';

export type NotificationSourceType = 'promo' | 'challenge' | 'match' | 'announcement';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  message: string;
  sourceId: string;
  sourceType: NotificationSourceType;
}

/**
 * Creates a single notification for a user.
 * Failures are caught and logged — they never break the calling handler.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const now = new Date().toISOString();
    const notificationId = uuidv4();

    await dynamoDb.put({
      TableName: TableNames.NOTIFICATIONS,
      Item: {
        userId: params.userId,
        notificationId,
        type: params.type,
        message: params.message,
        sourceId: params.sourceId,
        sourceType: params.sourceType,
        isRead: false,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error: unknown) {
    console.error('Failed to create notification:', error);
  }
}

/**
 * Creates notifications for multiple users in parallel.
 * Uses Promise.allSettled so individual failures don't affect others.
 * Failures are caught and logged — they never break the calling handler.
 */
export async function createNotifications(params: CreateNotificationParams[]): Promise<void> {
  try {
    await Promise.allSettled(params.map((param) => createNotification(param)));
  } catch (error: unknown) {
    console.error('Failed to create bulk notifications:', error);
  }
}
