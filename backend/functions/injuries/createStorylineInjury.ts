import { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { activeInjury } from '../../lib/injuries';
import { parseBody } from '../../lib/parseBody';
import { getRepositories } from '../../lib/repositories';
import { ConcurrencyError } from '../../lib/repositories/errors';
import { isInjurySeverity, toCurrentInjury, type Injury } from '../../lib/repositories/injuries';
import { badRequest, conflict, created, notFound, serverError } from '../../lib/response';
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
} from './shared';

interface StorylineInjuryBody {
  weeks?: unknown;
  severity?: unknown;
  note?: unknown;
}

/**
 * POST /players/{playerId}/injuries (Moderator + Admin). Puts a storyline
 * injury on the player (`source: 'storyline'`), starting now, with the
 * return date on the league week boundary `weeks` weeks out.
 *
 * 409 when the player is already injured (extend that one instead). An old
 * injury whose return date has passed but that the weekly recovery has not
 * closed yet is ended as `recovered` at its return date in the same write.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const playerId = event.pathParameters?.playerId;
    if (!playerId) return badRequest('Player ID is required');

    const { data: body, error: parseError } = parseBody<StorylineInjuryBody>(event);
    if (parseError) return parseError;
    if (!isValidWeeks(body.weeks)) return badRequest(`weeks must be a whole number from 1 to ${INJURY_MAX_WEEKS}`);
    if (!isInjurySeverity(body.severity)) return badRequest('severity must be minor, moderate or major');
    const { note, error: noteError } = parseNote(body.note);
    if (noteError) return badRequest(noteError);
    const { weeks, severity } = body;

    const disabled = await requireInjuriesEnabled();
    if (disabled) return disabled;

    const { injuries, roster: { players }, runInTransaction } = getRepositories();
    const player = await players.findById(playerId);
    if (!player || player.deletedAt) return notFound('Player not found');

    const now = new Date().toISOString();
    if (activeInjury(player, now)) return conflict('This player is already injured; extend the current injury instead');
    const stale = player.currentInjury;

    const injury: Injury = {
      playerId,
      startedAt: now,
      injuryId: uuidv4(),
      source: 'storyline',
      severity,
      weeks,
      returnsAt: injuryReturnDate(now, weeks),
      createdBy: callerId(event),
      changes: [],
      ...(note && { note }),
    };

    try {
      await runInTransaction(async (tx) => {
        if (stale) {
          tx.updateInjury(playerId, stale.startedAt, { endedAt: stale.returnsAt, endedReason: 'recovered' });
        }
        tx.putInjury(injury);
        tx.updatePlayerCondition(
          playerId,
          { currentInjury: toCurrentInjury(injury) },
          { currentInjuryId: stale?.injuryId ?? null },
        );
      });
    } catch (err) {
      if (err instanceof ConcurrencyError) return conflict(SAVE_CONFLICT_MESSAGE);
      throw err;
    }

    await notifyPlayer(
      player,
      'injury_added',
      `You have been listed as injured. Expected return: ${formatLeagueDate(injury.returnsAt)}.`,
    );

    return created(await injuries.get(playerId, injury.startedAt));
  } catch (err) {
    console.error('Error creating storyline injury:', err);
    return serverError('Failed to create injury');
  }
};
