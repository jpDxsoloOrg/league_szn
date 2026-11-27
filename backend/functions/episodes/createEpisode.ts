import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, type EpisodeCreateInput } from '../../lib/repositories';
import { created, badRequest, errorWithDetails, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { parseYoutubeVideoId, youtubeThumbnailUrl } from '../../lib/youtube';
import {
  checkAirDate,
  checkChannelName,
  checkDescription,
  checkIsPublished,
  checkLinkId,
  checkTitle,
  todayUtc,
} from './validation';

interface CreateEpisodeBody {
  url?: unknown;
  title?: unknown;
  channelName?: unknown;
  description?: unknown;
  airDate?: unknown;
  eventId?: unknown;
  isPublished?: unknown;
}

export const DUPLICATE_EPISODE_MESSAGE = 'This video is already an episode';

/**
 * POST /admin/episodes (staff). No oEmbed call: the title comes from the
 * client (the lookup result, or typed). New episodes are drafts by default.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<CreateEpisodeBody>(event);
    if (parseError) return parseError;

    const youtubeVideoId = typeof body.url === 'string' ? parseYoutubeVideoId(body.url) : null;
    if (!youtubeVideoId) return badRequest('Not a YouTube video link');

    const title = checkTitle(body.title);
    if (title.error !== undefined) return badRequest(title.error);

    const input: EpisodeCreateInput = {
      youtubeVideoId,
      title: title.value,
      thumbnailUrl: youtubeThumbnailUrl(youtubeVideoId),
      airDate: todayUtc(),
      isPublished: false,
      createdBy: '',
    };

    if (body.channelName !== undefined && body.channelName !== null) {
      const channelName = checkChannelName(body.channelName);
      if (channelName.error !== undefined) return badRequest(channelName.error);
      if (channelName.value) input.channelName = channelName.value;
    }

    if (body.description !== undefined && body.description !== null) {
      const description = checkDescription(body.description);
      if (description.error !== undefined) return badRequest(description.error);
      input.description = description.value;
    }

    if (body.airDate !== undefined && body.airDate !== null && body.airDate !== '') {
      const airDate = checkAirDate(body.airDate);
      if (airDate.error !== undefined) return badRequest(airDate.error);
      input.airDate = airDate.value;
    }

    const isPublished = checkIsPublished(body.isPublished);
    if (isPublished.error !== undefined) return badRequest(isPublished.error);
    if (isPublished.value !== undefined) input.isPublished = isPublished.value;

    const eventId = checkLinkId(body.eventId, 'eventId');
    if (eventId.error !== undefined) return badRequest(eventId.error);

    const { content: { episodes }, leagueOps: { events } } = getRepositories();

    if (eventId.value) {
      if (!(await events.findById(eventId.value))) return badRequest('Event not found');
      input.eventId = eventId.value;
    }

    const existing = await episodes.findByYoutubeId(youtubeVideoId);
    if (existing) {
      return errorWithDetails(400, DUPLICATE_EPISODE_MESSAGE, { existingEpisodeId: existing.episodeId });
    }

    const auth = getAuthContext(event);
    input.createdBy = auth.sub || auth.username;

    return created(await episodes.create(input));
  } catch (err) {
    console.error('Error creating episode:', err);
    return serverError('Failed to create episode');
  }
};
