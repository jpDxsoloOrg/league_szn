import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { competition: { championships } } = getRepositories();
    const allChampionships = await championships.list();

    // Inactive titles stay listed for admin management and public history,
    // but are excluded by default so scheduling pickers only see active ones.
    const includeInactive = event.queryStringParameters?.includeInactive === 'true';
    const result = includeInactive
      ? allChampionships
      : allChampionships.filter(c => c.isActive !== false);

    return success(result);
  } catch (err) {
    console.error('Error fetching championships:', err);
    return serverError('Failed to fetch championships');
  }
};
