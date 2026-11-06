import { getRepositories } from '../repositories';
import { calculateRankingsForChampionship, RankingResult } from '../rankingCalculator';
import { applyOverrides, ActiveOverride, OverrideType, RankingWithOverride } from '../overrideApplicator';

export interface RankingResultSummary {
  message: string;
  championshipsProcessed: number;
  championships: string[];
  championshipsFailed: number;
  failedChampionships: string[];
  totalRankings: number;
}

export interface ConfigOverrides {
  minimumMatches?: number;
  maxContenders?: number;
  divisionRestricted?: boolean;
}

interface RankableChampionship {
  championshipId: string;
  name: string;
  type: 'singles' | 'tag';
  currentChampion?: string | string[];
  divisionId?: string;
  isActive?: boolean;
}

/** The year and week of `date`, in the format `YYYY-WW`. */
function weekPeriod(date: Date): string {
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const daysSinceYearStart = Math.floor(
    (date.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  const weekNumber = Math.ceil((daysSinceYearStart + yearStart.getDay() + 1) / 7);
  const paddedWeek = weekNumber.toString().padStart(2, '0');
  return `${date.getFullYear()}-${paddedWeek}`;
}

/**
 * Recalculates and stores one title's rankings. Everything that can fail on a
 * read happens before the first write, and rows are replaced rather than
 * cleared first, so a failure leaves the existing rankings in place.
 */
async function recalculateChampionship(
  championship: RankableChampionship,
  seasonId: string,
  configOverrides?: ConfigOverrides,
): Promise<number> {
  const { competition: { contenders } } = getRepositories();
  const { championshipId } = championship;
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const currentWeek = weekPeriod(nowDate);

  // Existing rankings supply previousRank, peakRank and weeksAtTop
  const existingRankings = await contenders.listByChampionship(championshipId);
  const existingMap = new Map(existingRankings.map((existing) => [existing.playerId, existing]));

  // Calculate new rankings (division-locked if championship has divisionId)
  const useDivisionId = configOverrides?.divisionRestricted === false
    ? undefined
    : championship.divisionId;

  const rankings: RankingResult[] = await calculateRankingsForChampionship({
    championshipId,
    championshipType: championship.type,
    currentChampion: championship.currentChampion,
    divisionId: useDivisionId,
    seasonId,
    minimumMatches: configOverrides?.minimumMatches ?? 3,
    maxContenders: configOverrides?.maxContenders ?? 10,
  });

  const activeOverrides = await contenders.listActiveOverrides(championshipId);

  const validOverrides: ActiveOverride[] = activeOverrides
    .filter((o) => !o.expiresAt || o.expiresAt > now)
    .map((o) => ({
      playerId: o.playerId,
      overrideType: o.overrideType as OverrideType,
    }));

  const adjustedRankings: RankingWithOverride[] = applyOverrides(rankings, validOverrides);

  const weekKey = `${championshipId}#${currentWeek}`;

  for (const ranking of adjustedRankings) {
    const oldData = existingMap.get(ranking.playerId);

    // Runs are frequent, so an unchanged rank keeps its last movement rather
    // than resetting it to zero.
    const previousRank = oldData?.rank === ranking.rank
      ? (oldData.previousRank ?? oldData.rank)
      : oldData?.rank;
    const oldPeakRank = oldData?.peakRank ?? Infinity;
    const peakRank = Math.min(oldPeakRank, ranking.rank);

    // Counts weeks, not runs: a player already counted this week isn't counted
    // again, even if they lost #1 and took it back. Rows from before
    // lastTopWeek existed fall back to their last run.
    const alreadyCountedThisWeek = oldData?.lastTopWeek === currentWeek || (
      oldData?.rank === 1
      && Boolean(oldData.calculatedAt)
      && weekPeriod(new Date(oldData.calculatedAt)) === currentWeek
    );
    const weeksAtTop = ranking.rank === 1 && !alreadyCountedThisWeek
      ? (oldData?.weeksAtTop ?? 0) + 1
      : (oldData?.weeksAtTop ?? 0);

    await contenders.upsertRanking({
      championshipId,
      playerId: ranking.playerId,
      rank: ranking.rank,
      rankingScore: ranking.rankingScore,
      winPercentage: ranking.winPercentage,
      currentStreak: ranking.currentStreak,
      qualityScore: ranking.qualityScore,
      recencyScore: ranking.recencyScore,
      matchesInPeriod: ranking.matchesInPeriod,
      winsInPeriod: ranking.winsInPeriod,
      previousRank: previousRank ?? null,
      peakRank,
      weeksAtTop,
      lastTopWeek: ranking.rank === 1 ? currentWeek : oldData?.lastTopWeek,
      isOverridden: ranking.isOverridden || false,
      overrideType: ranking.overrideType || null,
      organicRank: ranking.organicRank || null,
    });

    await contenders.writeHistory({
      playerId: ranking.playerId,
      weekKey,
      championshipId,
      rank: ranking.rank,
      rankingScore: ranking.rankingScore,
      movement: previousRank !== undefined ? previousRank - ranking.rank : 0,
      isOverridden: ranking.isOverridden || false,
      overrideType: ranking.overrideType || null,
      organicRank: ranking.organicRank || null,
    });
  }

  // Only now that the new rows are stored, remove players who dropped out.
  const rankedPlayerIds = new Set(adjustedRankings.map((ranking) => ranking.playerId));
  for (const existing of existingRankings) {
    if (!rankedPlayerIds.has(existing.playerId)) {
      await contenders.deleteRanking(championshipId, existing.playerId);
    }
  }

  return adjustedRankings.length;
}

/**
 * Recalculates contender rankings for one title, or every active title, in the
 * active season. Titles run one at a time. One that fails is logged and
 * reported in the summary, and the others still save.
 */
export async function recalculateContenderRankings(
  requestedChampionshipId?: string,
  configOverrides?: ConfigOverrides,
): Promise<RankingResultSummary> {
  const {
    competition: { championships: champRepo },
    season: { seasons },
  } = getRepositories();

  const emptySummary = (message: string): RankingResultSummary => ({
    message,
    championshipsProcessed: 0,
    championships: [],
    championshipsFailed: 0,
    failedChampionships: [],
    totalRankings: 0,
  });

  // Rankings are scoped to the current (active) season. If there is no
  // active season, there is nothing to rank.
  const activeSeason = await seasons.findActive();
  if (!activeSeason) {
    return emptySummary('No active season — rankings cannot be calculated');
  }

  let championships: RankableChampionship[] = [];

  if (requestedChampionshipId) {
    const champ = await champRepo.findById(requestedChampionshipId);
    if (champ) {
      championships = [champ as RankableChampionship];
    }
  } else {
    championships = (await champRepo.listActive()) as RankableChampionship[];
  }

  if (championships.length === 0) {
    return emptySummary('No championships found to recalculate');
  }

  let totalRankings = 0;
  const processedChampionships: string[] = [];
  const failedChampionships: string[] = [];

  for (const championship of championships) {
    const label = championship.name || championship.championshipId;
    try {
      totalRankings += await recalculateChampionship(championship, activeSeason.seasonId, configOverrides);
      processedChampionships.push(label);
    } catch (err) {
      failedChampionships.push(label);
      console.error(`Failed to recalculate rankings for ${championship.championshipId}:`, err);
    }
  }

  return {
    message: failedChampionships.length === 0
      ? 'Rankings recalculated successfully'
      : `Rankings recalculated, but ${failedChampionships.length} of ${championships.length} titles failed`,
    championshipsProcessed: processedChampionships.length,
    championships: processedChampionships,
    championshipsFailed: failedChampionships.length,
    failedChampionships,
    totalRankings,
  };
}
