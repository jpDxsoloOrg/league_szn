import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { isNeedsWrestler, isPlayerVisible } from '../../lib/needsWrestler';
import { getVerifiedCaller, isStaff } from '../../lib/optionalCaller';

/**
 * GET /players
 *
 * Public. Returns players who have a real wrestler name. Two query modes:
 *  - `view=directory`: public name lookup covering ALL players, so historical
 *    matches can still resolve names. Fields are whitelisted; a blank or
 *    placeholder wrestler comes back as null.
 *  - `includeHidden=true`: every player, for verified staff only. Anyone else
 *    gets the public list.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const { view, includeHidden } = event.queryStringParameters || {};
    const players = await getRepositories().roster.players.list();

    if (view === 'directory') {
      return success(
        players.map(({ playerId, name, currentWrestler }) => ({
          playerId,
          name,
          currentWrestler: isNeedsWrestler(currentWrestler) ? null : currentWrestler,
        })),
      );
    }

    if (includeHidden === 'true' && isStaff(await getVerifiedCaller(event))) {
      return success(players);
    }

    return success(players.filter(isPlayerVisible));
  } catch (err) {
    console.error('Error fetching players:', err);
    return serverError('Failed to fetch players');
  }
};
