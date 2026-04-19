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

    const { stables: stablesRepo } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    if (stable.status !== 'pending') {
      return badRequest(`Stable is already ${stable.status}, cannot reject`);
    }

    const now = new Date().toISOString();

    await stablesRepo.update(stableId, {
      status: 'disbanded',
      disbandedAt: now,
    });

    return success({ message: 'Stable rejected', stableId, status: 'disbanded' });
  } catch (err) {
    console.error('Error rejecting stable:', err);
    return serverError('Failed to reject stable');
  }
};
