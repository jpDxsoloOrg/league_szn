import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { PlayerSuspension } from '../../lib/repositories';
import { success, badRequest, notFound, conflict, serverError } from '../../lib/response';
import { parseBody } from '../../lib/parseBody';
import { requireRole, getAuthContext } from '../../lib/auth';
import { createNotification } from '../../lib/notifications';
import { validateSuspensionInput, todayIsoDateUtc } from '../../lib/suspensions';

/**
 * POST /players/{playerId}/suspend
 * Body: { until?: YYYY-MM-DD, showsRequired?: number, reason?: string }
 * Exactly one of `until` / `showsRequired` must be provided.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody(event);
    if (parseError) return parseError;

    const { roster } = getRepositories();
    const player = await roster.players.findById(playerId);
    if (!player) return notFound('Player not found');
    if (player.suspension) return conflict('Player is already suspended');

    const validated = validateSuspensionInput(body, todayIsoDateUtc());
    if (!validated.ok) return badRequest(validated.message);

    const caller = getAuthContext(event);
    const suspendedBy = caller.email || caller.username || caller.sub || undefined;

    const suspension: PlayerSuspension = {
      suspendedAt: new Date().toISOString(),
      ...(suspendedBy ? { suspendedBy } : {}),
      ...(validated.value.reason !== undefined ? { reason: validated.value.reason } : {}),
      ...(validated.value.until !== undefined ? { until: validated.value.until } : {}),
      ...(validated.value.showsRequired !== undefined
        ? { showsRequired: validated.value.showsRequired }
        : {}),
    };

    const updated = await roster.players.update(playerId, { suspension });

    if (player.userId) {
      const ends =
        suspension.until !== undefined
          ? `until ${suspension.until}`
          : `for ${suspension.showsRequired} show${suspension.showsRequired === 1 ? '' : 's'}`;
      await createNotification({
        userId: player.userId,
        type: 'player_suspended',
        message: `You have been suspended ${ends}${suspension.reason ? `: ${suspension.reason}` : ''}`,
        sourceId: playerId,
        sourceType: 'suspension',
      });
    }

    return success(updated);
  } catch (err) {
    console.error('Error suspending player:', err);
    return serverError('Failed to suspend player');
  }
};
