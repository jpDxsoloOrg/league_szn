import type { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match, ProgressionConsideration, ProgressionTrack } from '../../lib/repositories/types';
import { badRequest, notFound, serverError, success } from '../../lib/response';
import { toGoalDetails, type ProgressionGoalDetail } from './getPlayerProgression';

export const MAX_BOARD_LIMIT = 500;

/** Latest completed-match date per player, for the players in `playerIds`. */
export function lastMatchDates(matches: readonly Match[], playerIds: ReadonlySet<string>): Map<string, string> {
  const latest = new Map<string, string>();
  for (const match of matches) {
    if (!match.date) continue;
    for (const playerId of match.participants ?? []) {
      if (!playerIds.has(playerId)) continue;
      const current = latest.get(playerId);
      if (current === undefined || match.date > current) latest.set(playerId, match.date);
    }
  }
  return latest;
}

export interface TrackBoardEntry {
  playerId: string;
  name: string;
  wrestlerName: string;
  imageUrl?: string;
  progressPct: number;
  goals: ProgressionGoalDetail[];
  consideration?: ProgressionConsideration;
  computedAt: string;
  /** Date of the player's latest completed match; absent when they have none. */
  lastMatchDate?: string;
}

export interface TrackBoardResponse {
  track: ProgressionTrack;
  players: TrackBoardEntry[];
}

/**
 * GET /progression/tracks/{trackId}/players (Moderator+). The candidate
 * board: every player still in the track's source division, highest
 * progressPct first (TrackIndex), with name, wrestler, image and the date
 * of their latest completed match.
 * Optional ?limit= (1-500).
 */
export const getTrackBoard: APIGatewayProxyHandler = async (event) => {
  try {
    const trackId = event.pathParameters?.trackId;
    if (!trackId) return badRequest('trackId is required');

    let limit: number | undefined;
    const rawLimit = event.queryStringParameters?.limit;
    if (rawLimit !== undefined) {
      limit = Number(rawLimit);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BOARD_LIMIT) {
        return badRequest(`limit must be an integer between 1 and ${MAX_BOARD_LIMIT}`);
      }
    }

    const { roster: { players }, competition: { matches }, progression } = getRepositories();
    const track = await progression.getTrack(trackId);
    if (!track) return notFound('Progression track not found');

    // Completed matches are read once (as the progression inputs do) for the last-match column.
    const [rows, allPlayers, completedMatches] = await Promise.all([
      progression.listByTrack(trackId, { descending: true }),
      players.list(),
      matches.listCompleted(),
    ]);
    const lastMatchByPlayer = lastMatchDates(completedMatches, new Set(rows.map((row) => row.playerId)));
    const playerById = new Map(allPlayers.map((player) => [player.playerId, player]));

    const entries: TrackBoardEntry[] = [];
    for (const row of rows) {
      const player = playerById.get(row.playerId);
      // Rows outlive a player's move out of the division; they are no longer candidates.
      if (!player || player.divisionId !== track.fromDivisionId) continue;
      const entry: TrackBoardEntry = {
        playerId: player.playerId,
        name: player.name,
        wrestlerName: player.currentWrestler,
        progressPct: row.progressPct,
        goals: toGoalDetails(track, row),
        computedAt: row.computedAt,
      };
      if (player.imageUrl) entry.imageUrl = player.imageUrl;
      if (row.consideration) entry.consideration = row.consideration;
      const lastMatchDate = lastMatchByPlayer.get(player.playerId);
      if (lastMatchDate) entry.lastMatchDate = lastMatchDate;
      entries.push(entry);
      if (limit !== undefined && entries.length >= limit) break;
    }

    const body: TrackBoardResponse = { track, players: entries };
    return success(body);
  } catch (err) {
    console.error('Error fetching progression board:', err);
    return serverError('Failed to fetch progression board');
  }
};
