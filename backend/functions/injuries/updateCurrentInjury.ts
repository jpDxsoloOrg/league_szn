import { APIGatewayProxyHandler } from 'aws-lambda';
import { activeInjury } from '../../lib/injuries';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError } from '../../lib/repositories/errors';
import type { InjuryChange } from '../../lib/repositories/injuries';
import { badRequest, conflict, notFound, serverError, success } from '../../lib/response';
import {
  callerId,
  formatLeagueDate,
  injuryReturnDate,
  INJURY_MAX_WEEKS,
  isValidWeeks,
  notifyPlayer,
  parseNote,
  requireInjuriesEnabled,
  SAVE_CONFLICT_MESSAGE,
  weeksBetween,
} from './shared';

interface UpdateInjuryBody {
  returnsAt?: unknown;
  weeks?: unknown;
  note?: unknown;
}

/**
 * PATCH /players/{playerId}/injuries/current (Moderator + Admin). Extends or
 * shortens the current injury. Send exactly one of:
 * - `weeks`: the new total length, counted from when the injury started; the
 *   return date snaps to the league week boundary like a rolled injury.
 * - `returnsAt`: an exact ISO date-time; `weeks` is recomputed from it.
 * The new return date must be in the future (ending it now is the heal
 * route). Appends an `extended` or `shortened` change to the row.
 * 409 when the player is not injured.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody<UpdateInjuryBody>(event);
    if (parseError) return parseError;
    const { note, error: noteError } = parseNote(body.note);
    if (noteError) return badRequest(noteError);

    const hasWeeks = body.weeks !== undefined;
    const hasReturnsAt = body.returnsAt !== undefined;
    if (hasWeeks === hasReturnsAt) return badRequest('Send either weeks or returnsAt');
    if (hasWeeks && !isValidWeeks(body.weeks)) {
      return badRequest(`weeks must be a whole number from 1 to ${INJURY_MAX_WEEKS}`);
    }
    if (hasReturnsAt && (typeof body.returnsAt !== 'string' || Number.isNaN(Date.parse(body.returnsAt)))) {
      return badRequest('returnsAt must be an ISO date-time');
    }

    const disabled = await requireInjuriesEnabled();
    if (disabled) return disabled;

    const { injuries, roster: { players }, runInTransaction } = getRepositories();
    const player = await players.findById(playerId);
    if (!player) return notFound('Player not found');

    const now = new Date().toISOString();
    const current = activeInjury(player, now);
    if (!current) return conflict('This player is not injured');

    let returnsAt: string;
    let weeks: number;
    if (typeof body.weeks === 'number') {
      weeks = body.weeks;
      returnsAt = injuryReturnDate(current.startedAt, weeks);
    } else {
      returnsAt = new Date(body.returnsAt as string).toISOString();
      weeks = weeksBetween(current.startedAt, returnsAt);
      if (weeks > INJURY_MAX_WEEKS) return badRequest(`An injury can last at most ${INJURY_MAX_WEEKS} weeks`);
    }
    if (Date.parse(returnsAt) <= Date.parse(now)) {
      return badRequest('The new return date has already passed; heal the injury instead');
    }
    if (returnsAt === current.returnsAt && weeks === current.weeks) {
      return badRequest('The injury already ends then');
    }

    const extended = Date.parse(returnsAt) >= Date.parse(current.returnsAt);
    const change: InjuryChange = {
      kind: extended ? 'extended' : 'shortened',
      at: now,
      by: callerId(event),
      returnsAtBefore: current.returnsAt,
      returnsAtAfter: returnsAt,
      weeksBefore: current.weeks,
      weeksAfter: weeks,
      ...(note && { note }),
    };

    try {
      await runInTransaction(async (tx) => {
        tx.updateInjury(playerId, current.startedAt, { returnsAt, weeks, appendChanges: [change] });
        tx.updatePlayerCondition(
          playerId,
          { currentInjury: { ...current, returnsAt, weeks } },
          { currentInjuryId: current.injuryId },
        );
      });
    } catch (err) {
      if (err instanceof ConcurrencyError) return conflict(SAVE_CONFLICT_MESSAGE);
      throw err;
    }

    await notifyPlayer(
      player,
      'injury_updated',
      `Your injury return date has been updated to ${formatLeagueDate(returnsAt)}.`,
    );
    // INJ-07: an extension also notifies staff; call its notifier here once it lands.

    return success(await injuries.get(playerId, current.startedAt));
  } catch (err) {
    console.error('Error updating injury:', err);
    return serverError('Failed to update injury');
  }
};
