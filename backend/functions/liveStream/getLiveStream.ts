import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { toPublicLiveStream } from '../../lib/liveStream';

/** GET /live-stream (public): channel, title and isLive after the 8-hour guard. */
export const handler: APIGatewayProxyHandler = async () => {
  try {
    const settings = await getRepositories().user.siteConfig.getLiveStream();
    return success(toPublicLiveStream(settings));
  } catch (err) {
    console.error('Error fetching live stream:', err);
    return serverError('Failed to fetch live stream');
  }
};
