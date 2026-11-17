import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { canViewHiddenPlayer } from '../../lib/optionalCaller';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { mergeDivisionHistory } from '../../lib/progression/divisionHistory';
import { badRequest, notFound, serverError, success } from '../../lib/response';

/**
 * GET /progression/players/{playerId}/history (public, DMV-09).
 *
 * The player's division moves, oldest first: executed call-ups, promotions
 * and relegations, merged with approved division transfers. Hidden players
 * read as missing to everyone but themselves and staff.
 */
export const getDivisionHistory: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('playerId is required');

    const {
      progression,
      roster: { players, transfers },
      leagueOps: { divisions },
    } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    if (!isPlayerVisible(player) && !(await canViewHiddenPlayer(event, player))) {
      return notFound('Player not found');
    }

    const [events, transferRequests, allDivisions] = await Promise.all([
      progression.listEvents(playerId),
      transfers.listByPlayer(playerId),
      divisions.list(),
    ]);

    return success(mergeDivisionHistory(events, transferRequests, allDivisions));
  } catch (err) {
    console.error('Error fetching division history:', err);
    return serverError('Failed to fetch division history');
  }
};
