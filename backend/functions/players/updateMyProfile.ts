import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { NotFoundError } from '../../lib/repositories/errors';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';
import type { PlayerPatch } from '../../lib/repositories';

const ALLOWED_FIELDS = ['name', 'currentWrestler', 'alternateWrestler', 'imageUrl', 'psnId', 'alignment'];
const MAX_NAME_LENGTH = 100;
const MAX_URL_LENGTH = 2048;

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Wrestler');
  if (denied) return denied;

  try {
    const { sub } = getAuthContext(event);

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    // Look up the player by userId
    const player = await getRepositories().players.findByUserId(sub);

    if (!player) {
      return notFound('No player profile found for this user');
    }

    const playerId = player.playerId;

    // Build patch from whitelisted fields only
    const patch: PlayerPatch = {};
    let hasChanges = false;

    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        const value = body[field];

        if (typeof value !== 'string') {
          return badRequest(`Field ${field} must be a string`);
        }

        if (field === 'alternateWrestler' && value === '') {
          patch.alternateWrestler = undefined;
          hasChanges = true;
          continue;
        }

        if (field === 'alignment') {
          if (value === '') {
            patch.alignment = undefined;
            hasChanges = true;
            continue;
          }
          if (!['face', 'heel', 'neutral'].includes(value)) {
            return badRequest('Invalid alignment. Must be face, heel, or neutral');
          }
        }

        if ((field === 'name' || field === 'currentWrestler' || field === 'alternateWrestler') && value.length > MAX_NAME_LENGTH) {
          return badRequest(`Field ${field} must be ${MAX_NAME_LENGTH} characters or less`);
        }

        if (field === 'name' && value.trim().length === 0) {
          return badRequest('Name cannot be empty');
        }

        if (field === 'psnId' && value.length > MAX_NAME_LENGTH) {
          return badRequest(`PSN ID must be ${MAX_NAME_LENGTH} characters or less`);
        }

        if (field === 'imageUrl' && value.length > MAX_URL_LENGTH) {
          return badRequest(`Image URL must be ${MAX_URL_LENGTH} characters or less`);
        }

        // Set the field on the patch
        (patch as Record<string, unknown>)[field] = value;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return badRequest('No valid fields to update. Allowed fields: ' + ALLOWED_FIELDS.join(', '));
    }

    const updated = await getRepositories().players.update(playerId, patch);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(err.message);
    console.error('Error updating player profile:', err);
    return serverError('Failed to update player profile');
  }
};
