import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import type { StableStatus } from '../../lib/repositories/types';
import { success, serverError } from '../../lib/response';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const statusFilter = event.queryStringParameters?.status;
    const { stables: stablesRepo } = getRepositories();

    const stables = statusFilter
      ? await stablesRepo.listByStatus(statusFilter as StableStatus)
      : await stablesRepo.list();

    return success(stables);
  } catch (err) {
    console.error('Error fetching stables:', err);
    return serverError('Failed to fetch stables');
  }
};
