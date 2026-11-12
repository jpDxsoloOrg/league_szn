import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Player, ProgressionEventType, ProgressionKind } from '../../lib/repositories/types';
import { badRequest, serverError, success } from '../../lib/response';
import { isProgressionKind } from '../../lib/progression/considerations';
import { SYSTEM_ACTOR } from '../../lib/progression/recompute';

export const DEFAULT_EVENTS_LIMIT = 50;
export const MAX_EVENTS_LIMIT = 200;

export interface ProgressionEventEntry {
  eventId: string;
  type: ProgressionEventType;
  kind: ProgressionKind;
  trackId: string;
  /** null when the track has since been deleted. */
  trackName: string | null;
  playerId: string;
  /** null when the player row no longer exists. */
  playerName: string | null;
  wrestlerName: string | null;
  fromDivisionId: string;
  fromDivisionName: string | null;
  toDivisionId?: string;
  toDivisionName?: string | null;
  /** Cognito sub of the staff member, or 'system' for automatic actions. */
  actorUserId: string;
  /** The actor's linked player name; null for 'system' and for staff with no linked player. */
  actorName: string | null;
  createdAt: string;
}

/**
 * GET /progression/events?trackId=&kind=&limit= (Moderator+).
 *
 * The call-up history: consideration added/removed and executed moves, newest
 * first, joined with player, track and division names. `limit` defaults to 50
 * (max 200). The events table is scanned; it holds one row per GM action, so
 * it stays small.
 */
export const listProgressionEvents: APIGatewayProxyHandler = async (event) => {
  const query = event.queryStringParameters ?? {};

  let limit = DEFAULT_EVENTS_LIMIT;
  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EVENTS_LIMIT) {
      return badRequest(`limit must be an integer between 1 and ${MAX_EVENTS_LIMIT}`);
    }
  }

  const kind = query.kind;
  if (kind !== undefined && !isProgressionKind(kind)) {
    return badRequest('kind must be one of callup, promotion, relegation');
  }
  const trackId = query.trackId || undefined;

  try {
    const { progression, roster: { players }, leagueOps: { divisions } } = getRepositories();
    const [events, allPlayers, allDivisions, tracks] = await Promise.all([
      progression.listRecentEvents({ trackId, kind }, { limit }),
      players.list(),
      divisions.list(),
      progression.listTracks(),
    ]);

    const playerById = new Map<string, Player>(allPlayers.map((player) => [player.playerId, player]));
    // Players soft-deleted since the event are not in list(); fetch the few that are missing.
    const missingIds = [...new Set(events.map((row) => row.playerId))].filter((id) => !playerById.has(id));
    const deleted = await Promise.all(missingIds.map((id) => players.findByIdWithDeleted(id)));
    for (const player of deleted) {
      if (player) playerById.set(player.playerId, player);
    }

    const nameByUserId = new Map<string, string>();
    for (const player of allPlayers) {
      if (player.userId) nameByUserId.set(player.userId, player.name);
    }
    const divisionName = new Map(allDivisions.map((division) => [division.divisionId, division.name]));
    const trackName = new Map(tracks.map((track) => [track.trackId, track.name]));

    const entries: ProgressionEventEntry[] = events.map((row) => {
      const player = playerById.get(row.playerId);
      const entry: ProgressionEventEntry = {
        eventId: row.eventId,
        type: row.type,
        kind: row.kind,
        trackId: row.trackId,
        trackName: trackName.get(row.trackId) ?? null,
        playerId: row.playerId,
        playerName: player?.name ?? null,
        wrestlerName: player?.currentWrestler || null,
        fromDivisionId: row.fromDivisionId,
        fromDivisionName: divisionName.get(row.fromDivisionId) ?? null,
        actorUserId: row.actorUserId,
        actorName: row.actorUserId === SYSTEM_ACTOR ? null : nameByUserId.get(row.actorUserId) ?? null,
        createdAt: row.createdAt,
      };
      if (row.toDivisionId) {
        entry.toDivisionId = row.toDivisionId;
        entry.toDivisionName = divisionName.get(row.toDivisionId) ?? null;
      }
      return entry;
    });

    return success(entries);
  } catch (err) {
    console.error('Error listing progression events:', err);
    return serverError('Failed to list progression events');
  }
};
