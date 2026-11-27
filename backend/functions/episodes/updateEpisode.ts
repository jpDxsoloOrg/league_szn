import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError, type EpisodePatch } from '../../lib/repositories';
import { success, badRequest, errorWithDetails, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { parseYoutubeVideoId, youtubeThumbnailUrl } from '../../lib/youtube';
import {
  checkAirDate,
  checkChannelName,
  checkDescription,
  checkIsPublished,
  checkLinkId,
  checkTitle,
} from './validation';
import { DUPLICATE_EPISODE_MESSAGE } from './createEpisode';

interface UpdateEpisodeBody {
  url?: unknown;
  title?: unknown;
  channelName?: unknown;
  description?: unknown;
  airDate?: unknown;
  /** null or '' unlinks. */
  eventId?: unknown;
  isPublished?: unknown;
}

const UPDATABLE_FIELDS: ReadonlyArray<keyof UpdateEpisodeBody> = [
  'url', 'title', 'channelName', 'description', 'airDate', 'eventId', 'isPublished',
];

/**
 * PUT /admin/episodes/{episodeId} (staff). Fields are copied explicitly.
 * `url` swaps the video (thumbnail rebuilt; title and channel change only
 * when the body sends them).
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const episodeId = event.pathParameters?.episodeId;
    if (!episodeId) return badRequest('episodeId is required');

    const { data: body, error: parseError } = parseBody<UpdateEpisodeBody>(event);
    if (parseError) return parseError;
    if (!UPDATABLE_FIELDS.some((field) => body[field] !== undefined)) {
      return badRequest('No fields to update');
    }

    const { content: { episodes }, leagueOps: { events } } = getRepositories();
    const existing = await episodes.findById(episodeId);
    if (!existing) return notFound('Episode not found');

    const patch: EpisodePatch = {};

    if (body.url !== undefined) {
      const youtubeVideoId = typeof body.url === 'string' ? parseYoutubeVideoId(body.url) : null;
      if (!youtubeVideoId) return badRequest('Not a YouTube video link');
      if (youtubeVideoId !== existing.youtubeVideoId) {
        const duplicate = await episodes.findByYoutubeId(youtubeVideoId);
        if (duplicate && duplicate.episodeId !== episodeId) {
          return errorWithDetails(400, DUPLICATE_EPISODE_MESSAGE, { existingEpisodeId: duplicate.episodeId });
        }
        patch.youtubeVideoId = youtubeVideoId;
        patch.thumbnailUrl = youtubeThumbnailUrl(youtubeVideoId);
      }
    }

    if (body.title !== undefined) {
      const title = checkTitle(body.title);
      if (title.error !== undefined) return badRequest(title.error);
      patch.title = title.value;
    }

    if (body.channelName !== undefined) {
      const channelName = checkChannelName(body.channelName ?? '');
      if (channelName.error !== undefined) return badRequest(channelName.error);
      patch.channelName = channelName.value;
    }

    if (body.description !== undefined) {
      const description = checkDescription(body.description ?? '');
      if (description.error !== undefined) return badRequest(description.error);
      patch.description = description.value;
    }

    if (body.airDate !== undefined) {
      const airDate = checkAirDate(body.airDate);
      if (airDate.error !== undefined) return badRequest(airDate.error);
      patch.airDate = airDate.value;
    }

    const isPublished = checkIsPublished(body.isPublished);
    if (isPublished.error !== undefined) return badRequest(isPublished.error);
    if (isPublished.value !== undefined) patch.isPublished = isPublished.value;

    const eventId = checkLinkId(body.eventId, 'eventId');
    if (eventId.error !== undefined) return badRequest(eventId.error);
    if (eventId.value === null) {
      patch.eventId = null;
    } else if (eventId.value !== undefined) {
      if (!(await events.findById(eventId.value))) return badRequest('Event not found');
      patch.eventId = eventId.value;
    }

    return success(await episodes.update(episodeId, patch));
  } catch (err) {
    if (err instanceof NotFoundError) return notFound('Episode not found');
    console.error('Error updating episode:', err);
    return serverError('Failed to update episode');
  }
};
