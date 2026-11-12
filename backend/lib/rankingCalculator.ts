import { dynamoDb, TableNames } from './dynamodb';
import { matchWinners } from './matchResult';
import { isPlayerVisible } from './needsWrestler';
import { getRepositories } from './repositories';
import type { TagTeam } from './repositories/types';
import { buildTagTeamIndex, splitSidesIntoTeams } from './tagTeams/resolveTagTeams';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RankingEntityType = 'player' | 'tagTeam';

export interface RankingCalculationParams {
  championshipId: string;
  championshipType: 'singles' | 'tag';
  currentChampion: string | string[] | undefined;
  /**
   * The tag team holding a tag title, when the championship records it.
   * Optional: titles without it fall back to matching `currentChampion`
   * against the team's members.
   */
  currentTagTeamId?: string;
  divisionId?: string;
  seasonId: string;
  minimumMatches: number;
  maxContenders: number;
  /**
   * Entities who get a row even when they would not qualify on merit, as long
   * as they could contend for the title at all. Their rows follow the top N.
   * Player ids on a singles title, tag team ids on a tag title.
   */
  alwaysIncludePlayerIds?: readonly string[];
}

export interface RankingResult {
  /**
   * The ranked entity's id. On a tag title this holds the tagTeamId, so rows
   * fit the contender table's key (`championshipId`, `playerId`) unchanged.
   */
  playerId: string;
  /** Position on merit, or 0 for an entity below the minimum-match threshold. */
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  qualityScore: number;
  recencyScore: number;
  matchesInPeriod: number;
  winsInPeriod: number;
  /** Set on tag-team rows only; absent means `'player'`. */
  entityType?: RankingEntityType;
  /** Set on tag-team rows only, equal to `playerId`. */
  tagTeamId?: string;
}

/** Internal representation of a completed match from DynamoDB. */
interface MatchRecord {
  matchId: string;
  date: string;
  participants: string[];
  winners: string[];
  losers: string[];
  isDraw?: boolean;
  status: string;
  seasonId?: string;
  teams?: string[][];
  matchFormat?: string;
  matchType?: string;
}

/** Aggregate win/loss totals for one entity (player or team) in the period. */
interface PlayerStats {
  wins: number;
  losses: number;
  total: number;
}

/** How one entity did in one match, which is all the scoring needs. */
export interface EntityMatchResult {
  date: string;
  outcome: 'win' | 'loss' | 'draw';
  /** The entities this one beat. Empty unless `outcome` is `'win'`. */
  beatenIds: readonly string[];
}

/** A player row from the Players scan. */
interface PlayerRow {
  playerId: string;
  divisionId?: string;
  deletedAt?: string;
  currentWrestler?: string;
  deactivatedAt?: string;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Fixed exponential-decay constant (in days) used for the recency component
 * of the ranking score. Independent of season length so the decay shape stays
 * the same regardless of how long the active season is.
 */
const RECENCY_DECAY_DAYS = 30;

/**
 * Calculate contender rankings for a given championship.
 *
 * The algorithm evaluates every player (or, on a tag title, every active tag
 * team) with completed matches in the active season by combining four
 * weighted scoring components:
 *   - Base win percentage   (40%)
 *   - Current streak bonus  (20%)
 *   - Quality of wins       (25%)
 *   - Recency weighting     (15%)
 *
 * The current champion and entities below the minimum-match threshold are
 * excluded from the results. `alwaysIncludePlayerIds` adds rows past the top N
 * for the eligible entities it names, whatever their record. Anyone who may
 * not contend for this title gets no row, so no later step can place them.
 */
export async function calculateRankingsForChampionship(
  params: RankingCalculationParams,
): Promise<RankingResult[]> {
  const { divisionId, seasonId } = params;

  // ------------------------------------------------------------------
  // 1a. Fetch eligible player IDs. Matches keep the ids of deleted players,
  //     so a candidate must still be a live player, shown on the roster, and
  //     on a division-locked title a member of that division. A hidden player
  //     would otherwise hold a slot that the read then drops.
  // ------------------------------------------------------------------
  const allPlayers = await dynamoDb.scanAll({
    TableName: TableNames.PLAYERS,
    ProjectionExpression: 'playerId, divisionId, deletedAt, currentWrestler, deactivatedAt',
  });
  const eligiblePlayerIds = new Set(
    (allPlayers as unknown as PlayerRow[])
      .filter((p) => (
        !p.deletedAt
        && isPlayerVisible({
          currentWrestler: p.currentWrestler,
          deactivatedAt: p.deactivatedAt,
        })
        && (!divisionId || p.divisionId === divisionId)
      ))
      .map((p) => p.playerId),
  );

  // ------------------------------------------------------------------
  // 1b. Fetch all completed matches in the active season
  // ------------------------------------------------------------------
  const allMatches = await dynamoDb.scanAll({
    TableName: TableNames.MATCHES,
    FilterExpression: '#status = :completed AND seasonId = :seasonId',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':completed': 'completed',
      ':seasonId': seasonId,
    },
  });

