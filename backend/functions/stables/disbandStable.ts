import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole, isSuperAdmin } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    if (!hasRole(auth, 'Wrestler')) {
      return badRequest('Insufficient permissions');
    }

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { stables: stablesRepo, players: playersRepo } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    if (stable.status === 'disbanded') {
      return badRequest('Stable is already disbanded');
    }

    // Only leader or Admin can disband
    if (!isSuperAdmin(auth)) {
      const callerPlayer = await playersRepo.findByUserId(auth.sub);
      if (!callerPlayer || callerPlayer.playerId !== stable.leaderId) {
        return badRequest('Only the stable leader or an admin can disband this stable');
      }
    }

    const now = new Date().toISOString();

    // Update stable status to disbanded
    await stablesRepo.update(stableId, {
      status: 'disbanded',
      disbandedAt: now,
    });

    // Remove stableId from ALL member Player records
    const clearPromises = stable.memberIds.map((playerId) =>
      playersRepo.update(playerId, { stableId: null })
    );

    await Promise.all(clearPromises);

    return success({ message: 'Stable disbanded', stableId, status: 'disbanded' });
  } catch (err) {
    console.error('Error disbanding stable:', err);
    return serverError('Failed to disband stable');
  }
};
