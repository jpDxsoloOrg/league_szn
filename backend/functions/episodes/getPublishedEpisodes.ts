import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { toPublicEpisode } from '../../lib/publicEpisode';

/** GET /episodes (public). `?eventId=` narrows to the episodes linked to that event. */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const eventId = event.queryStringParameters?.eventId?.trim();
    const { content: { episodes } } = getRepositories();

    const items = eventId
      ? (await episodes.listByEvent(eventId)).filter((episode) => episode.isPublished === 'true')
      : await episodes.listPublished();

    return success(items.map(toPublicEpisode));
  } catch (err) {
    console.error('Error fetching published episodes:', err);
    return serverError('Failed to fetch episodes');
  }
};
