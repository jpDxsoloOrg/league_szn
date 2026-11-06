import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const videoId = event.pathParameters?.videoId;
    if (!videoId) {
      return badRequest('videoId is required');
    }

    const { content: { videos }, roster: { players } } = getRepositories();
    const video = await videos.findById(videoId);
    if (!video) {
      return notFound('Video not found');
    }

    // Drafts are readable by staff and by the wrestler who uploaded them.
    // isPublished is stored as a string for the PublishedIndex GSI, and
    // createVideo records a wrestler's playerId in uploadedBy.
    if (video.isPublished !== 'true') {
      const caller = await getVerifiedCaller(event);
      if (!isStaff(caller)) {
        const callerPlayer = caller?.sub ? await players.findByUserId(caller.sub) : null;
        if (!callerPlayer || callerPlayer.playerId !== video.uploadedBy) {
          return notFound('Video not found');
        }
      }
    }

    return success(video);
  } catch (err) {
    console.error('Error fetching video:', err);
    return serverError('Failed to fetch video');
  }
};
