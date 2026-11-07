import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAuthContext, requireRole } from '../../lib/auth';
import { computeDiscipline, isDeactivated, validateReason } from '../../lib/discipline';
import {
  disciplineConflict,
  emptyHoldings,
  isValidVersion,
  notifyDiscipline,
  resolveActorName,
  type DisciplineActionResult,
} from '../../lib/disciplineActions';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError } from '../../lib/repositories/errors';
import type { Player } from '../../lib/repositories/types';
import { badRequest, notFound, refused, serverError, success } from '../../lib/response';

interface RemoveStrikeBody {
  reason?: unknown;
  expectedVersion?: unknown;
}

/** POST /players/{playerId}/strikes/{strikeId}/remove. The strike stays in history, stamped as cleared. */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    const strikeId = event.pathParameters?.strikeId;
    if (!playerId || !strikeId) return badRequest('Player ID and strike ID are required');

    const { roster: { players } } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');
    const strikes = player.strikes ?? [];
    if (!strikes.some((strike) => strike.strikeId === strikeId)) return notFound('Strike not found');
    if (isDeactivated(player)) return refused(409, 'PLAYER_DEACTIVATED', 'Reactivate this player instead');

    const { data: body, error: parseError } = parseBody<RemoveStrikeBody>(event);
    if (parseError) return parseError;
    const validated = validateReason(body.reason);
    if ('error' in validated) return badRequest(validated.error);
    if (!isValidVersion(body.expectedVersion)) return badRequest('expectedVersion is required');

    const now = new Date();
    const version = player.disciplineVersion ?? 0;
    if (body.expectedVersion !== version) return disciplineConflict();
    if (!computeDiscipline(player, now).activeStrikes.some((strike) => strike.strikeId === strikeId)) {
      return refused(409, 'STRIKE_NOT_ACTIVE', 'This strike no longer has any effect on the account');
    }

    const auth = getAuthContext(event);
    const clearedByName = await resolveActorName(auth);
    let updated: Player;
    try {
      updated = await players.updateDiscipline(playerId, {
        strikes: strikes.map((strike) => (strike.strikeId === strikeId
          ? {
            ...strike,
            clearedAt: now.toISOString(),
            clearedBy: auth.sub,
            clearedByName,
            clearedReason: validated.reason,
            clearedKind: 'removed' as const,
          }
          : strike)),
        deactivations: player.deactivations ?? [],
        deactivatedAt: null,
      }, version);
    } catch (err) {
      if (err instanceof ConcurrencyError) return disciplineConflict();
      throw err;
    }

    await notifyDiscipline(player.userId, 'strike_removed', 'A strike was removed from your account.', strikeId);

    const result: DisciplineActionResult = {
      playerId,
      version: updated.disciplineVersion ?? 0,
      summary: computeDiscipline(updated, now),
      accountSync: 'not-needed',
      softHoldsCleared: true,
      holdings: emptyHoldings(),
    };
    return success(result);
  } catch (err) {
    console.error('Error removing strike:', err);
    return serverError('Failed to remove strike');
  }
};
