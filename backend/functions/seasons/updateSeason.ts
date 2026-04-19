import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, NotFoundError } from '../../lib/repositories';
import { success, badRequest, notFound, serverError, conflict } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface UpdateSeasonBody {
  name?: string;
  endDate?: string;
  status?: 'active' | 'completed';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const { data: body, error: parseError } = parseBody<UpdateSeasonBody>(event);
    if (parseError) return parseError;

    const { season: { seasons } } = getRepositories();
    const existing = await seasons.findById(seasonId);
    if (!existing) {
      return notFound('Season not found');
    }

    // If trying to activate a season, check if there's already an active one
    if (body.status === 'active' && existing.status !== 'active') {
      const activeSeason = await seasons.findActive();
      if (activeSeason && activeSeason.seasonId !== seasonId) {
        return conflict('There is already an active season. Please end the current season first.');
      }
    }

    const hasChanges = Object.values(body).some((v) => v !== undefined);
    if (!hasChanges) {
      return badRequest('No valid fields to update');
    }

    const updated = await seasons.update(seasonId, body);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound('Season not found');
    console.error('Error updating season:', err);
    return serverError('Failed to update season');
  }
};
