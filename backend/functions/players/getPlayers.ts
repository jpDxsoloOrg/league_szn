import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const players = await getRepositories().players.list();

    // Only include players who have a wrestler assigned (exclude Fantasy-only users)
    const wrestlers = players.filter((p) => p.currentWrestler);

    return success(wrestlers);
  } catch (err) {
    console.error('Error fetching players:', err);
    return serverError('Failed to fetch players');
  }
};
