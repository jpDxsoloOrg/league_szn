import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { serverError, success } from '../../lib/response';

/**
 * POST /wrestlers/reset-assignments (admin)
 *
 * Bulk-clears every wrestler assignment in the league:
 * - Every wrestler that is in use (or still carries an `assignedPlayerId`)
 *   is released: `isInUse=false`, REMOVE `assignedPlayerId`/`assignedSlot`
 *   (same staging as the single-release path in updatePlayer/deletePlayer).
 * - Every player with a wrestler FK gets `currentWrestlerId` /
 *   `alternateWrestlerId` removed, along with the denormalized display
 *   names (`currentWrestler` is set to '' since it's a required field;
 *   `alternateWrestler` is removed).
 *
 * All mutations are staged through the unit of work, which flushes
 * TransactWriteItems in ≤100-item chunks.
 *
 * Returns { clearedWrestlers, clearedPlayers }.
 */
export const handler: APIGatewayProxyHandler = async () => {
  try {
    const { roster, runInTransaction } = getRepositories();

    const [wrestlers, players] = await Promise.all([
      roster.wrestlers.list(),
      roster.players.list(),
    ]);

    const assignedWrestlers = wrestlers.filter(
      (wrestler) => wrestler.isInUse || wrestler.assignedPlayerId !== undefined,
    );
    const assignedPlayers = players.filter(
      (player) => player.currentWrestlerId || player.alternateWrestlerId,
    );

    if (assignedWrestlers.length === 0 && assignedPlayers.length === 0) {
      return success({ clearedWrestlers: 0, clearedPlayers: 0 });
    }

    await runInTransaction(async (tx) => {
      for (const wrestler of assignedWrestlers) {
        tx.releaseWrestlerFromPlayer({ wrestlerId: wrestler.wrestlerId });
      }
      for (const player of assignedPlayers) {
        const patch: Record<string, unknown> = {};
        if (player.currentWrestlerId) {
          patch.currentWrestlerId = null;
          patch.currentWrestler = '';
        }
        if (player.alternateWrestlerId) {
          patch.alternateWrestlerId = null;
          patch.alternateWrestler = null;
        }
        tx.updatePlayer(player.playerId, patch);
      }
    });

    return success({
      clearedWrestlers: assignedWrestlers.length,
      clearedPlayers: assignedPlayers.length,
    });
  } catch (err) {
    console.error('Error resetting wrestler assignments:', err);
    return serverError('Failed to reset wrestler assignments');
  }
};
