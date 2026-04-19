import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { videos } = getRepositories();
    const items = await videos.list();
    return success(items);
  } catch (err) {
    console.error('Error listing videos:', err);
    return serverError('Failed to list videos');
  }
};
