import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { noContent, badRequest, notFound, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const roleError = requireSuperAdmin(event);
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

    // Clear stableId from all member players
    const clearPlayerPromises = stable.memberIds.map((playerId) =>
      playersRepo.update(playerId, { stableId: null })
    );

    // Delete all invitations for this stable
    const deleteInvitationsPromise = stablesRepo.deleteInvitationsByStable(stableId);

    // Execute all cleanup in parallel
    await Promise.all([...clearPlayerPromises, deleteInvitationsPromise]);

    // Hard delete the stable record
    await stablesRepo.delete(stableId);

    return noContent();
  } catch (err) {
    console.error('Error deleting stable:', err);
    return serverError('Failed to delete stable');
  }
};
