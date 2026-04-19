import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    const awardId = event.pathParameters?.awardId;

    if (!seasonId) {
      return badRequest('Season ID is required');
    }
    if (!awardId) {
      return badRequest('Award ID is required');
    }

    const { season: { seasonAwards } } = getRepositories();
    const existing = await seasonAwards.findById(seasonId, awardId);
    if (!existing) {
      return notFound('Award not found');
    }

    await seasonAwards.delete(seasonId, awardId);
    return noContent();
  } catch (err) {
    console.error('Error deleting season award:', err);
    return serverError('Failed to delete season award');
  }
};
