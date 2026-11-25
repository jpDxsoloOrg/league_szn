import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories, type Match, type Player } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { hasWrestlerRole } from '../../lib/wrestlerRole';
import { isPlayerVisible } from '../../lib/needsWrestler';
import { computeRecentFormAndStreak } from '../../lib/recentForm';
import { getVerifiedCaller } from '../../lib/optionalCaller';
import { toPublicPlayer } from '../../lib/publicPlayer';
import { rejectOverlongQuery } from '../../lib/router';
import {
  computeDivisionRecord,
  divisionRecordLowerBound,
  type DivisionRecord,
  type MatchForDivisionRecord,
} from '../../lib/divisionRecord';
import { loadTitleReignIndex } from '../../lib/stats/titleReigns';
import {
  computeDivisionLeagues,
  computeOverallLeague,
  leagueFieldsOf,
  toLeagueMatch,
} from '../../lib/stats/leagueStandings';
import { rankLeagueTable, type LeagueRow } from '../../lib/policies/leaguePoints';

type ShownRecord = Omit<DivisionRecord, 'since'>;

/** How many mismatched player ids the drift warning lists. */
const DRIFT_SAMPLE_SIZE = 5;

/**
 * Record in the player's current division (PRL-09). A player who has never
 * moved has no join time, so their division record is the record shown beside
 * it (career or season); otherwise only results since joining count.
 */
function divisionRecordFor(
  player: { playerId: string; divisionJoinedAt?: string },
  shownRecord: ShownRecord,
  matchesInWindow: ReadonlyArray<MatchForDivisionRecord>,
): DivisionRecord {
  const since = divisionRecordLowerBound(player.divisionJoinedAt);
  if (!since) return { ...shownRecord };
  return computeDivisionRecord(player.playerId, since, matchesInWindow);
}

function emptyLeagueRow(playerId: string): LeagueRow {
  return {
    playerId,
    points: 0,
    basePoints: 0,
    qualityWins: 0,
    streakBonuses: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matchesPlayed: 0,
    winPct: 0,
    sos: 0,
    headToHead: [],
  };
}

/** The visible players' league rows, named for the final tiebreak. */
function namedRows(visiblePlayers: readonly Player[], rows: ReadonlyMap<string, LeagueRow>): LeagueRow[] {
  return visiblePlayers.map((player) => ({
    ...(rows.get(player.playerId) ?? emptyLeagueRow(player.playerId)),
    name: player.name,
  }));
}

/** Rank each division's visible players within their own division table. */
function divisionRanks(
  visiblePlayers: readonly Player[],
  divisionRows: ReadonlyMap<string, LeagueRow>,
): Map<string, number> {
  const playersByDivision = new Map<string, Player[]>();
  for (const player of visiblePlayers) {
    const divisionKey = player.divisionId ?? '';
    const members = playersByDivision.get(divisionKey) ?? [];
    members.push(player);
    playersByDivision.set(divisionKey, members);
  }
  const ranks = new Map<string, number>();
  for (const members of playersByDivision.values()) {
    for (const row of rankLeagueTable(namedRows(members, divisionRows))) {
      ranks.set(row.playerId, row.rank);
    }
  }
  return ranks;
}

/** Stored records should match a replay of the matches; warn (never fail) when they drift. */
function warnOnRecordDrift(
  visiblePlayers: readonly Player[],
  shownRecords: ReadonlyMap<string, ShownRecord>,
  leagueRows: ReadonlyMap<string, LeagueRow>,
  view: string,
): void {
  const driftedIds = visiblePlayers
    .map((player) => player.playerId)
    .filter((playerId) => {
      const shown = shownRecords.get(playerId);
      const replayed = leagueRows.get(playerId);
      if (!shown || !replayed) return false;
      return shown.wins !== replayed.wins || shown.losses !== replayed.losses || shown.draws !== replayed.draws;
    });
  if (driftedIds.length > 0) {
    console.warn(
      `getStandings: stored W-L-D differs from replayed matches for ${driftedIds.length} player(s) (${view})`,
      driftedIds.slice(0, DRIFT_SAMPLE_SIZE),
    );
  }
}

