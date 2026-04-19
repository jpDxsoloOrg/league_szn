import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { season: { seasons } } = getRepositories();
    const items = await seasons.list();
    return success(items);
  } catch (err) {
    console.error('Error fetching seasons:', err);
    return serverError('Failed to fetch seasons');
  }
};
