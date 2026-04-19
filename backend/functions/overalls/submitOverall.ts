import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface SubmitOverallBody {
  mainOverall: number;
  alternateOverall?: number;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const { roster: { players, overalls } } = getRepositories();
    const player = await players.findByUserId(sub);

    if (!player) {
      return notFound('No player profile found for this user');
    }

    const playerId = player.playerId;

    const parsed = parseBody<SubmitOverallBody>(event);
    if (parsed.error) return parsed.error;
    const { mainOverall, alternateOverall } = parsed.data;

    if (
      typeof mainOverall !== 'number' ||
      !Number.isInteger(mainOverall) ||
      mainOverall < 60 ||
      mainOverall > 99
    ) {
      return badRequest('mainOverall must be an integer between 60 and 99');
    }

    if (alternateOverall !== undefined) {
      if (
        typeof alternateOverall !== 'number' ||
        !Number.isInteger(alternateOverall) ||
        alternateOverall < 60 ||
        alternateOverall > 99
      ) {
        return badRequest('alternateOverall must be an integer between 60 and 99');
      }
    }

    const item = await overalls.submit({ playerId, mainOverall, alternateOverall });

    return success(item);
  } catch (err) {
    console.error('Error submitting wrestler overall:', err);
    return serverError('Failed to submit wrestler overall');
  }
};
