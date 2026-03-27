import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const announcementId = event.pathParameters?.announcementId;
    if (!announcementId) {
      return badRequest('announcementId is required');
    }

    const result = await dynamoDb.get({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId },
    });
    if (!result.Item) {
      return notFound('Announcement not found');
    }

    await dynamoDb.delete({
      TableName: TableNames.ANNOUNCEMENTS,
      Key: { announcementId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting announcement:', err);
    return serverError('Failed to delete announcement');
  }
};
