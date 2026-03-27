import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { success, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

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

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const items = await dynamoDb.scanAll({
      TableName: TableNames.ANNOUNCEMENTS,
    });

    const announcements = (items as unknown as Announcement[]).sort(
      (a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
    );

    return success(announcements);
  } catch (err) {
    console.error('Error listing announcements:', err);
    return serverError('Failed to list announcements');
  }
};
