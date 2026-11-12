import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { bookingRefusal } from '../../lib/discipline';
import { championIdsOf } from '../../lib/disciplineGates';
import { resolveChampionTagTeamId } from '../../lib/tagTeams/championTagTeam';

interface AssignChampionBody {
  champion?: string | string[];
  /** Tag titles only: crown this tag team. `champion` may be left out, or must name the team's two players. */
  tagTeamId?: string;
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

    const requestedTagTeamId = body.tagTeamId;
    if (requestedTagTeamId !== undefined && (typeof requestedTagTeamId !== 'string' || requestedTagTeamId.length === 0)) {
      return badRequest('tagTeamId must be a non-empty string');
    }

    const rawChampion = body.champion;
    let championIds = Array.isArray(rawChampion)
      ? rawChampion.filter((id) => typeof id === 'string' && id.length > 0)
      : typeof rawChampion === 'string' && rawChampion.length > 0
        ? [rawChampion]
        : [];

    if (championIds.length === 0 && requestedTagTeamId === undefined) {
      return badRequest('champion is required (player ID or array of player IDs)');
    }

    if (new Set(championIds).size !== championIds.length) {
      return badRequest('champion contains duplicate player IDs');
    }

    const { competition: { championships }, roster: { players, tagTeams }, runInTransaction } = getRepositories();

    const championship = await championships.findById(championshipId);
    if (!championship) {
      return notFound('Championship not found');
    }

    let tagTeamId: string | null = null;
    if (requestedTagTeamId !== undefined) {
      if (championship.type !== 'tag') {
        return badRequest('tagTeamId can only be set on a tag championship');
      }
      const team = await tagTeams.findById(requestedTagTeamId);
      if (!team) {
        return badRequest(`Tag team not found: ${requestedTagTeamId}`);
      }
      if (team.status !== 'active') {
        return badRequest('Only an active tag team can be crowned');
      }
      const teamIds = [team.player1Id, team.player2Id];
      if (championIds.length === 0) {
        championIds = teamIds;
      } else if (championIds.length !== 2 || !teamIds.every((id) => championIds.includes(id))) {
        return badRequest('champion must be the two members of the tag team');
      }
      tagTeamId = team.tagTeamId;
    }

    if (championship.type === 'singles' && championIds.length !== 1) {
      return badRequest('A singles championship must have exactly one champion');
    }
    if (championship.type === 'tag' && championIds.length < 2) {
      return badRequest('A tag championship requires at least two champions');
    }

    // A deactivated co-holder staying on the title must not stop this change.
    const currentHolders = championIdsOf(championship.currentChampion);
    for (const playerId of championIds) {
      const player = await players.findById(playerId);
      if (!player) {
        return badRequest(`Player not found: ${playerId}`);
      }
      const refusal = currentHolders.includes(playerId) ? null : bookingRefusal(player);
      if (refusal) return refusal;
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

    // No team given: link the reign if the two champions are a registered team.
    if (tagTeamId === null && championship.type === 'tag') {
      tagTeamId = await resolveChampionTagTeamId(championIds, wonDate);
    }
    const championshipPatch: Record<string, unknown> = { currentChampion: newChampion };
    if (tagTeamId) {
      championshipPatch.currentTagTeamId = tagTeamId;
    } else if (championship.currentTagTeamId) {
      championshipPatch.currentTagTeamId = null;
    }

    await runInTransaction(async (tx) => {
      tx.updateChampionship(championshipId, championshipPatch);

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
        ...(tagTeamId ? { tagTeamId } : {}),
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
