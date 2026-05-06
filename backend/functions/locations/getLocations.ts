import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { leagueOps: { locations } } = getRepositories();
    const items = await locations.list();
    items.sort((a, b) => a.name.localeCompare(b.name));
    return success(items);
  } catch (err) {
    console.error('Error fetching locations:', err);
    return serverError('Failed to fetch locations');
  }
};
