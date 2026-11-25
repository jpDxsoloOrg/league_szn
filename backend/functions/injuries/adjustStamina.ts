import { APIGatewayProxyHandler } from 'aws-lambda';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError } from '../../lib/repositories/errors';
import { badRequest, conflict, notFound, serverError, success } from '../../lib/response';
import {
  callerId,
  GM_MAX_STAMINA,
  notifyPlayer,
  parseNote,
  requireInjuriesEnabled,
  SAVE_CONFLICT_MESSAGE,
} from './shared';

interface AdjustStaminaBody {
  stamina?: unknown;
  note?: unknown;
}

export interface AdjustStaminaResult {
  playerId: string;
  /** Stored stamina before the change; null when none was stored (full). */
  staminaBefore: number | null;
  stamina: number;
}

/**
 * PATCH /players/{playerId}/stamina (Moderator + Admin). Sets the player's
 * stamina to a whole number from 0 to GM_MAX_STAMINA. Guarded on the value
 * read, so a result landing at the same time returns 409 instead of being
 * overwritten.
 *
 * Stamina has no history table, so the audit entry (who, when, before,
 * after, note) goes to the log; the player is notified.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody<AdjustStaminaBody>(event);
    if (parseError) return parseError;
    const { stamina } = body;
    if (typeof stamina !== 'number' || !Number.isInteger(stamina) || stamina < 0 || stamina > GM_MAX_STAMINA) {
      return badRequest(`stamina must be a whole number from 0 to ${GM_MAX_STAMINA}`);
    }
    const { note, error: noteError } = parseNote(body.note);
    if (noteError) return badRequest(noteError);

    const disabled = await requireInjuriesEnabled();
    if (disabled) return disabled;

    const { roster: { players }, runInTransaction } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    const staminaBefore = typeof player.stamina === 'number' ? player.stamina : null;
    try {
      await runInTransaction(async (tx) => {
        tx.updatePlayerCondition(playerId, { stamina }, { stamina: staminaBefore });
      });
    } catch (err) {
      if (err instanceof ConcurrencyError) return conflict(SAVE_CONFLICT_MESSAGE);
      throw err;
    }

    console.log(JSON.stringify({
      audit: 'staminaAdjusted',
      playerId,
      by: callerId(event),
      at: new Date().toISOString(),
      staminaBefore,
      staminaAfter: stamina,
      ...(note && { note }),
    }));

    await notifyPlayer(player, 'stamina_adjusted', `Your stamina has been set to ${stamina}.`);

    const result: AdjustStaminaResult = { playerId, staminaBefore, stamina };
    return success(result);
  } catch (err) {
    console.error('Error adjusting stamina:', err);
    return serverError('Failed to adjust stamina');
  }
};
