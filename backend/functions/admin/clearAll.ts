import { APIGatewayProxyHandler } from 'aws-lambda';
import { getRepositories } from '../../lib/repositories';
import { success, serverError } from '../../lib/response';
import { requireSuperAdmin } from '../../lib/auth';

export const handler: APIGatewayProxyHandler = async (event) => {
  const denied = requireSuperAdmin(event);
  if (denied) return denied;

  try {
    const { clearAllData } = getRepositories();
    const results = await clearAllData();

    let totalErrors = 0;
    const deletedCounts: Record<string, number> = {};
    const errorCounts: Record<string, number> = {};

    for (const [key, { deleted, errors }] of Object.entries(results)) {
      deletedCounts[key] = deleted;
      if (errors > 0) {
        errorCounts[key] = errors;
        totalErrors += errors;
      }
    }

    const response: Record<string, unknown> = {
      message: totalErrors > 0
        ? `Data cleared with ${totalErrors} individual delete error(s)`
        : 'All data cleared successfully',
      deletedCounts,
    };
    if (totalErrors > 0) {
      response.errorCounts = errorCounts;
    }
    return success(response);
  } catch (err) {
    console.error('Error clearing all data:', err);
    return serverError('Failed to clear all data');
  }
};
