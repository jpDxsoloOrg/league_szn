import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';

interface Announcement {
  announcementId: string;
  title: string;
  body: string;
  priority: number;
  isActive: string;
  expiresAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const result = await dynamoDb.query({
      TableName: TableNames.ANNOUNCEMENTS,
      IndexName: 'ActiveIndex',
      KeyConditionExpression: 'isActive = :active',
      ExpressionAttributeValues: { ':active': 'true' },
    });

    const now = new Date().toISOString();
    const announcements = ((result.Items || []) as unknown as Announcement[])
      .filter((item) => !item.expiresAt || item.expiresAt > now)
      .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));

    return success(announcements);
  } catch (err) {
    console.error('Error fetching active announcements:', err);
    return serverError('Failed to fetch active announcements');
  }
};
