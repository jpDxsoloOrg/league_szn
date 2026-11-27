import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

/**
 * DELETE /admin/episodes/{episodeId} (staff). Unlinks the episode's
 * highlights first (videos are never deleted), then deletes the episode.
 * Not transactional: if an unlink fails the episode stays, and a retry
 * finishes the job.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const episodeId = event.pathParameters?.episodeId;
    if (!episodeId) return badRequest('episodeId is required');

    const { content: { episodes, videos } } = getRepositories();
    if (!(await episodes.findById(episodeId))) return notFound('Episode not found');

    const linked = (await videos.list()).filter((video) => video.episodeId === episodeId);
    for (const video of linked) {
      await videos.update(video.videoId, { episodeId: null });
    }

    await episodes.delete(episodeId);
    return noContent();
  } catch (err) {
    console.error('Error deleting episode:', err);
    return serverError('Failed to delete episode');
  }
};
