import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import {
  success,
  badRequest,
  notFound,
  conflict,
  serverError,
} from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface SetMatchOfTheNightBody {
  matchOfTheNight: boolean;
}

/**
 * PUT /matches/{matchId}/motn
 *
 * Toggle a completed match's Match-of-the-Night flag. Admin / Moderator only.
 * Separated from `recordResult` so MOTN can be set as a post-show editorial
 * decision after results are already recorded.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const matchId = event.pathParameters?.matchId;
    if (!matchId) return badRequest('matchId is required');

    const { data: body, error: parseError } = parseBody<SetMatchOfTheNightBody>(event);
    if (parseError) return parseError;

    if (typeof body.matchOfTheNight !== 'boolean') {
      return badRequest('matchOfTheNight must be a boolean');
    }

    const {
      competition: { matches },
      runInTransaction,
    } = getRepositories();

    const match = await matches.findByIdWithDate(matchId);
    if (!match) return notFound('Match not found');

    if (match.status !== 'completed') {
      return conflict('Match is not completed yet.');
    }

    await runInTransaction(async (tx) => {
      tx.updateMatch(matchId, match.date, { matchOfTheNight: body.matchOfTheNight });
    });

    return success({
      ...match,
      matchOfTheNight: body.matchOfTheNight,
    });
  } catch (err) {
    console.error('Error setting match of the night:', err);
    return serverError('Failed to set match of the night');
  }
};
