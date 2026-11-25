import { APIGatewayProxyHandler } from 'aws-lambda';
import { activeInjury } from '../../lib/injuries';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError } from '../../lib/repositories/errors';
import type { Injury, InjuryChange } from '../../lib/repositories/injuries';
import { badRequest, conflict, notFound, serverError, success } from '../../lib/response';
import { callerId, notifyPlayer, parseNote, requireInjuriesEnabled, SAVE_CONFLICT_MESSAGE } from './shared';

interface HealBody {
  note?: unknown;
}

/**
 * POST /players/{playerId}/injuries/heal (Moderator + Admin). Ends the
 * player's current injury now with `endedReason: 'healedByGm'`, logs a
 * `healed` change on the row and clears `Player.currentInjury`.
 * 409 when the player is not injured.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    // The note is optional, so an empty body is fine.
    let body: HealBody = {};
    if (event.body) {
      const parsed = parseBody<HealBody>(event);
      if (parsed.error) return parsed.error;
      body = parsed.data;
    }
    const { note, error: noteError } = parseNote(body.note);
    if (noteError) return badRequest(noteError);

    const disabled = await requireInjuriesEnabled();
    if (disabled) return disabled;

    const { injuries, roster: { players }, runInTransaction } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    const now = new Date().toISOString();
    const current = activeInjury(player, now);
    if (!current) return conflict('This player is not injured');

    const change: InjuryChange = {
      kind: 'healed',
      at: now,
      by: callerId(event),
      returnsAtBefore: current.returnsAt,
      returnsAtAfter: now,
      ...(note && { note }),
    };

    try {
      await runInTransaction(async (tx) => {
        tx.updateInjury(playerId, current.startedAt, {
          endedAt: now,
          endedReason: 'healedByGm',
          appendChanges: [change],
        });
        tx.updatePlayerCondition(playerId, { currentInjury: null }, { currentInjuryId: current.injuryId });
      });
    } catch (err) {
      if (err instanceof ConcurrencyError) return conflict(SAVE_CONFLICT_MESSAGE);
      throw err;
    }

    await notifyPlayer(player, 'injury_healed', 'You have been cleared to return from injury.');

    const healed: Injury | null = await injuries.get(playerId, current.startedAt);
    return success(healed);
  } catch (err) {
    console.error('Error healing injury:', err);
    return serverError('Failed to heal injury');
  }
};
