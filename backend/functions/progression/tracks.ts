import type { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getRepositories } from '../../lib/repositories';
import type { ProgressionTrackFilter } from '../../lib/repositories';
import type { ProgressionKind, ProgressionTrack } from '../../lib/repositories/types';
import { invokeAsync } from '../../lib/asyncLambda';
import { parseBody } from '../../lib/parseBody';
import { badRequest, conflict, created, notFound, serverError, success } from '../../lib/response';
import { parseTrackInput, type TrackFields } from './trackInput';

const TRACK_KINDS: readonly ProgressionKind[] = ['callup', 'promotion', 'relegation'];

/**
 * Ask the progression Lambda to recompute every live player in the given
 * divisions. One async invoke carries all ids (never one per player: the
 * account's Lambda concurrency is shared). Failures are logged, not thrown:
 * the track is already saved and the next recompute trigger catches up.
 * Returns how many players were queued.
 */
export async function queueDivisionRecompute(divisionIds: readonly string[]): Promise<number> {
  try {
    const wanted = new Set(divisionIds);
    const players = await getRepositories().roster.players.list();
    const playerIds = players
      .filter((player) => player.divisionId !== undefined && wanted.has(player.divisionId))
      .map((player) => player.playerId);
    if (playerIds.length === 0) return 0;
    await invokeAsync('progression', { playerIds });
    return playerIds.length;
  } catch (err) {
    console.warn('Failed to queue progression recompute:', err);
    return 0;
  }
}

/**
 * Check the parts of a track that need the database: both divisions exist
 * and no other active track shares its (kind, fromDivisionId).
 * Returns an error response, or null when the track can be saved.
 */
async function checkTrackRefs(fields: TrackFields, trackId: string) {
  const { leagueOps: { divisions }, progression } = getRepositories();

  if (!(await divisions.findById(fields.fromDivisionId))) {
    return badRequest('fromDivisionId does not match a division');
  }
  if (fields.toDivisionId !== undefined && !(await divisions.findById(fields.toDivisionId))) {
    return badRequest('toDivisionId does not match a division');
  }
  if (fields.isActive) {
    const active = await progression.listTracks({
      kind: fields.kind,
      fromDivisionId: fields.fromDivisionId,
      isActive: true,
    });
    const clash = active.find((track) => track.trackId !== trackId);
    if (clash) {
      return conflict(
        `Track "${clash.name}" is already the active ${fields.kind} track for this division; deactivate it first`,
      );
    }
  }
  return null;
}

function parseFilter(event: APIGatewayProxyEvent): { filter: ProgressionTrackFilter; error?: string } {
  const query = event.queryStringParameters ?? {};
  const filter: ProgressionTrackFilter = {};
  if (query.kind !== undefined) {
    const kind = TRACK_KINDS.find((candidate) => candidate === query.kind);
    if (!kind) return { filter, error: `kind must be one of: ${TRACK_KINDS.join(', ')}` };
    filter.kind = kind;
  }
  if (query.isActive !== undefined) {
    if (query.isActive !== 'true' && query.isActive !== 'false') {
      return { filter, error: 'isActive must be true or false' };
    }
    filter.isActive = query.isActive === 'true';
  }
  if (query.fromDivisionId) filter.fromDivisionId = query.fromDivisionId;
  return { filter };
}

/** GET /progression/tracks (public). Optional ?kind=, ?isActive=, ?fromDivisionId=. */
export const listTracks: APIGatewayProxyHandler = async (event) => {
  try {
    const { filter, error } = parseFilter(event);
    if (error) return badRequest(error);
    const tracks = await getRepositories().progression.listTracks(filter);
    return success(tracks);
  } catch (err) {
    console.error('Error listing progression tracks:', err);
    return serverError('Failed to list progression tracks');
  }
};

/** POST /progression/tracks (Moderator+). */
export const createTrack: APIGatewayProxyHandler = async (event) => {
  try {
    const { data, error } = parseBody<unknown>(event);
    if (error) return error;
    const parsed = parseTrackInput(data);
    if (parsed.error !== undefined) return badRequest(parsed.error);

    const trackId = uuidv4();
    const refError = await checkTrackRefs(parsed.value, trackId);
    if (refError) return refError;

    const now = new Date().toISOString();
    const track: ProgressionTrack = { ...parsed.value, trackId, createdAt: now, updatedAt: now };
    const saved = await getRepositories().progression.putTrack(track);
    await queueDivisionRecompute([saved.fromDivisionId]);
    return created(saved);
  } catch (err) {
    console.error('Error creating progression track:', err);
    return serverError('Failed to create progression track');
  }
};

/**
 * PUT /progression/tracks/{trackId} (Moderator+). Partial update: omitted
 * fields keep their value; `goals` replaces the list; `toDivisionId: null`
 * clears it. Players in the old and new source divisions are recomputed.
 */
export const updateTrack: APIGatewayProxyHandler = async (event) => {
  try {
    const trackId = event.pathParameters?.trackId;
    if (!trackId) return badRequest('trackId is required');

    const { data, error } = parseBody<unknown>(event);
    if (error) return error;

    const { progression } = getRepositories();
    const existing = await progression.getTrack(trackId);
    if (!existing) return notFound('Progression track not found');

    const parsed = parseTrackInput(data, existing);
    if (parsed.error !== undefined) return badRequest(parsed.error);

    const refError = await checkTrackRefs(parsed.value, trackId);
    if (refError) return refError;

    const track: ProgressionTrack = {
      ...parsed.value,
      trackId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const saved = await progression.putTrack(track);
    await queueDivisionRecompute(
      Array.from(new Set([existing.fromDivisionId, saved.fromDivisionId])),
    );
    return success(saved);
  } catch (err) {
    console.error('Error updating progression track:', err);
    return serverError('Failed to update progression track');
  }
};
