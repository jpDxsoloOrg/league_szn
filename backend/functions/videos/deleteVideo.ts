import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const videoId = event.pathParameters?.videoId;
    if (!videoId) {
      return badRequest('videoId is required');
    }

    const { content: { videos } } = getRepositories();
    const existing = await videos.findById(videoId);
    if (!existing) {
      return notFound('Video not found');
    }

    await videos.delete(videoId);
    return noContent();
  } catch (err) {
    console.error('Error deleting video:', err);
    return serverError('Failed to delete video');
  }
};
