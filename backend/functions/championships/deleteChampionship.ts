import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { competition: { championships } } = getRepositories();

    const existing = await championships.findById(championshipId);
    if (!existing) {
      return notFound('Championship not found');
    }

    // History goes first: if a step fails the championship still exists, so
    // the delete can be retried and no orphaned history is left behind.
    const history = await championships.listHistory(championshipId);
    for (const entry of history) {
      await championships.deleteHistoryEntry(championshipId, entry.wonDate);
    }

    await championships.delete(championshipId);

    return noContent();
  } catch (err) {
    console.error('Error deleting championship:', err);
    return serverError('Failed to delete championship');
  }
};
