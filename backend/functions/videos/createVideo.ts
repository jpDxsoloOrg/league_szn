import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { created, badRequest, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { checkLinkId } from '../episodes/validation';

interface CreateVideoBody {
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  category: 'match' | 'highlight' | 'promo' | 'other';
  tags?: string[];
  isPublished?: boolean;
  /** Staff only; a wrestler's value is ignored. '' or null means no link. */
  episodeId?: string | null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    const isStaff = hasRole(auth, 'Admin', 'Moderator');
    const isOffline = process.env.IS_OFFLINE === 'true';

    const { roster: { players }, content: { videos, episodes } } = getRepositories();

    // Wrestlers may submit videos only when their player record has the
    // canUploadVideos flag set. Their submissions are always created as drafts.
    let wrestlerPlayerId: string | undefined;
    if (!isStaff && !isOffline) {
      if (!hasRole(auth, 'Wrestler')) {
        return forbidden('You do not have permission to perform this action');
      }
      const player = auth.sub ? await players.findByUserId(auth.sub) : null;
      if (!player || !player.canUploadVideos) {
        return forbidden('Your account is not permitted to upload videos');
      }
      wrestlerPlayerId = player.playerId;
    }

    const { data: body, error: parseError } = parseBody<CreateVideoBody>(event);
    if (parseError) return parseError;

    const { title, description, videoUrl, thumbnailUrl, category, tags, isPublished } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return badRequest('title is required');
    }
    if (!videoUrl || typeof videoUrl !== 'string' || videoUrl.trim().length === 0) {
      return badRequest('videoUrl is required');
    }
    if (!category || !['match', 'highlight', 'promo', 'other'].includes(category)) {
      return badRequest('category must be "match", "highlight", "promo", or "other"');
    }
    if (isPublished !== undefined && typeof isPublished !== 'boolean') {
      return badRequest('isPublished must be a boolean');
    }

    // Highlights link to staff content, so only staff may set the episode.
    let episodeId: string | undefined;
    if (!wrestlerPlayerId) {
      const link = checkLinkId(body.episodeId, 'episodeId');
      if (link.error !== undefined) return badRequest(link.error);
      if (link.value) {
        if (!(await episodes.findById(link.value))) return badRequest('Episode not found');
        episodeId = link.value;
      }
    }

    const video = await videos.create({
      title,
      description,
      videoUrl,
      thumbnailUrl,
      category,
      tags,
      // Wrestler uploads are always drafts pending admin moderation.
      isPublished: wrestlerPlayerId ? false : isPublished,
      uploadedBy: wrestlerPlayerId ?? (auth.username || auth.sub),
      episodeId,
    });

    return created(video);
  } catch (err) {
    console.error('Error creating video:', err);
    return serverError('Failed to create video');
  }
};
