import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, forbidden, serverError } from '../../lib/response';
import { getAuthContext, hasRole } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import type { RivalryHeat, RivalryPatch } from '../../lib/repositories';

interface UpdateBody {
  title?: string;
  description?: string;
  heat?: RivalryHeat;
  moderationNote?: string;
  status?: 'cancelled';
}

const VALID_HEAT: ReadonlyArray<RivalryHeat> = ['cold', 'warm', 'hot'];

/**
 * PUT /rivalry-requests/{rivalryId}.
 *
 * Two authorised callers:
 *  - Admin/Moderator: can patch title, description, heat, moderationNote
 *  - The original requester: can flip a pending request to 'cancelled'
 *
 * Status approve/reject/conclude transitions live on the /respond endpoint
 * so the system-message + notification side effects always fire together.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const auth = getAuthContext(event);
    const isAdmin = hasRole(auth, 'Admin');
    const isWrestler = hasRole(auth, 'Wrestler');
    if (!isAdmin && !isWrestler) {
      return forbidden('You do not have permission to update rivalries');
    }

    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const parsed = parseBody<UpdateBody>(event);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const { rivalries, roster: { players } } = getRepositories();
    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    // Wrestler self-cancel path.
    if (!isAdmin) {
      if (
        body.title !== undefined ||
        body.description !== undefined ||
        body.heat !== undefined ||
        body.moderationNote !== undefined
      ) {
        return forbidden('Only admins can edit rivalry fields');
      }
      if (body.status !== 'cancelled') {
        return badRequest('Wrestlers can only set status to "cancelled"');
      }
      if (rivalry.status !== 'pending') {
        return badRequest('Only pending rivalries can be cancelled');
      }
      const caller = await players.findByUserId(auth.sub);
      if (!caller || caller.playerId !== rivalry.requestedBy) {
        return forbidden('Only the original requester can cancel this rivalry');
      }
      const cancelled = await rivalries.update(rivalryId, { status: 'cancelled' });
      return success(cancelled);
    }

    // Admin patch path.
    if (body.status !== undefined && body.status !== 'cancelled') {
      return badRequest('Use POST /respond to approve, reject, or conclude a rivalry');
    }
    const patch: RivalryPatch = {};
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || body.title.trim().length === 0) {
        return badRequest('title must be a non-empty string');
      }
      patch.title = body.title.trim();
    }
    if (body.description !== undefined) {
      patch.description = body.description.trim() || undefined;
    }
    if (body.heat !== undefined) {
      if (!VALID_HEAT.includes(body.heat)) {
        return badRequest(`heat must be one of: ${VALID_HEAT.join(', ')}`);
      }
      patch.heat = body.heat;
    }
    if (body.moderationNote !== undefined) {
      patch.moderationNote = body.moderationNote.trim() || undefined;
    }
    if (body.status === 'cancelled') {
      // Admin force-cancel: allowed from any non-terminal state.
      if (rivalry.status === 'completed' || rivalry.status === 'rejected') {
        return badRequest(`Cannot cancel a rivalry with status '${rivalry.status}'`);
      }
      patch.status = 'cancelled';
    }
    if (Object.keys(patch).length === 0) {
      return badRequest('No updatable fields provided');
    }
    const updated = await rivalries.update(rivalryId, patch);
    return success(updated);
  } catch (err) {
    console.error('Error updating rivalry:', err);
    return serverError('Failed to update rivalry');
  }
};
