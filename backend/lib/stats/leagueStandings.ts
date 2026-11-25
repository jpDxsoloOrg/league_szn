/**
 * League tables for the standings API (STR-03).
 *
 * Wraps the pure league points policy with the two tables `GET /standings`
 * needs: one over every match in the window (all-time or one season), and one
 * per division where each player is credited only for results since they
 * joined that division (PRL-09), so a mover starts at 0 points.
 *
 * Every player is fed into the tables, hidden ones included: they still count
 * as opponents for quality wins and strength of schedule. Callers filter and
 * rank only the rows they return.
 */
import type { Match, Player } from '../repositories';
import { divisionRecordLowerBound } from '../divisionRecord';
import { matchResultTime } from '../matchTime';
import {
  computeLeagueTable,
  type LeagueMatchInput,
  type LeagueRow,
} from '../policies/leaguePoints';
import type { IsChampionAt } from './titleReigns';

/** The league fields merged into each standings row. */
export interface LeagueFields {
  points: number;
  qualityWins: number;
  streakBonuses: number;
  sos: number;
}

type LeaguePlayer = Pick<Player, 'playerId' | 'divisionId' | 'divisionJoinedAt'>;

/** Key for players with no division, so they still share one table. */
const NO_DIVISION = '';

export function toLeagueMatch(match: Match): LeagueMatchInput {
  return {
    matchId: match.matchId,
    date: match.date,
    completedAt: match.completedAt,
    participants: match.participants ?? [],
    winners: match.winners ?? [],
    losers: match.losers ?? [],
    isDraw: match.isDraw,
    teams: match.teams,
  };
}

export function leagueFieldsOf(row: LeagueRow | undefined): LeagueFields {
  return {
    points: row?.points ?? 0,
    qualityWins: row?.qualityWins ?? 0,
    streakBonuses: row?.streakBonuses ?? 0,
    sos: row?.sos ?? 0,
  };
}

function rowsById(rows: readonly LeagueRow[]): Map<string, LeagueRow> {
  return new Map(rows.map((row) => [row.playerId, row]));
}

/** One table over every match given; every player gets a row. */
export function computeOverallLeague(
  matches: readonly LeagueMatchInput[],
  players: readonly LeaguePlayer[],
  isChampionAt: IsChampionAt,
): Map<string, LeagueRow> {
  return rowsById(
    computeLeagueTable(matches, {
      isChampionAt,
      playerIds: players.map((player) => player.playerId),
    }),
  );
}

/**
 * One table per division. A player is credited for a match only when they
 * belong to that division and the result landed on or after their
 * `divisionJoinedAt` (no join time: every match counts). Opponents from other
 * divisions, or from before they joined, are judged on their points in this
 * division's table. Returns rows keyed by playerId; each player appears only
 * in their own division's table.
 */
export function computeDivisionLeagues(
  matches: readonly LeagueMatchInput[],
  players: readonly LeaguePlayer[],
  isChampionAt: IsChampionAt,
): Map<string, LeagueRow> {
  const divisionOf = new Map<string, string>();
  const joinedAtMs = new Map<string, number>();
  const membersByDivision = new Map<string, string[]>();
  for (const player of players) {
    const divisionKey = player.divisionId ?? NO_DIVISION;
    divisionOf.set(player.playerId, divisionKey);
    const since = divisionRecordLowerBound(player.divisionJoinedAt);
    if (since) joinedAtMs.set(player.playerId, new Date(since).getTime());
    const members = membersByDivision.get(divisionKey) ?? [];
    members.push(player.playerId);
    membersByDivision.set(divisionKey, members);
  }

  // Hand each division only the matches one of its members played in.
  const matchesByDivision = new Map<string, LeagueMatchInput[]>();
  for (const match of matches) {
    const divisionsInMatch = new Set<string>();
    for (const playerId of match.participants) {
      const divisionKey = divisionOf.get(playerId);
      if (divisionKey !== undefined) divisionsInMatch.add(divisionKey);
    }
    for (const divisionKey of divisionsInMatch) {
      const divisionMatches = matchesByDivision.get(divisionKey) ?? [];
      divisionMatches.push(match);
      matchesByDivision.set(divisionKey, divisionMatches);
    }
  }

  const result = new Map<string, LeagueRow>();
  for (const [divisionKey, memberIds] of membersByDivision) {
    const countsFor = (playerId: string, match: LeagueMatchInput): boolean => {
      if (divisionOf.get(playerId) !== divisionKey) return false;
      const since = joinedAtMs.get(playerId);
      return since === undefined || new Date(matchResultTime(match)).getTime() >= since;
    };
    const rows = computeLeagueTable(matchesByDivision.get(divisionKey) ?? [], {
      isChampionAt,
      playerIds: memberIds,
      countsFor,
    });
    for (const row of rows) result.set(row.playerId, row);
  }
  return result;
}
