import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { badRequest, notFound, serverError, success } from '../../lib/response';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { canViewHiddenPlayer } from '../../lib/optionalCaller';
import { toPlayerBuildView } from '../../lib/builds/playerBuild';

/**
 * GET /players/{playerId}/build (BLD-03), public. The saved build (or the
 * default), the moves with their levels, the cost against the budget of the
 * player's current division, and the effective build. Hidden players read as
 * missing, as on GET /players/{playerId}.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { roster, leagueOps } = getRepositories();
    const player = await roster.players.findById(playerId);
    if (!player) return notFound('Player not found');
    if (!isPlayerVisible(player) && !(await canViewHiddenPlayer(event, player))) {
      return notFound('Player not found');
    }

    const division = player.divisionId ? await leagueOps.divisions.findById(player.divisionId) : null;
    return success(toPlayerBuildView(player, division));
  } catch (err) {
    console.error('Error fetching player build:', err);
    return serverError('Failed to fetch player build');
  }
};
