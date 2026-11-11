import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, conflict, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const { season: { seasons, awards: seasonAwards, standings: seasonStandings } } = getRepositories();
    const existing = await seasons.findById(seasonId);
    if (!existing) {
      return notFound('Season not found');
    }

    if (existing.status === 'active') {
      return conflict('Cannot delete an active season. End the season first.');
    }

    // Children go first: if a step fails the season still exists, so the
    // delete can be retried and no orphaned rows are left behind.
    await seasonStandings.deleteAllForSeason(seasonId);
    await seasonAwards.deleteAllForSeason(seasonId);

    await seasons.delete(seasonId);

    return noContent();
  } catch (err) {
    console.error('Error deleting season:', err);
    return serverError('Failed to delete season');
  }
};
