import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { parseBody } from '../../lib/parseBody';
import { created, badRequest, notFound, serverError } from '../../lib/response';

interface CreateAwardBody {
  name: string;
  playerId: string;
  description?: string;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const seasonId = event.pathParameters?.seasonId;
    if (!seasonId) {
      return badRequest('Season ID is required');
    }

    const { data: body, error: parseError } = parseBody<CreateAwardBody>(event);
    if (parseError) return parseError;

    if (!body.name) {
      return badRequest('name is required');
    }
    if (!body.playerId) {
      return badRequest('playerId is required');
    }

    // Verify season exists
    const { seasons, seasonAwards, players } = getRepositories();
    const season = await seasons.findById(seasonId);
    if (!season) {
      return notFound('Season not found');
    }

    // Verify player exists
    const player = await players.findById(body.playerId);
    if (!player) {
      return notFound('Player not found');
    }

    const item = await seasonAwards.create({
      seasonId,
      name: body.name,
      awardType: 'custom',
      playerId: body.playerId,
      playerName: player.name,
      description: body.description,
    });

    return created(item);
  } catch (err) {
    console.error('Error creating season award:', err);
    return serverError('Failed to create season award');
  }
};
