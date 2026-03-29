import { APIGatewayProxyHandler } from 'aws-lambda';
import { dynamoDb, TableNames } from '../../lib/dynamodb';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { noContent, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const videoId = event.pathParameters?.videoId;
    if (!videoId) {
      return badRequest('videoId is required');
    }

    const result = await getOrNotFound(
      TableNames.VIDEOS,
      { videoId },
      'Video not found'
    );
    if ('notFoundResponse' in result) {
      return result.notFoundResponse;
    }

    await dynamoDb.delete({
      TableName: TableNames.VIDEOS,
      Key: { videoId },
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting video:', err);
    return serverError('Failed to delete video');
  }
};
