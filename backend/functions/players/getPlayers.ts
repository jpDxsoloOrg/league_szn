import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { isNeedsWrestler, isPlayerVisible } from '../../lib/needsWrestler';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';
import { toPublicPlayer } from '../../lib/publicPlayer';
import { isDeactivated } from '../../lib/discipline';

/**
 * GET /players
 *
 * Public. Returns players who have a real wrestler name. Two query modes:
 *  - `view=directory`: public name lookup covering ALL players, deleted ones
 *    included, so historical matches can still resolve names. Fields are
 *    whitelisted; a blank or placeholder wrestler comes back as null. A
 *    deactivated player keeps their name, for history, and is flagged.
 *  - `includeHidden=true`: every current player, for verified staff only. Anyone
 *    else gets the public list.
 * Account ids go only to staff and to the player themselves.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { view, includeHidden } = event.queryStringParameters || {};
    const { roster: { players: playersRepo } } = getRepositories();

    if (view === 'directory') {
      const allPlayers = await playersRepo.listWithDeleted();
      return success(
        allPlayers.map((player) => ({
          playerId: player.playerId,
          name: player.name,
          currentWrestler: isNeedsWrestler(player.currentWrestler) ? null : player.currentWrestler,
          ...(isDeactivated(player) ? { deactivated: true } : {}),
        })),
      );
    }

    const players = await playersRepo.list();
    const caller = await getVerifiedCaller(event);
    const listed = includeHidden === 'true' && isStaff(caller)
      ? players
      : players.filter(isPlayerVisible);

    return success(listed.map((player) => toPublicPlayer(player, caller)));
  } catch (err) {
    console.error('Error fetching players:', err);
    return serverError('Failed to fetch players');
  }
};
