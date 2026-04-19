import { Handler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { calculateRankingsForChampionship, RankingResult } from '../../lib/rankingCalculator';
import { applyOverrides, ActiveOverride, OverrideType, RankingWithOverride } from '../../lib/overrideApplicator';

interface RankingResultSummary {
  message: string;
  championshipsProcessed: number;
  championships: string[];
  totalRankings: number;
}

/**
 * Returns the ISO week key for the current date in the format
 * `{championshipId}#YYYY-WW`.
 */
function buildWeekKey(championshipId: string): string {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const daysSinceYearStart = Math.floor(
    (now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24),
  );
  const weekNumber = Math.ceil((daysSinceYearStart + yearStart.getDay() + 1) / 7);
  const paddedWeek = weekNumber.toString().padStart(2, '0');
  return `${championshipId}#${now.getFullYear()}-${paddedWeek}`;
}

interface ConfigOverrides {
  periodDays?: number;
  minimumMatches?: number;
  maxContenders?: number;
  divisionRestricted?: boolean;
}

async function calculateAllRankings(requestedChampionshipId?: string, configOverrides?: ConfigOverrides): Promise<RankingResultSummary> {
  const now = new Date().toISOString();
  const { competition: { championships: champRepo, contenders } } = getRepositories();

  // 1. Determine which championships to recalculate
  let championships: Array<{
    championshipId: string;
    name: string;
    type: 'singles' | 'tag';
    currentChampion?: string | string[];
    divisionId?: string;
    isActive?: boolean;
  }> = [];

  if (requestedChampionshipId) {
    const champ = await champRepo.findById(requestedChampionshipId);
    if (champ) {
      championships = [champ as typeof championships[number]];
    }
  } else {
    const active = await champRepo.listActive();
    championships = active as typeof championships;
  }

  if (championships.length === 0) {
    return {
      message: 'No championships found to recalculate',
      championshipsProcessed: 0,
      championships: [],
      totalRankings: 0,
    };
  }

  // 2. Process each championship
  let totalRankings = 0;
  const processedChampionships: string[] = [];

  for (const championship of championships) {
    const { championshipId } = championship;

    // 2a. Fetch existing rankings so we can preserve previousRank and peakRank
    const existingRankings = await contenders.listByChampionship(championshipId);

    const existingMap = new Map<string, typeof existingRankings[number]>();
    for (const existing of existingRankings) {
      existingMap.set(existing.playerId, existing);
    }

    // 2b. Delete all existing rankings for this championship
    await contenders.deleteAllForChampionship(championshipId);

    // 2c. Calculate new rankings (division-locked if championship has divisionId)
    const useDivisionId = configOverrides?.divisionRestricted === false
      ? undefined
      : (championship as { divisionId?: string }).divisionId;

    const rankings: RankingResult[] = await calculateRankingsForChampionship({
      championshipId,
      championshipType: championship.type,
      currentChampion: championship.currentChampion,
      divisionId: useDivisionId,
      periodDays: configOverrides?.periodDays ?? 30,
      minimumMatches: configOverrides?.minimumMatches ?? 3,
      maxContenders: configOverrides?.maxContenders ?? 10,
    });

    // 2d. Fetch active overrides for this championship
    const activeOverrides = await contenders.listActiveOverrides(championshipId);

    const validOverrides: ActiveOverride[] = activeOverrides
      .filter((o) => !o.expiresAt || o.expiresAt > now)
      .map((o) => ({
        playerId: o.playerId,
        overrideType: o.overrideType as OverrideType,
      }));

    // 2e. Apply overrides to rankings
    const adjustedRankings: RankingWithOverride[] = applyOverrides(rankings, validOverrides);

    // 2f. Write new rankings to contenders repository
    for (const ranking of adjustedRankings) {
      const oldData = existingMap.get(ranking.playerId);
      const previousRank = oldData ? oldData.rank : undefined;
      const oldPeakRank = oldData?.peakRank ?? Infinity;
      const peakRank = Math.min(oldPeakRank, ranking.rank);
      const weeksAtTop =
        ranking.rank === 1
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
        isOverridden: ranking.isOverridden || false,
        overrideType: ranking.overrideType || null,
        organicRank: ranking.organicRank || null,
      });
    }

    // 2g. Write ranking history entries
    const weekKey = buildWeekKey(championshipId);

    for (const ranking of adjustedRankings) {
      const oldData = existingMap.get(ranking.playerId);
      const previousRank = oldData ? oldData.rank : undefined;
      const movement = previousRank !== undefined ? previousRank - ranking.rank : 0;

      await contenders.writeHistory({
        playerId: ranking.playerId,
        weekKey,
        championshipId,
        rank: ranking.rank,
        rankingScore: ranking.rankingScore,
        movement,
        isOverridden: ranking.isOverridden || false,
        overrideType: ranking.overrideType || null,
        organicRank: ranking.organicRank || null,
      });
    }

    totalRankings += adjustedRankings.length;
    processedChampionships.push(championship.name || championshipId);
  }

  return {
    message: 'Rankings recalculated successfully',
    championshipsProcessed: processedChampionships.length,
    championships: processedChampionships,
    totalRankings,
  };
}

export const handler: Handler = async (event) => {
  try {
    // Async invocation (from recordResult via invokeAsync) — no requestContext
    const isAsyncInvocation = !event.requestContext;

    const body = isAsyncInvocation
      ? (event || {})
      : (event.body ? JSON.parse(event.body) : {});
    const requestedChampionshipId: string | undefined = body.championshipId;
    const configOverrides: ConfigOverrides = {
      periodDays: typeof body.rankingPeriodDays === 'number' ? body.rankingPeriodDays : undefined,
      minimumMatches: typeof body.minimumMatches === 'number' ? body.minimumMatches : undefined,
      maxContenders: typeof body.maxContenders === 'number' ? body.maxContenders : undefined,
      divisionRestricted: typeof body.divisionRestricted === 'boolean' ? body.divisionRestricted : undefined,
    };

    const result = await calculateAllRankings(requestedChampionshipId, configOverrides);

    // For async invocations, just return the plain result (no API Gateway response wrapper)
    if (isAsyncInvocation) {
      console.log('Async ranking recalculation complete:', JSON.stringify(result));
      return result;
    }

    return success(result);
  } catch (err) {
    console.error('Error calculating rankings:', err);

    // For async invocations, re-throw so Lambda marks it as failed
    if (!event.requestContext) {
      throw err;
    }

    return serverError('Failed to calculate rankings');
  }
};
