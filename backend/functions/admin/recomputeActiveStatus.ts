import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, conflict, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

/**
 * Rebuild `lastActiveSeasonId` for every player from the completed matches of
 * the active season.
 *
 * Needed because (a) existing data predates the field and (b) deleting a
 * completed match does not walk back a player's activity — reversing that
 * inline would mean scanning the player's remaining season matches inside the
 * delete transaction. Admin overrides are left untouched.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const {
      roster: { players },
      competition: { matches },
      season: { seasons },
    } = getRepositories();

    const activeSeason = await seasons.findActive();
    if (!activeSeason) {
      return conflict('There is no active season — nothing to recompute');
    }

    const [allPlayers, seasonMatches] = await Promise.all([
      players.list(),
      matches.listBySeason(activeSeason.seasonId),
    ]);

    const activePlayerIds = new Set<string>();
    for (const match of seasonMatches) {
      if (match.status !== 'completed') continue;
      for (const playerId of match.participants || []) {
        activePlayerIds.add(playerId);
      }
    }

    let marked = 0;
    let cleared = 0;

    for (const player of allPlayers) {
      const shouldBeActive = activePlayerIds.has(player.playerId);
      const isMarked = player.lastActiveSeasonId === activeSeason.seasonId;
      if (shouldBeActive === isMarked) continue;

      await players.update(player.playerId, {
        lastActiveSeasonId: shouldBeActive ? activeSeason.seasonId : null,
      });
      if (shouldBeActive) marked++;
      else cleared++;
    }

    return success({
      seasonId: activeSeason.seasonId,
      playersScanned: allPlayers.length,
      completedMatches: seasonMatches.filter((m) => m.status === 'completed').length,
      marked,
      cleared,
    });
  } catch (err) {
    console.error('Error recomputing active status:', err);
    return serverError('Failed to recompute active status');
  }
};
