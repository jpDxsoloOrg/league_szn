import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, type StablePatch } from '../../lib/repositories';
import { noContent, badRequest, serverError, conflict, notFound } from '../../lib/response';
import { NEEDS_WRESTLER } from '../../lib/needsWrestler';
import { filterExistingWrestlerIds } from './wrestlerAssignment';

/**
 * The player row stays so history keeps the name, but only name lookups can
 * still read it (see `Player.deletedAt`). A repeat delete finds nothing and gets
 * the same 404 a hard delete gave. Clearing `userId` is what lets the same
 * person sign up again: they get a new player, and the old row stays with its
 * history. Null removes the attribute, which the UserIdIndex needs because a
 * GSI key cannot be null.
 */
const softDeletePatch = (deletedAt: string): Record<string, unknown> => ({
  deletedAt,
  userId: null,
  currentWrestler: NEEDS_WRESTLER,
  currentWrestlerId: null,
  alternateWrestler: null,
  alternateWrestlerId: null,
  stableId: null,
  tagTeamId: null,
  // Match cards return the live gamertag, which must not outlive the player.
  psnId: null,
});

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const {
      roster: { players, stables, tagTeams },
      competition: { championships },
      season: { standings: seasonStandings },
      runInTransaction,
    } = getRepositories();

    const player = await players.findById(playerId);
    if (!player) {
      return notFound('Player not found');
    }

    // Refuse before anything is written, so a blocked delete changes nothing.
    const allChampionships = await championships.list();
    const heldChampionships = allChampionships.filter(c => {
      const champion = c.currentChampion;
      if (Array.isArray(champion)) {
        return champion.includes(playerId);
      }
      return champion === playerId;
    });

    if (heldChampionships.length > 0) {
      const championshipNames = heldChampionships.map(c => c.name).join(', ');
      return conflict(
        `Cannot delete player. They are currently champion of: ${championshipNames}. Remove their championship first.`
      );
    }

    // Keyed by player because one transaction cannot touch the same row twice,
    // and a stable-mate can also be the tag team partner.
    const otherPlayerPatches = new Map<string, Record<string, unknown>>();
    const addPlayerPatch = (otherPlayerId: string, patch: Record<string, unknown>) => {
      otherPlayerPatches.set(otherPlayerId, { ...otherPlayerPatches.get(otherPlayerId), ...patch });
    };

    // --- Stable cleanup plan ---
    let stablePatch: StablePatch | null = null;
    const stableId = player.stableId;
    if (stableId) {
      const stable = await stables.findById(stableId);

      if (stable && (stable.status === 'active' || stable.status === 'approved')) {
        const remainingMembers = (stable.memberIds || []).filter(id => id !== playerId);

        if (remainingMembers.length <= 1) {
          // Nobody left, or a leader alone: the stable disbands.
          stablePatch = {
            memberIds: remainingMembers,
            status: 'disbanded',
            disbandedAt: new Date().toISOString(),
          };
          if (remainingMembers.length === 1) {
            addPlayerPatch(remainingMembers[0], { stableId: null });
          }
        } else if (stable.leaderId === playerId) {
          stablePatch = { memberIds: remainingMembers, leaderId: remainingMembers[0] };
        } else {
          stablePatch = { memberIds: remainingMembers };
        }
      }
    }

    // --- Tag team cleanup plan ---
    let tagTeamToDissolve: string | null = null;
    if (player.tagTeamId) {
      const tagTeam = await tagTeams.findById(player.tagTeamId);

      if (tagTeam && tagTeam.status !== 'dissolved') {
        tagTeamToDissolve = tagTeam.tagTeamId;

        // Clear tagTeamId from the partner if tag team was active
        if (tagTeam.status === 'active') {
          const partnerId = tagTeam.player1Id === playerId
            ? tagTeam.player2Id
            : tagTeam.player1Id;
          addPlayerPatch(partnerId, { tagTeamId: null });
        }
      }
    }

    // An unconditional transactional update creates the row when it is missing,
    // so a stale member or partner id must not reach the transaction.
    const otherPlayerIds = Array.from(otherPlayerPatches.keys());
    const otherPlayers = await Promise.all(otherPlayerIds.map(id => players.findById(id)));
    const existingOtherPlayerIds = otherPlayerIds.filter((_id, index) => otherPlayers[index] !== null);

    // Release any assigned wrestlers so the roster entries become available
    // again. A Set because one wrestler can sit in both slots of a desynced row.
    const toRelease = new Set<string>();
    if (player.currentWrestlerId) toRelease.add(player.currentWrestlerId);
    if (player.alternateWrestlerId) toRelease.add(player.alternateWrestlerId);
    const releasable = await filterExistingWrestlerIds(Array.from(toRelease));

    await runInTransaction(async (tx) => {
      if (tagTeamToDissolve) {
        tx.updateTagTeam(tagTeamToDissolve, {
          status: 'dissolved',
          dissolvedAt: new Date().toISOString(),
        });
      }
      for (const otherPlayerId of existingOtherPlayerIds) {
        tx.updatePlayer(otherPlayerId, otherPlayerPatches.get(otherPlayerId) ?? {});
      }
      for (const wrestlerId of releasable) {
        tx.releaseWrestlerFromPlayer({ wrestlerId });
      }
    });

    // The writes below have no unit of work method. They run in this order, with
    // the player last, so that a failure can be retried: the player and the
    // stable keep the state the plan above is built from until they change.
    if (stableId && stablePatch) {
      await stables.update(stableId, stablePatch);
    }

    const standings = await seasonStandings.listByPlayer(playerId);
    for (const standing of standings) {
      await seasonStandings.delete(standing.seasonId, playerId);
    }

    await runInTransaction(async (tx) => {
      tx.updatePlayer(playerId, softDeletePatch(new Date().toISOString()));
    });

    return noContent();
  } catch (err) {
    console.error('Error deleting player:', err);
    return serverError('Failed to delete player');
  }
};
