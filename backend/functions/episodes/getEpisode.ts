import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';
import { toPublicEpisode } from '../../lib/publicEpisode';
import { toPublicVideo } from '../../lib/publicVideo';

/**
 * GET /episodes/{episodeId} (public). Drafts are visible to staff only.
 * Returns the episode with its published highlights, newest first. The
 * linked event is not embedded: the client reads GET /events/{eventId}.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const episodeId = event.pathParameters?.episodeId;
    if (!episodeId) return badRequest('episodeId is required');

    const { content: { episodes, videos } } = getRepositories();
    const episode = await episodes.findById(episodeId);
    if (!episode) return notFound('Episode not found');

    if (episode.isPublished !== 'true' && !isStaff(await getVerifiedCaller(event))) {
      return notFound('Episode not found');
    }

    const highlights = (await videos.listPublished())
      .filter((video) => video.episodeId === episodeId)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map(toPublicVideo);

    return success({ episode: toPublicEpisode(episode), highlights });
  } catch (err) {
    console.error('Error fetching episode:', err);
    return serverError('Failed to fetch episode');
  }
};
