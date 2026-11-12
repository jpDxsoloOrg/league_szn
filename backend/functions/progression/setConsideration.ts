import type { APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories, isConcurrentWriteError } from '../../lib/repositories';
import type {
  Player,
  PlayerProgression,
  ProgressionConsideration,
  ProgressionConsiderationSeed,
  ProgressionEvent,
  ProgressionEventType,
  ProgressionKind,
  ProgressionTrack,
} from '../../lib/repositories';
import { badRequest, conflict, notFound, serverError, success } from '../../lib/response';
import { getAuthContext } from '../../lib/auth';
import { parseBody } from '../../lib/parseBody';
import { createNotification } from '../../lib/notifications';
import { computeProgress } from '../../lib/policies/progression';
import { loadProgressionBatch, resolveProgressionWindow } from '../../lib/progression/loadInputs';

export const MAX_CONSIDERATION_NOTE_LENGTH = 500;

/**
 * The wrestler hears about an add only. Removing a mark sends nothing, and a
 * relegation mark sends nothing either: both would be demoralising pings.
 */
const ADD_MESSAGES: Partial<Record<ProgressionKind, string>> = {
  callup: 'The GMs are considering you for a call-up!',
  promotion: 'The GMs are considering you for a promotion!',
};

interface SetConsiderationBody {
  trackId?: unknown;
  considering?: unknown;
  note?: unknown;
}

export interface SetConsiderationResponse {
  playerId: string;
  trackId: string;
  considering: boolean;
  /** False when the request matched the stored state (idempotent re-mark or re-unmark). */
  changed: boolean;
  consideration: ProgressionConsideration | null;
}

function respond(
  playerId: string,
  trackId: string,
  consideration: ProgressionConsideration | null | undefined,
  changed: boolean,
) {
  const body: SetConsiderationResponse = {
    playerId,
    trackId,
    considering: !!consideration,
    changed,
    consideration: consideration ?? null,
  };
  return success(body);
}

/**
 * The computed fields for a player with no PlayerProgression row on `track`
 * yet (a GM can flag someone before any recompute has run). Scored with the
 * same policy and inputs as the recompute, so the row is accurate from the
 * start; the next recompute overwrites it as usual.
 */
async function computeSeed(track: ProgressionTrack, playerId: string, now: string): Promise<ProgressionConsiderationSeed> {
  const batch = await loadProgressionBatch([playerId]);
  const inputs = batch.inputs.get(playerId) ?? { playerId, matches: [], promos: [], challenges: [] };
  const window = resolveProgressionWindow(track.windowMode, batch.players.get(playerId), batch.activeSeason);
  const { progressPct, goals } = computeProgress(track, inputs, window);
  return { progressPct, goals, computedAt: now };
}

function buildEvent(
  track: ProgressionTrack,
  playerId: string,
  type: ProgressionEventType,
  actorUserId: string,
  now: string,
): ProgressionEvent {
  const event: ProgressionEvent = {
    eventId: uuidv4(),
    playerId,
    trackId: track.trackId,
    kind: track.kind,
    type,
    fromDivisionId: track.fromDivisionId,
    actorUserId,
    createdAt: now,
  };
  if (track.toDivisionId) event.toDivisionId = track.toDivisionId;
  return event;
}

async function notifyAdded(track: ProgressionTrack, player: Player): Promise<void> {
  const message = ADD_MESSAGES[track.kind];
  if (!message || !player.userId) return;
  await createNotification({
    userId: player.userId,
    type: 'progression_consideration',
    message,
    sourceId: player.playerId,
    sourceType: 'progression',
  });
}

/**
 * PUT /progression/players/{playerId}/consideration (Admin, Moderator)
 * Body: { trackId: string, considering: boolean, note?: string }
 *
 * Marks or unmarks a player as being considered on a track. The row write and
 * its ProgressionEvent commit in one transaction. Asking for the state that
 * is already stored is a no-op (`changed: false`): no event, no notification.
 * The transaction is guarded, so two racing marks also produce one event.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const playerId = event.pathParameters?.playerId;
  if (!playerId) return badRequest('playerId path parameter is required');

  const parsed = parseBody<SetConsiderationBody>(event);
  if (parsed.error) return parsed.error;
  const { trackId, considering, note } = parsed.data;
  if (typeof trackId !== 'string' || !trackId.trim()) return badRequest('trackId is required');
  if (typeof considering !== 'boolean') return badRequest('considering must be a boolean');
  if (note !== undefined && note !== null && typeof note !== 'string') return badRequest('note must be a string');
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  if (trimmedNote.length > MAX_CONSIDERATION_NOTE_LENGTH) {
    return badRequest(`note must be at most ${MAX_CONSIDERATION_NOTE_LENGTH} characters`);
  }

  try {
    const repos = getRepositories();
    const [track, player, existing] = await Promise.all([
      repos.progression.getTrack(trackId),
      repos.roster.players.findById(playerId),
      repos.progression.getPlayerProgression(playerId, trackId),
    ]);
    if (!track) return notFound('Progression track not found');
    if (!player) return notFound('Player not found');

    const { sub, username } = getAuthContext(event);
    const actorUserId = sub || username;
    const now = new Date().toISOString();

    if (!considering) {
      if (!existing?.consideration) return respond(playerId, trackId, null, false);
      try {
        await repos.runInTransaction(async (tx) => {
          tx.clearProgressionConsideration(playerId, trackId);
          tx.appendProgressionEvent(buildEvent(track, playerId, 'consideration_removed', actorUserId, now));
        });
      } catch (err) {
        return await resolveRace(err, playerId, trackId, false);
      }
      return respond(playerId, trackId, null, true);
    }

    if (existing?.consideration) return respond(playerId, trackId, existing.consideration, false);
    if (!track.isActive) return badRequest('Progression track is not active');
    if (player.divisionId !== track.fromDivisionId) {
      return badRequest("Player is not in this track's division");
    }

    const consideration: ProgressionConsideration = { status: 'considering', markedBy: actorUserId, markedAt: now };
    if (trimmedNote) consideration.note = trimmedNote;
    const seed = existing ? undefined : await computeSeed(track, playerId, now);

    try {
      await repos.runInTransaction(async (tx) => {
        tx.setProgressionConsideration(playerId, trackId, consideration, seed);
        tx.appendProgressionEvent(buildEvent(track, playerId, 'consideration_added', actorUserId, now));
      });
    } catch (err) {
      return await resolveRace(err, playerId, trackId, true);
    }

    await notifyAdded(track, player);
    return respond(playerId, trackId, consideration, true);
  } catch (err) {
    console.error('Error setting progression consideration:', err);
    return serverError('Failed to update consideration');
  }
};

/**
 * A guarded write lost to another request. If that request left the row in
 * the state we asked for, this one is an idempotent no-op; otherwise report
 * the conflict so the caller can retry.
 */
async function resolveRace(err: unknown, playerId: string, trackId: string, considering: boolean) {
  if (!isConcurrentWriteError(err)) throw err;
  const current: PlayerProgression | null = await getRepositories().progression.getPlayerProgression(playerId, trackId);
  if (!!current?.consideration === considering) {
    return respond(playerId, trackId, current?.consideration, false);
  }
  return conflict('Consideration was changed by another request; try again');
}
