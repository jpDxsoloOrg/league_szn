import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import {
  computeRecentFormAndStreak,
  type FormResult,
} from '../../lib/stats/recentFormAndStreak';
import {
  fetchActiveStables,
  fetchCompletedMatches,
  buildPlayerToStableMap,
  computeStableMatchResults,
  computeMatchTypeRecords,
  computeHeadToHead,
  computeWinPercentage,
  type MatchRecord,
  type StableRecord,
} from './computeStableStats';

const RECENT_FORM_LIMIT = 5;
const HEAD_TO_HEAD_LIMIT = 5;

interface MemberStatsRow {
  playerId: string;
  playerName: string;
  wrestlerName: string;
  wins: number;
  losses: number;
  draws: number;
  winPercentage: number;
  recentForm: FormResult[];
  currentStreak: { type: FormResult; count: number };
}

interface MatchTypeRow {
  matchFormat: string;
  wins: number;
  losses: number;
  draws: number;
}

interface HeadToHeadRow {
  factionId: string;
  factionName: string;
  wins: number;
  losses: number;
  draws: number;
}

interface FactionStatsResponse {
  factionId: string;
  factionName: string;
  seasonId: string | null;
  totals: {
    wins: number;
    losses: number;
    draws: number;
    winPercentage: number;
    matchCount: number;
    recentForm: FormResult[];
    currentStreak: { type: FormResult; count: number };
  };
  members: MemberStatsRow[];
  matchTypeBreakdown: MatchTypeRow[];
  headToHead: HeadToHeadRow[];
}

/**
 * Builds the per-player form sequence (newest-first) for a given playerId
 * across the supplied matches. Drops matches where the player participated
 * but appears in neither winners, losers, nor a draw.
 */
function computeMemberForm(matches: MatchRecord[], playerId: string): {
  results: FormResult[];
  wins: number;
  losses: number;
  draws: number;
} {
  const dated: { date: string; result: FormResult }[] = [];
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const m of matches) {
    if (!(m.participants || []).includes(playerId)) continue;
    let result: FormResult | null = null;
    if (m.isDraw) {
      result = 'D';
      draws++;
    } else if ((m.winners || []).includes(playerId)) {
      result = 'W';
      wins++;
    } else if ((m.losers || []).includes(playerId)) {
      result = 'L';
      losses++;
    }
    if (result) dated.push({ date: m.date, result });
  }

  // Newest-first
  dated.sort((a, b) => b.date.localeCompare(a.date));
  return { results: dated.map((d) => d.result), wins, losses, draws };
}

