import type { APIGatewayProxyHandler } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { getRepositories, isConcurrentWriteError } from '../../lib/repositories';
import type { Player, ProgressionEvent, ProgressionTrack } from '../../lib/repositories';
import { badRequest, conflict, notFound, serverError, success } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';
import { triggerProgressionRecompute } from '../../lib/progression/trigger';

export const MAX_RESET_NOTE_LENGTH = 500;
export const GOALS_RESET_MESSAGE = 'Your goals have been reset by the GM';

interface ResetGoalsBody {
  note?: unknown;
}

export interface ResetGoalsResponse {
  playerId: string;
  progressionEpochAt: string;
  /** Tracks whose PlayerProgression row was deleted. */
  deletedTrackIds: string[];
  /** The `goals_reset` events, one per track out of the player's division. */
  events: ProgressionEvent[];
}

async function notifyReset(player: Player): Promise<void> {
  if (!player.userId) return;
  try {
    await createNotification({
      userId: player.userId,
      type: 'progression_goals_reset',
      message: GOALS_RESET_MESSAGE,
      sourceId: player.playerId,
      sourceType: 'progression',
    });
  } catch (err) {
    console.warn('Failed to notify player of goals reset:', err);
  }
}

/**
 * POST /progression/players/{playerId}/reset-goals (Admin, Moderator)
 * Body: { note?: string }
 *
 * Restarts a player's promotion, relegation and call-up goals without moving
 * them (PRL-05). One transaction sets `progressionEpochAt` to now, deletes
 * every PlayerProgression row for the player (logging `consideration_removed`
 * for any row that carried a consideration) and appends a `goals_reset` event.
 *
 * Only `progressionEpochAt` moves. `divisionJoinedAt` stays put, so division
 * standings and contender rankings are unaffected, and win/loss/draw totals
 * and season standings are never touched.
 *
 * Event shape: one `goals_reset` event per track whose source is the player's
 * current division (rather than a single sentinel `trackId: '*'`), so the
 * reset appears in the history when it is filtered by track or kind. A player
 * with no division, or whose division has no tracks, has no goals to reset:
 * that is a 400.
 *
 * After commit, best effort: recompute the player's progression and notify them.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const playerId = event.pathParameters?.playerId;
  if (!playerId) return badRequest('playerId path parameter is required');

  // The body is optional: an empty one means a reset with no note.
  let note: unknown;
  if (event.body) {
    const parsed = parseBody<ResetGoalsBody>(event);
    if (parsed.error) return parsed.error;
    note = parsed.data.note;
  }
  if (note !== undefined && note !== null && typeof note !== 'string') return badRequest('note must be a string');
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  if (trimmedNote.length > MAX_RESET_NOTE_LENGTH) {
    return badRequest(`note must be at most ${MAX_RESET_NOTE_LENGTH} characters`);
  }

  try {
    const repos = getRepositories();
    const player = await repos.roster.players.findById(playerId);
    if (!player) return notFound('Player not found');

    const divisionId = player.divisionId;
    const [rows, allTracks] = await Promise.all([
      repos.progression.listByPlayer(playerId),
      repos.progression.listTracks(),
    ]);
    const divisionTracks = divisionId ? allTracks.filter((track) => track.fromDivisionId === divisionId) : [];
    if (!divisionId || divisionTracks.length === 0) {
      return badRequest("Player has no progression tracks in their current division");
    }
    const trackById = new Map<string, ProgressionTrack>(allTracks.map((track) => [track.trackId, track]));

    const { sub, username } = getAuthContext(event);
    const actorUserId = sub || username;
    const now = new Date().toISOString();

    const resetEvents: ProgressionEvent[] = divisionTracks.map((track) => {
      const resetEvent: ProgressionEvent = {
        eventId: randomUUID(),
        playerId,
        trackId: track.trackId,
        kind: track.kind,
        type: 'goals_reset',
        fromDivisionId: divisionId,
        actorUserId,
        createdAt: now,
      };
      if (trimmedNote) resetEvent.note = trimmedNote;
      return resetEvent;
    });

    try {
      await repos.runInTransaction(async (tx) => {
        // Guard on the division: a move racing this reset would change which tracks apply.
        tx.updatePlayer(playerId, { progressionEpochAt: now }, { divisionId });
        for (const row of rows) {
          tx.deletePlayerProgression(playerId, row.trackId);
          if (!row.consideration) continue;
          const rowTrack = trackById.get(row.trackId);
          tx.appendProgressionEvent({
            eventId: randomUUID(),
            playerId,
            trackId: row.trackId,
            kind: rowTrack?.kind ?? divisionTracks[0].kind,
            type: 'consideration_removed',
            fromDivisionId: rowTrack?.fromDivisionId ?? divisionId,
            actorUserId,
            createdAt: now,
          });
        }
        for (const resetEvent of resetEvents) tx.appendProgressionEvent(resetEvent);
      });
    } catch (err) {
      if (isConcurrentWriteError(err)) {
        return conflict('The player was moved by another request; reload and try again');
      }
      throw err;
    }

    await triggerProgressionRecompute([playerId], 'goalsReset');
    await notifyReset(player);

    const body: ResetGoalsResponse = {
      playerId,
      progressionEpochAt: now,
      deletedTrackIds: rows.map((row) => row.trackId),
      events: resetEvents,
    };
    return success(body);
  } catch (err) {
    console.error('Error resetting progression goals:', err);
    return serverError('Failed to reset goals');
  }
};
