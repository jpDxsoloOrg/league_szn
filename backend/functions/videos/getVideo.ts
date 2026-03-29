import { APIGatewayProxyHandler } from 'aws-lambda';
import { getOrNotFound } from '../../lib/dynamodbUtils';
import { TableNames } from '../../lib/dynamodb';
import { success, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
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

    return success(result.item);
  } catch (err) {
    console.error('Error fetching video:', err);
    return serverError('Failed to fetch video');
  }
};
