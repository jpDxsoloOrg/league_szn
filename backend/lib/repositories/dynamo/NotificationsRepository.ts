import { QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TableNames } from '../../dynamodb';
import type {
  NotificationPage,
  NotificationsRepository,
} from '../NotificationsRepository';
import type { AppNotification } from '../types';

export class DynamoNotificationsRepository implements NotificationsRepository {
  async listByUser(userId: string, limit: number, cursor?: string): Promise<NotificationPage> {
    const queryParams: QueryCommandInput = {
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false,
      Limit: limit,
    };

    if (cursor) {
      queryParams.ExclusiveStartKey = { userId, createdAt: cursor };
    }

    const result = await dynamoDb.query(queryParams);
    const notifications = (result.Items || []) as unknown as AppNotification[];
    const lastKey = result.LastEvaluatedKey as Record<string, string> | undefined;

    return {
      notifications,
      nextCursor: lastKey?.createdAt || null,
    };
  }

  async countUnread(userId: string): Promise<number> {
    const result = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :false',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':false': false,
      },
    });
    return result.length;
  }

  async findByNotificationId(notificationId: string): Promise<AppNotification | null> {
    const gsiResult = await dynamoDb.query({
      TableName: TableNames.NOTIFICATIONS,
      IndexName: 'NotificationIdIndex',
      KeyConditionExpression: 'notificationId = :nid',
      ExpressionAttributeValues: { ':nid': notificationId },
    });
    return (gsiResult.Items?.[0] as unknown as AppNotification) ?? null;
  }

  async markRead(userId: string, createdAt: string): Promise<void> {
    const now = new Date().toISOString();
    await dynamoDb.update({
      TableName: TableNames.NOTIFICATIONS,
      Key: { userId, createdAt },
      UpdateExpression: 'SET isRead = :true, updatedAt = :now',
      ExpressionAttributeValues: { ':true': true, ':now': now },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const unreadItems = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :false',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':false': false,
      },
    });

    if (unreadItems.length === 0) return 0;

    const now = new Date().toISOString();
    await Promise.all(
      unreadItems.map((item) =>
        dynamoDb.update({
          TableName: TableNames.NOTIFICATIONS,
          Key: {
            userId: item.userId as string,
            createdAt: item.createdAt as string,
          },
          UpdateExpression: 'SET isRead = :true, updatedAt = :now',
          ExpressionAttributeValues: { ':true': true, ':now': now },
        }),
      ),
    );

    return unreadItems.length;
  }

  async delete(userId: string, createdAt: string): Promise<void> {
    await dynamoDb.delete({
      TableName: TableNames.NOTIFICATIONS,
      Key: { userId, createdAt },
    });
  }

  async deleteAllRead(userId: string): Promise<number> {
    const readItems = await dynamoDb.queryAll({
      TableName: TableNames.NOTIFICATIONS,
      KeyConditionExpression: 'userId = :uid',
      FilterExpression: 'isRead = :true',
      ExpressionAttributeValues: {
        ':uid': userId,
        ':true': true,
      },
    });

    if (readItems.length === 0) return 0;

    await Promise.all(
      readItems.map((item) =>
        dynamoDb.delete({
          TableName: TableNames.NOTIFICATIONS,
          Key: {
            userId: item.userId as string,
            createdAt: item.createdAt as string,
          },
        }),
      ),
    );

    return readItems.length;
  }
}
