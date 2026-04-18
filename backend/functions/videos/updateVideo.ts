import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface UpdateVideoBody {
  title?: string;
  description?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  category?: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const videoId = event.pathParameters?.videoId;
    if (!videoId) {
      return badRequest('videoId is required');
    }

    const { videos } = getRepositories();
    const existing = await videos.findById(videoId);
    if (!existing) {
      return notFound('Video not found');
    }

    const { data: body, error: parseError } = parseBody<UpdateVideoBody>(event);
    if (parseError) return parseError;

    if (body.category !== undefined && !['match', 'highlight', 'promo', 'other'].includes(body.category)) {
      return badRequest('category must be "match", "highlight", "promo", or "other"');
    }

    const updated = await videos.update(videoId, body);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound('Video not found');
    console.error('Error updating video:', err);
    return serverError('Failed to update video');
  }
};
