import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { Match, Season, SeasonStanding } from '../../lib/repositories/types';
import { success, serverError, badRequest } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { computeRecentFormAndStreak, type FormResult } from '../../lib/recentForm';

export interface PlayerBookingInfo {
  /** ISO date of the most recent match the player is on; null = never booked. */
  lastBookedAt: string | null;
  lastBookedMatchId?: string;
  lastBookedEventId?: string;
  /** Current run of identical results, newest first. count 0 = no completed matches. */
  currentStreak: { type: FormResult; count: number };
  /** W-L-D in the requested (or active) season; absent when there is no season. */
  seasonRecord?: SeasonRecord;
}

export interface SeasonRecord {
  seasonId: string;
  seasonName: string;
  wins: number;
  losses: number;
  draws: number;
}

/** Season ids are UUIDs today; allow a little slack but nothing exotic. */
const SEASON_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Resolve the season whose record to attach: the requested one, else the
 * active one. `season: null` = no season to report on (no records). An
 * unknown explicit id is reported as `'unknown'` so the caller can 400.
 */
async function resolveSeason(
  seasonId: string | undefined,
): Promise<{ season: Season | null; standings: SeasonStanding[] } | 'unknown'> {
  const { season: { seasons, standings } } = getRepositories();
  if (seasonId) {
    // Both lookups key off the id we already have, so run them together.
    const [season, rows] = await Promise.all([
      seasons.findById(seasonId),
      standings.listBySeason(seasonId),
    ]);
    return season ? { season, standings: rows } : 'unknown';
  }
  const active = await seasons.findActive();
  if (!active) return { season: null, standings: [] };
  return { season: active, standings: await standings.listBySeason(active.seasonId) };
}

/** Everyone on the match: explicit participants plus anyone holding a slot. */
function playerIdsOn(match: Match): string[] {
  const ids = new Set<string>(match.participants ?? []);
  for (const slot of match.slots ?? []) {
    if (slot.playerId) ids.add(slot.playerId);
  }
  return [...ids];
}

/** A match that puts its players "on a card": anything not cancelled. */
const BOOKED_STATUSES = new Set<Match['status']>(['scheduled', 'open-signups', 'completed']);

/**
 * GET /players/booking-summary — staff only. One row per player with when
 * they were last put on a card (scheduled, open-signups or completed;
 * cancelled ignored) and their current streak, so booking pickers can
 * surface under-used wrestlers first.
 *
 * Optional `?seasonId=` picks the season for `seasonRecord` (W-L-D from
 * SeasonStandings, the same numbers the Standings page shows); without it
 * the active season is used, and with no season at all records are omitted.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  const requestedSeasonId = event.queryStringParameters?.seasonId?.trim() || undefined;
  if (requestedSeasonId !== undefined && !SEASON_ID_PATTERN.test(requestedSeasonId)) {
    return badRequest('Invalid seasonId');
  }

  try {
    const { roster: { players }, competition: { matches } } = getRepositories();
    // One scan, partitioned in memory — a filtered scan reads every item
    // anyway, so separate per-status calls would just multiply the cost.
    const [allPlayers, allMatches, seasonLookup] = await Promise.all([
      players.list(),
      matches.list(),
      resolveSeason(requestedSeasonId),
    ]);
    // The id passed the charset check above, so it is safe to echo.
    if (seasonLookup === 'unknown') return badRequest(`Season ${requestedSeasonId} not found`);
    const { season, standings } = seasonLookup;
    const standingByPlayer = new Map(standings.map((row) => [row.playerId, row]));
    const booked = allMatches.filter((m) => BOOKED_STATUSES.has(m.status));
    const completed = booked.filter((m) => m.status === 'completed');

    const latestByPlayer = new Map<string, Match>();
    for (const match of booked) {
      if (!match.date) continue;
      for (const playerId of playerIdsOn(match)) {
        const current = latestByPlayer.get(playerId);
        if (!current || match.date > current.date) latestByPlayer.set(playerId, match);
      }
    }

    const summary: Record<string, PlayerBookingInfo> = {};
    for (const player of allPlayers) {
      const latest = latestByPlayer.get(player.playerId);
      const { currentStreak } = computeRecentFormAndStreak(player.playerId, completed);
      summary[player.playerId] = {
        lastBookedAt: latest?.date ?? null,
        ...(latest ? { lastBookedMatchId: latest.matchId } : {}),
        ...(latest?.eventId ? { lastBookedEventId: latest.eventId } : {}),
        currentStreak,
      };
      if (season) {
        const standing = standingByPlayer.get(player.playerId);
        summary[player.playerId].seasonRecord = {
          seasonId: season.seasonId,
          seasonName: season.name,
          wins: standing?.wins ?? 0,
          losses: standing?.losses ?? 0,
          draws: standing?.draws ?? 0,
        };
      }
    }

    return success(summary);
  } catch (err) {
    console.error('Error building booking summary:', err);
    return serverError('Failed to build booking summary');
  }
};
