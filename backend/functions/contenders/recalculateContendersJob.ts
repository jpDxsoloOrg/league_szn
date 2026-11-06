import {
  recalculateContenderRankings,
  type RankingResultSummary,
} from '../../lib/services/recalculateContenderRankings';

/**
 * Scheduled recalculation of contender rankings for every active title, with
 * the service defaults and active overrides. A title that fails keeps its
 * existing rankings and is retried on the next run, so it doesn't fail the job.
 */
export const handler = async (): Promise<RankingResultSummary> => {
  const result = await recalculateContenderRankings();
  console.log('Contender ranking job complete:', JSON.stringify(result));
  return result;
};