/**
 * GET /stables/{stableId}/stats?seasonId=
 *
 * Public read. Returns a single aggregated payload for the Stats and Members
 * tabs of the Faction Detail page (FAC-12 / FAC-13).
 *
 * Response shape (stable target for FAC-09 / FAC-12 / FAC-13):
 *
 *   {
 *     factionId, factionName,
 *     seasonId: <string> | null,
 *     totals: { wins, losses, draws, winPercentage, matchCount,
 *               recentForm: ('W'|'L'|'D')[], currentStreak: { type, count } },
 *     members: [{ playerId, playerName, wrestlerName, wins, losses, draws,
 *                 winPercentage, recentForm, currentStreak }],
 *     matchTypeBreakdown: [{ matchFormat, wins, losses, draws }],
 *     headToHead: [{ factionId, factionName, wins, losses, draws }]  // top 5
 *   }
 *
 * When seasonId is supplied, the slice is strict: matches with no seasonId
 * are excluded. With no seasonId, this is the all-time view.
 *
 * The per-faction totals dedupe per match — a match where two members were
 * on the same winning side still counts as one win. Heat / hype is not
 * computed here (FAC-11 owns that).
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const factionId = event.pathParameters?.stableId;
    if (!factionId) {
      return badRequest('stableId is required');
    }
    const requestedSeasonId = event.queryStringParameters?.seasonId?.trim() || null;

    const { roster: { stables: stablesRepo, players: playersRepo } } = getRepositories();
    const faction = await stablesRepo.findById(factionId);
    if (!faction) {
      return notFound('Faction not found');
    }

    const factionMemberIds = faction.memberIds ?? [];

    const [allCompletedMatches, activeStables, memberPlayers] = await Promise.all([
      fetchCompletedMatches(),
      fetchActiveStables(),
      Promise.all(factionMemberIds.map((id) => playersRepo.findById(id))),
    ]);

    // Strict season scoping — match.seasonId === requestedSeasonId, no fallback.
    const matches: MatchRecord[] = requestedSeasonId
      ? allCompletedMatches.filter((m) => m.seasonId === requestedSeasonId)
      : allCompletedMatches;

    // Build a StableRecord for the subject faction (even if not "active"),
    // so we can reuse computeStableMatchResults / computeHeadToHead.
    const factionRecord: StableRecord = {
      stableId: faction.stableId,
      name: faction.name,
      leaderId: faction.leaderId,
      memberIds: factionMemberIds,
      status: faction.status,
      imageUrl: faction.imageUrl,
      wins: faction.wins || 0,
      losses: faction.losses || 0,
      draws: faction.draws || 0,
      createdAt: faction.createdAt,
      updatedAt: faction.updatedAt,
      disbandedAt: faction.disbandedAt,
    };

    // Opponent-faction lookup is built from currently-active factions only.
    // A disbanded opponent won't appear in H2H — by design.
    const playerToStable = buildPlayerToStableMap(activeStables);
    const stableNameMap = new Map<string, string>(
      activeStables.map((s) => [s.stableId, s.name]),
    );
    if (!stableNameMap.has(factionId)) {
      stableNameMap.set(factionId, faction.name);
    }

    const factionResults = computeStableMatchResults(matches, factionRecord, playerToStable);

    // Per-faction totals — deduped via computeStableMatchResults (one result per match).
    let totalWins = 0;
    let totalLosses = 0;
    let totalDraws = 0;
    for (const r of factionResults) {
      if (r.outcome === 'W') totalWins++;
      else if (r.outcome === 'L') totalLosses++;
      else totalDraws++;
    }
    const totalsForm = computeRecentFormAndStreak(
      factionResults.map((r) => r.outcome),
      RECENT_FORM_LIMIT,
    );

    const matchTypeBreakdown: MatchTypeRow[] = computeMatchTypeRecords(factionResults).map(
      (row) => ({
        matchFormat: row.matchFormat,
        wins: row.wins,
        losses: row.losses,
        draws: row.draws,
      }),
    );

    const headToHead: HeadToHeadRow[] = computeHeadToHead(factionResults, stableNameMap)
      .slice(0, HEAD_TO_HEAD_LIMIT)
      .map((h) => ({
        factionId: h.opponentStableId,
        factionName: h.opponentStableName,
        wins: h.wins,
        losses: h.losses,
        draws: h.draws,
      }));

    const playerById = new Map(
      memberPlayers
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => [p.playerId, p]),
    );

    const members: MemberStatsRow[] = factionMemberIds.map((playerId) => {
      const player = playerById.get(playerId);
      const { results, wins, losses, draws } = computeMemberForm(matches, playerId);
      const { recentForm, currentStreak } = computeRecentFormAndStreak(results, RECENT_FORM_LIMIT);
      return {
        playerId,
        playerName: player?.name ?? 'Unknown',
        wrestlerName: player?.currentWrestler ?? 'Unknown',
        wins,
        losses,
        draws,
        winPercentage: computeWinPercentage(wins, losses, draws),
        recentForm,
        currentStreak,
      };
    });

    const response: FactionStatsResponse = {
      factionId,
      factionName: faction.name,
      seasonId: requestedSeasonId,
      totals: {
        wins: totalWins,
        losses: totalLosses,
        draws: totalDraws,
        winPercentage: computeWinPercentage(totalWins, totalLosses, totalDraws),
        matchCount: factionResults.length,
        recentForm: totalsForm.recentForm,
        currentStreak: totalsForm.currentStreak,
      },
      members,
      matchTypeBreakdown,
      headToHead,
    };

    return success(response);
  } catch (err) {
    console.error('Error computing faction stats:', err);
    return serverError('Failed to compute faction stats');
  }
};
