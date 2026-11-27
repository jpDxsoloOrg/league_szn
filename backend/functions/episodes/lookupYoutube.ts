import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { fetchYoutubeOEmbed, parseYoutubeVideoId, youtubeThumbnailUrl } from '../../lib/youtube';

interface LookupBody {
  url?: unknown;
}

export interface YoutubeLookupResponse {
  youtubeVideoId: string;
  /** '' when oEmbed was unavailable. */
  title: string;
  channelName?: string;
  thumbnailUrl: string;
  oembedAvailable: boolean;
  /** Set when this video is already an episode. */
  existingEpisodeId?: string;
}

/**
 * POST /admin/episodes/youtube-lookup (staff). The only place oEmbed is
 * fetched. An oEmbed failure is not an error: the form falls back to a typed title.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const { data: body, error: parseError } = parseBody<LookupBody>(event);
    if (parseError) return parseError;

    const youtubeVideoId = typeof body.url === 'string' ? parseYoutubeVideoId(body.url) : null;
    if (!youtubeVideoId) return badRequest('Not a YouTube video link');

    const { content: { episodes } } = getRepositories();
    const [oembed, existing] = await Promise.all([
      fetchYoutubeOEmbed(youtubeVideoId),
      episodes.findByYoutubeId(youtubeVideoId),
    ]);

    const result: YoutubeLookupResponse = {
      youtubeVideoId,
      title: oembed?.title ?? '',
      thumbnailUrl: youtubeThumbnailUrl(youtubeVideoId),
      oembedAvailable: oembed !== null,
    };
    if (oembed?.channelName) result.channelName = oembed.channelName;
    if (existing) result.existingEpisodeId = existing.episodeId;

    return success(result);
  } catch (err) {
    console.error('Error looking up YouTube video:', err);
    return serverError('Failed to look up video');
  }
};