export const handler: APIGatewayProxyHandler = rejectOverlongQuery(async (event) => {
  try {
    const { competition: { matches }, roster: { players, overalls }, season: { standings: seasonStandings } } = getRepositories();
    const seasonId = event.queryStringParameters?.seasonId;

    const [overallItems, rawMatches, caller, isChampionAt] = await Promise.all([
      overalls.listAll(),
      matches.listCompleted(),
      getVerifiedCaller(event),
      loadTitleReignIndex(),
    ]);

    const overallsByPlayerId = new Map<string, number>(
      overallItems
        .filter(o => o.mainOverall !== undefined)
        .map(o => [o.playerId, o.mainOverall])
    );

    const seasonStandingsList = seasonId ? await seasonStandings.listBySeason(seasonId) : [];
    const allPlayers = await players.list();

    // Only return players who have a real wrestler name and whose Cognito
    // user still holds the Wrestler role. Hidden players stay in the league
    // tables below: they still count as opponents for points and SOS.
    const visiblePlayers = allPlayers
      .filter(isPlayerVisible)
      .filter(hasWrestlerRole);

    // Every completed result in the window (one season, or all time).
    const windowMatches: Match[] = seasonId
      ? rawMatches.filter((m) => m.seasonId === seasonId)
      : rawMatches;
    // Last 5 and streak: only matches with updatedAt, in the same window.
    const formMatches = windowMatches.filter((m) => m.updatedAt);

    const leagueMatches = windowMatches.map(toLeagueMatch);
    const overallLeague = computeOverallLeague(leagueMatches, allPlayers, isChampionAt);
    const divisionLeague = computeDivisionLeagues(leagueMatches, allPlayers, isChampionAt);

    // W-L-D shown beside the points: SeasonStandings for a season (0-0-0 when
    // missing), otherwise the player's stored career totals.
    const standingsMap = new Map(seasonStandingsList.map((s) => [s.playerId, s]));
    const shownRecords = new Map<string, ShownRecord>(
      visiblePlayers.map((player) => {
        const stored = seasonId ? standingsMap.get(player.playerId) : player;
        return [
          player.playerId,
          {
            wins: stored?.wins || 0,
            losses: stored?.losses || 0,
            draws: stored?.draws || 0,
            ...computeRecentFormAndStreak(player.playerId, formMatches),
          },
        ];
      }),
    );
    warnOnRecordDrift(visiblePlayers, shownRecords, overallLeague, seasonId ? `season ${seasonId}` : 'all-time');

    const ranksInDivision = divisionRanks(visiblePlayers, divisionLeague);
    const playersById = new Map(visiblePlayers.map((player) => [player.playerId, player]));

    const standings = rankLeagueTable(namedRows(visiblePlayers, overallLeague)).flatMap((ranked) => {
      const player = playersById.get(ranked.playerId);
      const shownRecord = shownRecords.get(ranked.playerId);
      if (!player || !shownRecord) return [];
      const mainOverall = overallsByPlayerId.get(player.playerId);
      return [{
        ...toPublicPlayer(player, caller),
        ...shownRecord,
        ...leagueFieldsOf(ranked),
        rank: ranked.rank,
        divisionRecord: {
          ...divisionRecordFor(player, shownRecord, windowMatches),
          ...leagueFieldsOf(divisionLeague.get(player.playerId)),
          rank: ranksInDivision.get(player.playerId) ?? 0,
        },
        ...(mainOverall !== undefined ? { mainOverall } : {}),
      }];
    });

    return success({
      players: standings,
      ...(seasonId ? { seasonId } : {}),
      rankedBy: 'points',
      // Kept for one release so older cached frontends still parse it.
      sortedByWins: false,
    });
  } catch (err) {
    console.error('Error fetching standings:', err);
    return serverError('Failed to fetch standings');
  }
});
