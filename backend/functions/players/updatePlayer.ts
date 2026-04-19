import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { NotFoundError } from '../../lib/repositories/errors';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import type { PlayerPatch } from '../../lib/repositories';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;

    if (!playerId) {
      return badRequest('Player ID is required');
    }

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const player = await getRepositories().players.findById(playerId);
    if (!player) {
      return notFound('Player not found');
    }

    const patch: PlayerPatch = {};
    let hasChanges = false;

    if (body.currentWrestler !== undefined) {
      patch.currentWrestler = body.currentWrestler as string;
      hasChanges = true;
    }
    if (body.name !== undefined) {
      patch.name = body.name as string;
      hasChanges = true;
    }
    if (body.imageUrl !== undefined) {
      patch.imageUrl = body.imageUrl as string;
      hasChanges = true;
    }
    if (body.psnId !== undefined) {
      patch.psnId = body.psnId as string;
      hasChanges = true;
    }

    if (body.alignment !== undefined) {
      if (body.alignment === '' || body.alignment === null) {
        // Setting to undefined will be handled by the repo's buildUpdateExpression as REMOVE
        patch.alignment = undefined;
        hasChanges = true;
      } else if (['face', 'heel', 'neutral'].includes(body.alignment as string)) {
        patch.alignment = body.alignment as 'face' | 'heel' | 'neutral';
        hasChanges = true;
      } else {
        return badRequest('Invalid alignment. Must be face, heel, or neutral');
      }
    }

    if (body.alternateWrestler !== undefined) {
      if (body.alternateWrestler === '' || body.alternateWrestler === null) {
        patch.alternateWrestler = undefined;
        hasChanges = true;
      } else {
        patch.alternateWrestler = body.alternateWrestler as string;
        hasChanges = true;
      }
    }

    if (body.divisionId !== undefined) {
      if (body.divisionId === '' || body.divisionId === null) {
        // Remove divisionId if empty string or null
        patch.divisionId = undefined;
        hasChanges = true;
      } else {
        // Validate that the division exists
        const division = await getRepositories().divisions.findById(body.divisionId as string);
        if (!division) {
          return notFound(`Division ${body.divisionId} not found`);
        }
        patch.divisionId = body.divisionId as string;
        hasChanges = true;
      }
    }

    if (!hasChanges) {
      return badRequest('No valid fields to update');
    }

    const updated = await getRepositories().players.update(playerId, patch);
    return success(updated);
  } catch (err) {
    if (err instanceof NotFoundError) return notFound(err.message);
    console.error('Error updating player:', err);
    return serverError('Failed to update player');
  }
};
