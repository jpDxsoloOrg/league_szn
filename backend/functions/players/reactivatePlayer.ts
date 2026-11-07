import { APIGatewayProxyHandler } from 'aws-lambda';
import { getAuthContext, requireRole } from '../../lib/auth';
import { computeDiscipline, isDeactivated, validateReason } from '../../lib/discipline';
import {
  disciplineConflict,
  emptyHoldings,
  enableAccount,
  isValidVersion,
  notifyDiscipline,
  resolveActorName,
  type AccountSync,
  type DisciplineActionResult,
} from '../../lib/disciplineActions';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError } from '../../lib/repositories/errors';
import type { Player, PlayerDeactivation } from '../../lib/repositories/types';
import { badRequest, notFound, refused, serverError, success } from '../../lib/response';

interface ReactivateBody {
  reason?: unknown;
  expectedVersion?: unknown;
  restorePriorStrikes?: unknown;
}

const findOpenDeactivation = (deactivations: PlayerDeactivation[]): PlayerDeactivation | undefined =>
  [...deactivations].reverse().find((deactivation) => !deactivation.reactivatedAt);

/** POST /players/{playerId}/reactivate. Strikes that lapsed before deactivation stay as they are. */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin');
  if (denied) return denied;

  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { roster: { players } } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');
    if (!isDeactivated(player)) return refused(409, 'NOT_DEACTIVATED', 'This player is not deactivated');

    const { data: body, error: parseError } = parseBody<ReactivateBody>(event);
    if (parseError) return parseError;
    const validated = validateReason(body.reason);
    if ('error' in validated) return badRequest(validated.error);
    if (!isValidVersion(body.expectedVersion)) return badRequest('expectedVersion is required');
    if (body.restorePriorStrikes !== undefined && typeof body.restorePriorStrikes !== 'boolean') {
      return badRequest('restorePriorStrikes must be a boolean');
    }

    const version = player.disciplineVersion ?? 0;
    if (body.expectedVersion !== version) return disciplineConflict();

    const now = new Date();
    const nowIso = now.toISOString();
    const auth = getAuthContext(event);
    const actorName = await resolveActorName(auth);
    const deactivations = player.deactivations ?? [];
    const open = findOpenDeactivation(deactivations);

    const idsToClear = new Set(
      body.restorePriorStrikes && open
        ? [open.strikeId]
        : computeDiscipline(player, now).activeStrikes.map((strike) => strike.strikeId),
    );

    let updated: Player;
    try {
      updated = await players.updateDiscipline(playerId, {
        strikes: (player.strikes ?? []).map((strike) => (idsToClear.has(strike.strikeId)
          ? {
            ...strike,
            clearedAt: nowIso,
            clearedBy: auth.sub,
            clearedByName: actorName,
            clearedReason: validated.reason,
            clearedKind: 'reactivated' as const,
          }
          : strike)),
        deactivations: deactivations.map((deactivation) => (deactivation === open
          ? {
            ...deactivation,
            reactivatedAt: nowIso,
            reactivatedBy: auth.sub,
            reactivatedByName: actorName,
            reactivationReason: validated.reason,
          }
          : deactivation)),
        deactivatedAt: null,
      }, version);
    } catch (err) {
      if (err instanceof ConcurrencyError) return disciplineConflict();
      throw err;
    }

    let accountSync: AccountSync = 'not-linked';
    if (player.userId) {
      accountSync = open?.cognitoAlreadyDisabled ? 'not-needed' : await enableAccount(player.userId);
    }
    await notifyDiscipline(player.userId, 'account_reactivated', 'Your account has been reactivated.', playerId);

    const result: DisciplineActionResult = {
      playerId,
      version: updated.disciplineVersion ?? 0,
      summary: computeDiscipline(updated, now),
      accountSync,
      softHoldsCleared: true,
      holdings: emptyHoldings(),
    };
    return success(result);
  } catch (err) {
    console.error('Error reactivating player:', err);
    return serverError('Failed to reactivate player');
  }
};
