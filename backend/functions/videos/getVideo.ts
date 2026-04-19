import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const videoId = event.pathParameters?.videoId;
    if (!videoId) {
      return badRequest('videoId is required');
    }

    const { videos } = getRepositories();
    const video = await videos.findById(videoId);
    if (!video) {
      return notFound('Video not found');
    }

    return success(video);
  } catch (err) {
    console.error('Error fetching video:', err);
    return serverError('Failed to fetch video');
  }
};
