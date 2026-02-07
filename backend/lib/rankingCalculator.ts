import { dynamoDb, TableNames } from './dynamodb';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RankingCalculationParams {
  championshipId: string;
  championshipType: 'singles' | 'tag';
  currentChampion: string | string[] | undefined;
  divisionId?: string;
  periodDays: number;
  minimumMatches: number;
  maxContenders: number;
}

export interface RankingResult {
  playerId: string;
  rank: number;
  rankingScore: number;
  winPercentage: number;
  currentStreak: number;
  qualityScore: number;
  recencyScore: number;
  matchesInPeriod: number;
  winsInPeriod: number;
}

/** Internal representation of a completed match from DynamoDB. */
interface MatchRecord {
  matchId: string;
  date: string;
  participants: string[];
  winners: string[];
  losers: string[];
  status: string;
  seasonId?: string;
}

/** Aggregate win/loss totals for a single player within the ranking period. */
interface PlayerStats {
  wins: number;
  losses: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Calculate contender rankings for a given championship.
 *
 * The algorithm evaluates every player who has completed matches within the
 * ranking period by combining four weighted scoring components:
 *   - Base win percentage   (40%)
 *   - Current streak bonus  (20%)
 *   - Quality of wins       (25%)
 *   - Recency weighting     (15%)
 *
 * The current champion and players below the minimum-match threshold are
 * excluded from the results.
 */
export async function calculateRankingsForChampionship(
  params: RankingCalculationParams,
): Promise<RankingResult[]> {
  const {
    currentChampion,
    divisionId,
    periodDays = 30,
    minimumMatches = 3,
    maxContenders = 10,
  } = params;

  // ------------------------------------------------------------------
  // 1a. If championship is division-locked, fetch eligible player IDs
  // ------------------------------------------------------------------
  let divisionPlayerIds: Set<string> | null = null;
  if (divisionId) {
    const allPlayers = await dynamoDb.scanAll({
      TableName: TableNames.PLAYERS,
      FilterExpression: 'divisionId = :divisionId',
      ExpressionAttributeValues: { ':divisionId': divisionId },
    });
    divisionPlayerIds = new Set(
      allPlayers.map((p) => p.playerId as string),
    );
  }

  // ------------------------------------------------------------------
  // 1b. Fetch all completed matches within the ranking period
  // ------------------------------------------------------------------
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - periodDays);
  const periodStartISO = periodStart.toISOString();

  const allMatches = await dynamoDb.scanAll({
    TableName: TableNames.MATCHES,
    FilterExpression: '#status = :completed AND #date >= :periodStart',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#date': 'date',
    },
    ExpressionAttributeValues: {
      ':completed': 'completed',
      ':periodStart': periodStartISO,
    },
  });

  const matches: MatchRecord[] = allMatches as unknown as MatchRecord[];

  if (matches.length === 0) {
    return [];
  }

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

      if (match.winners.includes(playerId)) {
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
  const championIds = new Set<string>();
  if (currentChampion) {
    if (Array.isArray(currentChampion)) {
      currentChampion.forEach((id) => championIds.add(id));
    } else {
      championIds.add(currentChampion);
    }
  }

  // ------------------------------------------------------------------
  // 4. Score each eligible player
  // ------------------------------------------------------------------
  const scoredPlayers: RankingResult[] = [];

  for (const [playerId, playerMatches] of playerMatchMap.entries()) {
    // Exclude the current champion
    if (championIds.has(playerId)) {
      continue;
    }

    // Exclude players not in the championship's division
    if (divisionPlayerIds && !divisionPlayerIds.has(playerId)) {
      continue;
    }

    // Exclude players who have not met the minimum-match threshold
    if (playerMatches.length < minimumMatches) {
      continue;
    }

    const score = calculatePlayerScore(playerId, playerMatches, playerStats, periodDays);
    scoredPlayers.push(score);
  }

  // ------------------------------------------------------------------
  // 5. Rank by score descending and return the top N contenders
  // ------------------------------------------------------------------
  scoredPlayers.sort((a, b) => b.rankingScore - a.rankingScore);

  const topContenders = scoredPlayers.slice(0, maxContenders);

  // Assign final rank positions (1-indexed)
  for (let i = 0; i < topContenders.length; i++) {
    topContenders[i].rank = i + 1;
  }

  return topContenders;
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the composite ranking score for a single player.
 *
 * Scoring breakdown (each component normalized to 0-100, then weighted):
 *   winPercentage  * 0.40  -- raw win rate over the period
 *   streakBonus    * 0.20  -- reward current win streaks, penalise loss streaks
 *   qualityScore   * 0.25  -- average win-rate of defeated opponents
 *   recencyScore   * 0.15  -- exponentially-decayed weighting of recent results
 */
export function calculatePlayerScore(
  playerId: string,
  playerMatches: MatchRecord[],
  allPlayers: Map<string, PlayerStats>,
  periodDays: number,
): RankingResult {
  const wins = playerMatches.filter((m) => m.winners.includes(playerId));
  const totalMatches = playerMatches.length;

  // ----- Win Percentage (0-100) -----
  const winPercentage = Math.min((wins.length / totalMatches) * 100, 100);

  // ----- Streak Bonus (0-100) -----
  const streak = calculateCurrentStreak(playerMatches, playerId);
  let streakBonus: number;
  if (streak > 0) {
    // Win streak: 10 points per consecutive win, capped at 100
    streakBonus = Math.min(streak * 10, 100);
  } else {
    // Loss streak: -5 points per consecutive loss, floored at 0
    streakBonus = Math.max(streak * 5, 0); // streak is negative, so streak * 5 <= 0
  }

  // ----- Quality of Wins (0-100) -----
  // Average win percentage of all defeated opponents. If the player has no
  // wins in the period the quality score is 0.
  let qualityScore = 0;
  if (wins.length > 0) {
    let totalOpponentWinPct = 0;
    let opponentCount = 0;

    for (const match of wins) {
      for (const loserId of match.losers) {
        const opponentStats = allPlayers.get(loserId);
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
  // days ago it occurred. Wins contribute 1, losses contribute 0. The final
  // score is the weighted average scaled to 0-100.
  const now = new Date();
  let weightedWinSum = 0;
  let weightSum = 0;

  for (const match of playerMatches) {
    const matchDate = new Date(match.date);
    const daysSinceMatch = Math.max(
      (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24),
      0,
    );
    const weight = Math.exp(-daysSinceMatch / periodDays);

    const isWin = match.winners.includes(playerId) ? 1 : 0;
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
    playerId,
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
 *
 * Matches are sorted by date descending (most recent first) and we count
 * consecutive wins or losses from the top.
 *
 * Returns a positive number for a win streak (e.g. 4 means four consecutive
 * wins) and a negative number for a loss streak (e.g. -2 means two
 * consecutive losses).
 */
export function calculateCurrentStreak(
  matches: MatchRecord[],
  playerId: string,
): number {
  // Sort descending by date so the most recent match is first
  const sorted = [...matches].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  if (sorted.length === 0) {
    return 0;
  }

  // Determine direction from the most recent match
  const firstIsWin = sorted[0].winners.includes(playerId);
  let streak = 0;

  for (const match of sorted) {
    const isWin = match.winners.includes(playerId);
    if (isWin === firstIsWin) {
      streak += 1;
    } else {
      break;
    }
  }

  // Positive for wins, negative for losses
  return firstIsWin ? streak : -streak;
}
