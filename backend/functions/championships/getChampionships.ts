import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { championships } = getRepositories();
    const allChampionships = await championships.list();

    // Filter active championships by default
    const active = allChampionships.filter(c => c.isActive !== false);

    return success(active);
  } catch (err) {
    console.error('Error fetching championships:', err);
    return serverError('Failed to fetch championships');
  }
};
