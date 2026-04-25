import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

interface SkippedMember {
  playerId: string;
  reason: 'not-found' | 'in-other-stable';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { roster: { stables: stablesRepo, players: playersRepo } } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    if (stable.status !== 'disbanded') {
      return badRequest(
        `Stable is ${stable.status}; only disbanded stables can be reactivated`,
      );
    }

    // Restore Player.stableId for each historical member, but never overwrite
    // a player who has since joined a different stable.
    const restoredMemberIds: string[] = [];
    const skippedMembers: SkippedMember[] = [];

    await Promise.all(
      stable.memberIds.map(async (playerId) => {
        const player = await playersRepo.findById(playerId);
        if (!player) {
          skippedMembers.push({ playerId, reason: 'not-found' });
          return;
        }
        if (player.stableId && player.stableId !== stableId) {
          skippedMembers.push({ playerId, reason: 'in-other-stable' });
          return;
        }
        if (player.stableId !== stableId) {
          await playersRepo.update(playerId, { stableId });
        }
        restoredMemberIds.push(playerId);
      }),
    );

    // Flip status back to active. We intentionally leave `disbandedAt` set as
    // a historical record — `status` is the source of truth for whether the
    // stable is currently active.
    await stablesRepo.update(stableId, { status: 'active' });

    return success({
      message: 'Stable reactivated',
      stableId,
      status: 'active',
      restoredMemberIds,
      skippedMembers,
    });
  } catch (err) {
    console.error('Error reactivating stable:', err);
    return serverError('Failed to reactivate stable');
  }
};
