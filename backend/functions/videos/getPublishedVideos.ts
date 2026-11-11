import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { toPublicVideo } from '../../lib/publicVideo';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const category = event.queryStringParameters?.category;
    const { content: { videos } } = getRepositories();
    const items = await videos.listPublished(category);
    return success(items.map(toPublicVideo));
  } catch (err) {
    console.error('Error fetching published videos:', err);
    return serverError('Failed to fetch videos');
  }
};
