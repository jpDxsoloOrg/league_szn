import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, conflict, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { getAuthContext, requireRole } from '../../lib/auth';
import { isPlayerActive } from '../../lib/activeStatus';

interface SetActiveStatusBody {
  /** `true` force active, `false` force inactive, `null` revert to derived. */
  value: boolean | null;
}

/**
 * Admin override for a wrestler's active status.
 *
 * The override is stamped with the current season so it expires at rollover
 * (see lib/activeStatus.ts) — which is also why there is nothing to set when
 * no season is active.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody<SetActiveStatusBody>(event);
    if (parseError) return parseError;

    if (body.value !== null && typeof body.value !== 'boolean') {
      return badRequest('value must be true, false, or null');
    }

    const { roster: { players }, season: { seasons } } = getRepositories();

    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    const activeSeason = await seasons.findActive();
    if (!activeSeason) {
      return conflict('There is no active season — active status cannot be overridden');
    }

    const updated = await players.update(playerId, {
      activeOverride:
        body.value === null
          ? null
          : {
              seasonId: activeSeason.seasonId,
              value: body.value,
              setBy: getAuthContext(event).username,
              setAt: new Date().toISOString(),
            },
    });

    return success({
      playerId,
      isActive: isPlayerActive(updated, activeSeason.seasonId),
      activeOverride: updated.activeOverride ?? null,
    });
  } catch (err) {
    console.error('Error setting active status:', err);
    return serverError('Failed to set active status');
  }
};
