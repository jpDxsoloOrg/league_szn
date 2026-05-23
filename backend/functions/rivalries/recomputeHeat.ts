import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, badRequest, notFound, serverError } from '../../lib/response';
import { requireRole } from '../../lib/auth';
import { recomputeRivalryHeat } from '../../lib/services/recomputeRivalryHeat';

/**
 * POST /rivalry-requests/{rivalryId}/recompute-heat.
 *
 * Admin/Moderator-only manual refresh. Re-reads the rivalry's matches
 * and recomputes heatScore + heat tier from their persisted rating
 * aggregates. Useful after a manual edit to a match's rating fields or
 * after a data import where the rivalry row was written without the
 * derived heat.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireRole(event, 'Admin', 'Moderator');
  if (denied) return denied;

  try {
    const rivalryId = event.pathParameters?.rivalryId;
    if (!rivalryId) return badRequest('rivalryId is required');

    const { rivalries } = getRepositories();
    const rivalry = await rivalries.get(rivalryId);
    if (!rivalry) return notFound('Rivalry not found');

    const result = await recomputeRivalryHeat(rivalryId);
    return success({
      rivalryId,
      heatScore: result.heatScore,
      heat: result.heat,
      ratedMatchCount: result.ratedMatchCount,
    });
  } catch (err) {
    console.error('Error recomputing rivalry heat:', err);
    return serverError('Failed to recompute rivalry heat');
  }
};
