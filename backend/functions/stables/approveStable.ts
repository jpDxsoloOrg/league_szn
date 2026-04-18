import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireRole(event, 'Moderator');
    if (roleError) return roleError;

    const stableId = event.pathParameters?.stableId;
    if (!stableId) {
      return badRequest('stableId is required');
    }

    const { stables: stablesRepo, players: playersRepo } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    if (stable.status !== 'pending') {
      return badRequest(`Stable is already ${stable.status}, cannot approve`);
    }

    // Update stable status to approved
    await stablesRepo.update(stableId, { status: 'approved' });

    // Set the leader's stableId on their player record
    await playersRepo.update(stable.leaderId, { stableId });

    return success({ message: 'Stable approved', stableId, status: 'approved' });
  } catch (err) {
    console.error('Error approving stable:', err);
    return serverError('Failed to approve stable');
  }
};
