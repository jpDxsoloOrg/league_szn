import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const { season: { seasons, seasonAwards, seasonStandings } } = getRepositories();
    const existing = await seasons.findById(seasonId);
    if (!existing) {
      return notFound('Season not found');
    }

    // Delete the season
    await seasons.delete(seasonId);

    // Also delete season standings
    await seasonStandings.deleteAllForSeason(seasonId);

    // Delete season awards via repository
    await seasonAwards.deleteAllForSeason(seasonId);

    return noContent();
  } catch (err) {
    console.error('Error deleting season:', err);
    return serverError('Failed to delete season');
  }
};
