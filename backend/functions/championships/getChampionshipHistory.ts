import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { competition: { championships } } = getRepositories();
    const history = await championships.listHistory(championshipId);

    return success(history);
  } catch (err) {
    console.error('Error fetching championship history:', err);
    return serverError('Failed to fetch championship history');
  }
};
