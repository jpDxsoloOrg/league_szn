import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { getAuthContext, hasRole, isSuperAdmin } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';

interface UpdateStableBody {
  name?: string;
  imageUrl?: string;
}

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

    const { data: body, error: parseError } = parseBody<UpdateStableBody>(event);
    if (parseError) return parseError;

    const { stables: stablesRepo, players: playersRepo } = getRepositories();

    const stable = await stablesRepo.findById(stableId);
    if (!stable) {
      return notFound('Stable not found');
    }

    // Only leader or Admin can update
    if (!isSuperAdmin(auth)) {
      // Find caller's player record
      const callerPlayer = await playersRepo.findByUserId(auth.sub);
      if (!callerPlayer || callerPlayer.playerId !== stable.leaderId) {
        return badRequest('Only the stable leader or an admin can update this stable');
      }
    }

    const fields: Record<string, unknown> = {};
    if (body.name !== undefined) fields.name = body.name.trim();
    if (body.imageUrl !== undefined) fields.imageUrl = body.imageUrl;

    if (Object.keys(fields).length === 0) {
      return badRequest('No fields to update');
    }

    const updated = await stablesRepo.update(stableId, fields);

    return success(updated);
  } catch (err) {
    console.error('Error updating stable:', err);
    return serverError('Failed to update stable');
  }
};
