import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { content: { announcements } } = getRepositories();
    const items = await announcements.listActive();
    return success(items);
  } catch (err) {
    console.error('Error fetching active announcements:', err);
    return serverError('Failed to fetch active announcements');
  }
};
