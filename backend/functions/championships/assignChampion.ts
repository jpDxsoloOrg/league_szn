import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';

interface AssignChampionBody {
  champion?: string | string[];
}

/**
 * Admin-only: crown a champion directly without a match.
 * Closes the current reign (if any) and opens a new one so
 * championship history stays consistent with match-driven title changes.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const championshipId = event.pathParameters?.championshipId;

    if (!championshipId) {
      return badRequest('Championship ID is required');
    }

    const { data: body, error: parseError } = parseBody<AssignChampionBody>(event);
    if (parseError) return parseError;

    const rawChampion = body.champion;
    const championIds = Array.isArray(rawChampion)
      ? rawChampion.filter((id) => typeof id === 'string' && id.length > 0)
      : typeof rawChampion === 'string' && rawChampion.length > 0
        ? [rawChampion]
        : [];

    if (championIds.length === 0) {
      return badRequest('champion is required (player ID or array of player IDs)');
    }

    if (new Set(championIds).size !== championIds.length) {
      return badRequest('champion contains duplicate player IDs');
    }

    const { competition: { championships }, roster: { players }, runInTransaction } = getRepositories();

    const championship = await championships.findById(championshipId);
    if (!championship) {
      return notFound('Championship not found');
    }

    if (championship.type === 'singles' && championIds.length !== 1) {
      return badRequest('A singles championship must have exactly one champion');
    }
    if (championship.type === 'tag' && championIds.length < 2) {
      return badRequest('A tag championship requires at least two champions');
    }

    for (const playerId of championIds) {
      const player = await players.findById(playerId);
      if (!player) {
        return badRequest(`Player not found: ${playerId}`);
      }
    }

    const newChampion = championIds.length === 1 ? championIds[0] : championIds;
    const oldChampion = championship.currentChampion;

    const isSameChampion = oldChampion != null && (
      (typeof oldChampion === 'string' && typeof newChampion === 'string' && oldChampion === newChampion) ||
      (Array.isArray(oldChampion) && Array.isArray(newChampion) &&
        oldChampion.length === newChampion.length &&
        JSON.stringify([...oldChampion].sort()) === JSON.stringify([...newChampion].sort()))
    );

    if (isSameChampion) {
      return badRequest('This player is already the champion');
    }

    const currentReign = oldChampion ? await championships.findCurrentReign(championshipId) : null;
    const wonDate = new Date().toISOString();

    await runInTransaction(async (tx) => {
      tx.updateChampionship(championshipId, { currentChampion: newChampion });

      if (currentReign) {
        const reignStartDate = new Date(currentReign.wonDate);
        const lostDate = new Date();
        const daysHeld = Math.floor((lostDate.getTime() - reignStartDate.getTime()) / (1000 * 60 * 60 * 24));
        tx.closeReign(championshipId, currentReign.wonDate, lostDate.toISOString(), daysHeld);
      }

      // No matchId: this reign was assigned by an admin, not won in a match.
      tx.startReign({
        championshipId,
        wonDate,
        champion: newChampion,
        defenses: 0,
        updatedAt: wonDate,
      });
    });

    const updated = await championships.findById(championshipId);

    return success(updated);
  } catch (err) {
    console.error('Error assigning champion:', err);
    return serverError('Failed to assign champion');
  }
};
