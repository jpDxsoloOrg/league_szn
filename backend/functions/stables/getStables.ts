import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { StableStatus } from '../../lib/repositories/types';
import { success, serverError } from '../../lib/response';
import { computeStableRecord, fetchCompletedMatches } from './computeStableStats';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;
    const { roster: { stables: stablesRepo } } = getRepositories();

    const [stables, matches] = await Promise.all([
      statusFilter
        ? stablesRepo.listByStatus(statusFilter as StableStatus)
        : stablesRepo.list(),
      fetchCompletedMatches(),
    ]);

    // Same record as detail and standings: computed from matches, never the stored counters.
    return success(
      stables.map((stable) => ({
        ...stable,
        ...computeStableRecord(matches, stable.memberIds || []),
      })),
    );
  } catch (err) {
    console.error('Error fetching stables:', err);
    return serverError('Failed to fetch stables');
  }
};
