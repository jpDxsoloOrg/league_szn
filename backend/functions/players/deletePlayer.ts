import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, serverError, conflict, notFound } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const { players, championships, stables, tagTeams, seasonStandings } = getRepositories();

    const player = await players.findById(playerId);
    if (!player) {
      return notFound('Player not found');
    }

    // --- Stable cleanup ---
    if (player.stableId) {
      try {
        const stableId = player.stableId as string;
        const stable = await stables.findById(stableId);

        if (stable && (stable.status === 'active' || stable.status === 'approved')) {
          const memberIds = stable.memberIds || [];
          const remainingMembers = memberIds.filter(id => id !== playerId);

          if (remainingMembers.length === 0) {
            // No members remain — disband
            await stables.update(stableId, {
              memberIds: [],
              status: 'disbanded',
              disbandedAt: new Date().toISOString(),
            });
          } else if (remainingMembers.length === 1) {
            // Only one member left (leader alone) — auto-disband
            await stables.update(stableId, {
              memberIds: remainingMembers,
              status: 'disbanded',
              disbandedAt: new Date().toISOString(),
            });
            // Clear stableId from the remaining member
            await players.update(remainingMembers[0], { stableId: null });
          } else {
            // Multiple members remain — remove player, promote leader if needed
            const isLeader = stable.leaderId === playerId;
            if (isLeader) {
              await stables.update(stableId, {
                memberIds: remainingMembers,
                leaderId: remainingMembers[0],
              });
            } else {
              await stables.update(stableId, { memberIds: remainingMembers });
            }
          }
        }
      } catch (stableErr) {
        console.warn('Warning: Failed to clean up stable membership for player', playerId, stableErr);
      }
    }

    // --- Tag team cleanup ---
    if (player.tagTeamId) {
      try {
        const tagTeamId = player.tagTeamId as string;
        const tagTeam = await tagTeams.findById(tagTeamId);

        if (tagTeam) {
          // Dissolve the tag team
          await tagTeams.update(tagTeamId, {
            status: 'dissolved',
            dissolvedAt: new Date().toISOString(),
          });

          // Clear tagTeamId from the partner if tag team was active
          if (tagTeam.status === 'active') {
            const partnerId = tagTeam.player1Id === playerId
              ? tagTeam.player2Id
              : tagTeam.player1Id;

            await players.update(partnerId, { tagTeamId: null });
          }
        }
      } catch (tagTeamErr) {
        console.warn('Warning: Failed to clean up tag team membership for player', playerId, tagTeamErr);
      }
    }

    // Check if player is a current champion
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

    // Delete the player
    await players.delete(playerId);

    // Also delete from season standings
    const standings = await seasonStandings.listByPlayer(playerId);
    for (const standing of standings) {
      await seasonStandings.delete(standing.seasonId, playerId);
    }

    return noContent();
  } catch (err) {
    console.error('Error deleting player:', err);
    return serverError('Failed to delete player');
  }
};
