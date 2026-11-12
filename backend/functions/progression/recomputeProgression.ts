import type { APIGatewayProxyHandler } from 'aws-lambda';
import { badRequest, serverError, success } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { recomputeProgression } from '../../lib/progression/recompute';

interface RecomputeBody {
  playerIds?: unknown;
}

/**
 * POST /admin/progression/recompute (Moderator+)
 *
 * Body (optional): `{ playerIds?: string[] }`. With no `playerIds` every
 * player is recomputed in this one invocation (no fan-out).
 * Response: `{ playersProcessed, rowsUpdated, rowsDropped, failures }`.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    let playerIds: string[] | undefined;
    if (event.body) {
      const { data, error } = parseBody<RecomputeBody>(event);
      if (error) return error;
      if (data.playerIds !== undefined) {
        const ids: unknown = data.playerIds;
        if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string' && id.length > 0)) {
          return badRequest('playerIds must be an array of non-empty strings');
        }
        if (ids.length === 0) {
          return badRequest('playerIds must not be empty; omit it to recompute every player');
        }
        playerIds = ids;
      }
    }

    const result = await recomputeProgression(playerIds ? { playerIds } : { all: true });
    if (result.failures.length > 0) {
      console.warn('Progression recompute failures:', JSON.stringify(result.failures));
    }
    return success({
      playersProcessed: result.playersProcessed,
      rowsUpdated: result.changes.length,
      rowsDropped: result.dropped.length,
      failures: result.failures,
    });
  } catch (err) {
    console.error('Error recomputing progression:', err);
    return serverError('Failed to recompute progression');
  }
};