  const matches: MatchRecord[] = allMatches as unknown as MatchRecord[];

  if (params.championshipType === 'tag') {
    const teams = await getRepositories().roster.tagTeams.listAll();
    return calculateTagTeamRankings(params, matches, teams, eligiblePlayerIds);
  }

  return calculatePlayerRankings(params, matches, eligiblePlayerIds);
}

/** Ranks individual players for a singles title. */
function calculatePlayerRankings(
  params: RankingCalculationParams,
  matches: MatchRecord[],
  eligiblePlayerIds: ReadonlySet<string>,
): RankingResult[] {
  const {
    currentChampion,
    minimumMatches = 3,
    maxContenders = 10,
    alwaysIncludePlayerIds = [],
  } = params;

  // ------------------------------------------------------------------
  // 2. Build per-player match lists and aggregate stats
  // ------------------------------------------------------------------
  const playerMatchMap = new Map<string, MatchRecord[]>();
  const playerStats = new Map<string, PlayerStats>();

  for (const match of matches) {
    const involvedPlayers = [...(match.participants || [])];

    for (const playerId of involvedPlayers) {
      // Accumulate match list
      if (!playerMatchMap.has(playerId)) {
        playerMatchMap.set(playerId, []);
      }
      playerMatchMap.get(playerId)!.push(match);

      // Accumulate aggregate stats used for quality-of-wins scoring
      if (!playerStats.has(playerId)) {
        playerStats.set(playerId, { wins: 0, losses: 0, total: 0 });
      }
      const stats = playerStats.get(playerId)!;
      stats.total += 1;

      if (matchWinners(match).includes(playerId)) {
        stats.wins += 1;
      } else if (match.losers.includes(playerId)) {
        stats.losses += 1;
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. Determine which player IDs belong to the current champion so
  //    they can be excluded from the contender list.
  // ------------------------------------------------------------------
  const championIds = championIdSet(currentChampion);

  // ------------------------------------------------------------------
  // 4. Score each eligible player
  // ------------------------------------------------------------------
  const scoredPlayers: RankingResult[] = [];
  const alwaysIncluded = new Set(alwaysIncludePlayerIds);
  const belowThreshold: RankingResult[] = [];

  for (const [playerId, playerMatches] of playerMatchMap.entries()) {
    // Exclude the current champion
    if (championIds.has(playerId)) {
      continue;
    }

    // Exclude deleted players and anyone outside the championship's division
    if (!eligiblePlayerIds.has(playerId)) {
      continue;
    }

    // Exclude players who have not met the minimum-match threshold
    if (playerMatches.length < minimumMatches) {
      if (alwaysIncluded.has(playerId)) {
        belowThreshold.push(calculatePlayerScore(playerId, playerMatches, playerStats));
      }
      continue;
    }

    const score = calculatePlayerScore(playerId, playerMatches, playerStats);
    scoredPlayers.push(score);
  }

  // An eligible player with no matches in the season has nothing to score.
  const noMatches = [...alwaysIncluded]
    .filter((playerId) => (
      eligiblePlayerIds.has(playerId)
      && !championIds.has(playerId)
      && !playerMatchMap.has(playerId)
    ))
    .map((playerId) => emptyRanking(playerId));

  return assembleRankings(scoredPlayers, belowThreshold, noMatches, alwaysIncluded, maxContenders);
}

/**
 * Ranks active tag teams for a tag title.
 *
 * A team is eligible when it is `active`, both members are live, visible
 * players (and in the title's division when it has one), and it isn't the
 * current champion. Its match set is every completed tag match in the season
 * where `splitSidesIntoTeams` puts it on a side, so a pairing that isn't a
 * registered team counts for nobody. Quality of wins uses the beaten teams'
 * win rates over that same match set.
 *
 * Rows keep the tagTeamId in `playerId` so the contender table's key
 * (`championshipId`, `playerId`) needs no migration; `entityType: 'tagTeam'`
 * and `tagTeamId` say how to read them.
 */
function calculateTagTeamRankings(
  params: RankingCalculationParams,
  matches: readonly MatchRecord[],
  teams: readonly TagTeam[],
  eligiblePlayerIds: ReadonlySet<string>,
): RankingResult[] {
  const {
    currentChampion,
    currentTagTeamId,
    minimumMatches = 3,
    maxContenders = 10,
    alwaysIncludePlayerIds = [],
  } = params;

  // ------------------------------------------------------------------
  // 1. Per-team results and stats from every tag match in the season.
  //    The index holds teams of every status so older matches still resolve.
  // ------------------------------------------------------------------
  const index = buildTagTeamIndex(teams);
  const teamResults = new Map<string, EntityMatchResult[]>();
  const teamStats = new Map<string, PlayerStats>();

  for (const match of matches) {
    const split = splitSidesIntoTeams(match, index);
    if (!split) continue;

    for (const side of split.sides) {
      if (!side.tagTeamId) continue;
      const outcome = side.outcome === 'win' || side.outcome === 'draw' ? side.outcome : 'loss';
      const beatenIds = outcome === 'win'
        ? split.sides
          .filter((other) => other.outcome === 'loss' && other.tagTeamId)
          .map((other) => other.tagTeamId as string)
        : [];

      const results = teamResults.get(side.tagTeamId) ?? [];
      results.push({ date: match.date, outcome, beatenIds });
      teamResults.set(side.tagTeamId, results);

      const stats = teamStats.get(side.tagTeamId) ?? { wins: 0, losses: 0, total: 0 };
      stats.total += 1;
      if (outcome === 'win') stats.wins += 1;
      else if (outcome === 'loss') stats.losses += 1;
      teamStats.set(side.tagTeamId, stats);
    }
  }

  // ------------------------------------------------------------------
  // 2. Eligibility
  // ------------------------------------------------------------------
  const championIds = championIdSet(currentChampion);
  const isChampion = (team: TagTeam): boolean => (
    (Boolean(currentTagTeamId) && team.tagTeamId === currentTagTeamId)
    || (championIds.has(team.player1Id) && championIds.has(team.player2Id))
  );
  const eligibleTeams = teams.filter((team) => (
    team.status === 'active'
    && eligiblePlayerIds.has(team.player1Id)
    && eligiblePlayerIds.has(team.player2Id)
    && !isChampion(team)
  ));

  // ------------------------------------------------------------------
  // 3. Score each eligible team
  // ------------------------------------------------------------------
  const alwaysIncluded = new Set(alwaysIncludePlayerIds);
  const scored: RankingResult[] = [];
  const belowThreshold: RankingResult[] = [];
  const noMatches: RankingResult[] = [];

  for (const team of eligibleTeams) {
    const results = teamResults.get(team.tagTeamId) ?? [];
    if (results.length === 0) {
      if (alwaysIncluded.has(team.tagTeamId)) noMatches.push(asTagTeamRow(emptyRanking(team.tagTeamId)));
      continue;
    }

    const score = asTagTeamRow(scoreEntity(team.tagTeamId, results, teamStats));
    if (results.length < minimumMatches) {
      if (alwaysIncluded.has(team.tagTeamId)) belowThreshold.push(score);
      continue;
    }
    scored.push(score);
  }

  return assembleRankings(scored, belowThreshold, noMatches, alwaysIncluded, maxContenders);
}

/** Marks a row as a tag team's: `playerId` already holds the tagTeamId. */
function asTagTeamRow(row: RankingResult): RankingResult {
  return { ...row, entityType: 'tagTeam', tagTeamId: row.playerId };
}

/** The current champion's player ids as a set. */
function championIdSet(currentChampion: string | string[] | undefined): Set<string> {
  const championIds = new Set<string>();
  if (currentChampion) {
    if (Array.isArray(currentChampion)) {
      currentChampion.forEach((id) => championIds.add(id));
    } else {
      championIds.add(currentChampion);
    }
  }
  return championIds;
}

/**
 * Ranks scored rows by score descending and returns the top N, then any
 * always-included rows: those past the top N, those below the match minimum,
 * and those with no matches.
 */
function assembleRankings(
  scored: RankingResult[],
  belowThreshold: RankingResult[],
  noMatches: RankingResult[],
  alwaysIncluded: ReadonlySet<string>,
  maxContenders: number,
): RankingResult[] {
  scored.sort((a, b) => b.rankingScore - a.rankingScore);

  // Assign final rank positions (1-indexed)
  for (let i = 0; i < scored.length; i++) {
    scored[i].rank = i + 1;
  }

  const topContenders = scored.slice(0, maxContenders);
  const beyondTop = scored
    .slice(maxContenders)
    .filter((row) => alwaysIncluded.has(row.playerId));

  return [...topContenders, ...beyondTop, ...belowThreshold, ...noMatches];
}

/** The row for an entity with no matches in the period. */
function emptyRanking(entityId: string): RankingResult {
  return {
    playerId: entityId,
    rank: 0,
    rankingScore: 0,
    winPercentage: 0,
    currentStreak: 0,
    qualityScore: 0,
    recencyScore: 0,
    matchesInPeriod: 0,
    winsInPeriod: 0,
  };
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

/** How `playerId` did in a singles-path match. */
function playerResult(match: MatchRecord, playerId: string): EntityMatchResult {
  if (matchWinners(match).includes(playerId)) {
    return { date: match.date, outcome: 'win', beatenIds: match.losers };
  }
  // A player who neither won nor drew counts as having lost, as before.
  return { date: match.date, outcome: match.isDraw ? 'draw' : 'loss', beatenIds: [] };
}

/**
 * Calculate the composite ranking score for a single player.
 * See `scoreEntity` for the scoring breakdown.
 */
export function calculatePlayerScore(
  playerId: string,
  playerMatches: MatchRecord[],
  allPlayers: Map<string, PlayerStats>,
): RankingResult {
  return scoreEntity(
    playerId,
    playerMatches.map((match) => playerResult(match, playerId)),
    allPlayers,
  );
}

/**
 * Calculate the composite ranking score for one entity (a player or a tag
 * team) from its results in the period.
 *
 * Scoring breakdown (each component normalized to 0-100, then weighted):
 *   winPercentage  * 0.40  -- raw win rate over the period
 *   streakBonus    * 0.20  -- reward current win streaks, penalise loss streaks
 *   qualityScore   * 0.25  -- average win-rate of defeated opponents
 *   recencyScore   * 0.15  -- exponentially-decayed weighting of recent results
 *
 * `allStats` holds every entity's totals, used to rate beaten opponents.
 */
export function scoreEntity(
  entityId: string,
  results: readonly EntityMatchResult[],
  allStats: ReadonlyMap<string, PlayerStats>,
): RankingResult {
  const wins = results.filter((result) => result.outcome === 'win');
  const totalMatches = results.length;

  // ----- Win Percentage (0-100) -----
  const winPercentage = Math.min((wins.length / totalMatches) * 100, 100);

  // ----- Streak Bonus (0-100) -----
  const streak = streakFromResults(results);
  let streakBonus: number;
  if (streak > 0) {
    // Win streak: 10 points per consecutive win, capped at 100
    streakBonus = Math.min(streak * 10, 100);
  } else {
    // Loss streak: -5 points per consecutive loss, floored at 0
    streakBonus = Math.max(streak * 5, 0); // streak is negative, so streak * 5 <= 0
  }

  // ----- Quality of Wins (0-100) -----
  // Average win percentage of all defeated opponents. With no wins in the
  // period the quality score is 0.
  let qualityScore = 0;
  if (wins.length > 0) {
    let totalOpponentWinPct = 0;
    let opponentCount = 0;

    for (const win of wins) {
      for (const beatenId of win.beatenIds) {
        const opponentStats = allStats.get(beatenId);
        if (opponentStats && opponentStats.total > 0) {
          totalOpponentWinPct += opponentStats.wins / opponentStats.total;
          opponentCount += 1;
        }
      }
    }

    if (opponentCount > 0) {
      // Multiply by 100 to normalise to 0-100 scale
      qualityScore = (totalOpponentWinPct / opponentCount) * 100;
    }
  }

  // ----- Recency Score (0-100) -----
  // Each match is weighted by an exponential decay factor based on how many
  // days ago it occurred. Wins contribute 1, anything else 0. The final
  // score is the weighted average scaled to 0-100.
  const now = new Date();
  let weightedWinSum = 0;
  let weightSum = 0;

  for (const result of results) {
    const matchDate = new Date(result.date);
    const daysSinceMatch = Math.max(
      (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24),
      0,
    );
    const weight = Math.exp(-daysSinceMatch / RECENCY_DECAY_DAYS);

    const isWin = result.outcome === 'win' ? 1 : 0;
    weightedWinSum += isWin * weight;
    weightSum += weight;
  }

  const recencyScore = weightSum > 0 ? (weightedWinSum / weightSum) * 100 : 0;

  // ----- Composite Score -----
  const rankingScore = parseFloat(
    (
      winPercentage * 0.4 +
      streakBonus * 0.2 +
      qualityScore * 0.25 +
      recencyScore * 0.15
    ).toFixed(2),
  );

  return {
    playerId: entityId,
    rank: 0, // assigned after sorting
    rankingScore,
    winPercentage: parseFloat(winPercentage.toFixed(2)),
    currentStreak: streak,
    qualityScore: parseFloat(qualityScore.toFixed(2)),
    recencyScore: parseFloat(recencyScore.toFixed(2)),
    matchesInPeriod: totalMatches,
    winsInPeriod: wins.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine the current win or loss streak for a player.
 * See `streakFromResults` for the rules.
 */
export function calculateCurrentStreak(
  matches: MatchRecord[],
  playerId: string,
): number {
  return streakFromResults(matches.map((match) => playerResult(match, playerId)));
}

/**
 * Determine the current win or loss streak from an entity's results.
 *
 * Results are sorted by date descending (most recent first) and we count
 * consecutive wins or losses from the top.
 *
 * Returns a positive number for a win streak (e.g. 4 means four consecutive
 * wins) and a negative number for a loss streak (e.g. -2 means two
 * consecutive losses). A draw ends either kind of streak, the same as the
 * streaks on the statistics pages, so a draw as the latest match returns 0.
 */
export function streakFromResults(results: readonly EntityMatchResult[]): number {
  // Sort descending by date so the most recent match is first
  const sorted = [...results].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  if (sorted.length === 0) {
    return 0;
  }

  // Determine direction from the most recent match
  const firstIsWin = sorted[0].outcome === 'win';
  let streak = 0;

  for (const result of sorted) {
    if (result.outcome === 'draw') break;
    const isWin = result.outcome === 'win';
    if (isWin === firstIsWin) {
      streak += 1;
    } else {
      break;
    }
  }

  // Positive for wins, negative for losses
  return firstIsWin ? streak : 0 - streak;
}
